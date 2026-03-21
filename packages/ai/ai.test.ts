import { describe, test, expect } from "bun:test";
import { SessionManager } from "./session-manager.ts";
import { buildSystemPrompt, buildForkPreamble } from "./context.ts";
import {
  registerProvider,
  getProvider,
  getDefaultProvider,
  listProviders,
  unregisterProvider,
  disposeAll,
  registerProviderFactory,
  createProvider,
} from "./provider.ts";
import { createAIEndpoints } from "./endpoints.ts";
import type {
  AIProvider,
  AISession,
  AIMessage,
  AIContext,
} from "./types.ts";

// ---------------------------------------------------------------------------
// Helpers — mock provider/session for testing
// ---------------------------------------------------------------------------

function mockSession(
  id: string,
  parentSessionId: string | null = null
): AISession {
  let active = false;
  return {
    get id() {
      return id;
    },
    parentSessionId,
    get isActive() {
      return active;
    },
    async *query(prompt: string): AsyncIterable<AIMessage> {
      active = true;
      yield { type: "text_delta", delta: `Echo: ${prompt}` };
      yield {
        type: "result",
        sessionId: id,
        success: true,
        result: `Echo: ${prompt}`,
      };
      active = false;
    },
    abort() {
      active = false;
    },
  };
}

let sessionCounter = 0;

function mockProvider(name = "mock"): AIProvider {
  return {
    name,
    capabilities: { fork: true, resume: true, streaming: true, tools: false },
    async createSession(opts) {
      return mockSession(`session-${++sessionCounter}`, null);
    },
    async forkSession(opts) {
      const parent = opts.context.parent;
      return mockSession(
        `forked-${++sessionCounter}`,
        parent?.sessionId ?? null
      );
    },
    async resumeSession(sessionId) {
      return mockSession(sessionId, null);
    },
    dispose() {},
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SessionManager", () => {
  test("tracks sessions and lists them newest-first", () => {
    const sm = new SessionManager();
    const s1 = mockSession("s1");
    const s2 = mockSession("s2");

    const e1 = sm.track(s1, "plan-review", "First");
    const e2 = sm.track(s2, "code-review", "Second");
    // Force different timestamps to avoid same-ms ambiguity
    e1.lastActiveAt = 1000;
    e2.lastActiveAt = 2000;

    expect(sm.size).toBe(2);
    const list = sm.list();
    expect(list[0].session.id).toBe("s2"); // newest first
    expect(list[1].session.id).toBe("s1");
  });

  test("get returns entry by ID", () => {
    const sm = new SessionManager();
    sm.track(mockSession("s1"), "plan-review");
    expect(sm.get("s1")?.session.id).toBe("s1");
    expect(sm.get("nonexistent")).toBeUndefined();
  });

  test("touch updates lastActiveAt", async () => {
    const sm = new SessionManager();
    sm.track(mockSession("s1"), "plan-review");
    const before = sm.get("s1")!.lastActiveAt;

    await new Promise((r) => setTimeout(r, 10));
    sm.touch("s1");

    expect(sm.get("s1")!.lastActiveAt).toBeGreaterThan(before);
  });

  test("remove removes entry", () => {
    const sm = new SessionManager();
    sm.track(mockSession("s1"), "plan-review");
    sm.remove("s1");
    expect(sm.size).toBe(0);
  });

  test("forksOf filters by parent", () => {
    const sm = new SessionManager();
    sm.track(mockSession("s1"), "plan-review");
    sm.track(mockSession("fork1", "parent-123"), "plan-review");
    sm.track(mockSession("fork2", "parent-123"), "plan-review");
    sm.track(mockSession("fork3", "other-parent"), "code-review");

    const forks = sm.forksOf("parent-123");
    expect(forks.length).toBe(2);
    expect(forks.map((f) => f.session.id).sort()).toEqual(["fork1", "fork2"]);
  });

  test("evicts oldest idle session when maxSessions reached", () => {
    const sm = new SessionManager({ maxSessions: 2 });
    sm.track(mockSession("s1"), "plan-review");
    sm.track(mockSession("s2"), "plan-review");
    sm.track(mockSession("s3"), "plan-review"); // should evict s1

    expect(sm.size).toBe(2);
    expect(sm.get("s1")).toBeUndefined();
    expect(sm.get("s2")).toBeDefined();
    expect(sm.get("s3")).toBeDefined();
  });

  test("disposeAll aborts active sessions and clears", () => {
    const sm = new SessionManager();
    const s1 = mockSession("s1");
    sm.track(s1, "plan-review");
    sm.disposeAll();
    expect(sm.size).toBe(0);
  });
});

describe("Context builders", () => {
  test("buildSystemPrompt for plan-review", () => {
    const ctx: AIContext = {
      mode: "plan-review",
      plan: { plan: "# My Plan\n\nStep 1: do things" },
    };
    const prompt = buildSystemPrompt(ctx);
    expect(prompt).toContain("plan review tool");
    expect(prompt).toContain("# My Plan");
    expect(prompt).toContain("Step 1: do things");
  });

  test("buildSystemPrompt for code-review", () => {
    const ctx: AIContext = {
      mode: "code-review",
      review: { patch: "diff --git a/foo.ts b/foo.ts\n+hello" },
    };
    const prompt = buildSystemPrompt(ctx);
    expect(prompt).toContain("code review tool");
    expect(prompt).toContain("diff --git");
  });

  test("buildSystemPrompt for annotate", () => {
    const ctx: AIContext = {
      mode: "annotate",
      annotate: { content: "# Doc\nSome content", filePath: "/tmp/test.md" },
    };
    const prompt = buildSystemPrompt(ctx);
    expect(prompt).toContain("annotation tool");
    expect(prompt).toContain("/tmp/test.md");
  });

  test("buildForkPreamble includes context and instructions", () => {
    const ctx: AIContext = {
      mode: "plan-review",
      plan: {
        plan: "# Plan\nDetails here",
        annotations: "- Remove section 3",
      },
      parent: { sessionId: "parent-123", cwd: "/project" },
    };
    const preamble = buildForkPreamble(ctx);
    expect(preamble).toContain("reviewing your work in Plannotator");
    expect(preamble).toContain("# Plan");
    expect(preamble).toContain("Remove section 3");
  });

  test("buildForkPreamble for code-review with selected code", () => {
    const ctx: AIContext = {
      mode: "code-review",
      review: {
        patch: "+new line",
        filePath: "src/auth.ts",
        selectedCode: "function verify()",
        lineRange: { start: 10, end: 15, side: "new" },
      },
      parent: { sessionId: "p", cwd: "/proj" },
    };
    const preamble = buildForkPreamble(ctx);
    expect(preamble).toContain("src/auth.ts");
    expect(preamble).toContain("function verify()");
    expect(preamble).toContain("Lines 10-15");
  });

  test("truncates very long plans", () => {
    const longPlan = "x".repeat(100_000);
    const ctx: AIContext = {
      mode: "plan-review",
      plan: { plan: longPlan },
    };
    const prompt = buildSystemPrompt(ctx);
    expect(prompt).toContain("[truncated for context window]");
    expect(prompt.length).toBeLessThan(longPlan.length);
  });
});

describe("Provider registry", () => {
  test("register, get, list, unregister", () => {
    disposeAll(); // clean state

    const p = mockProvider("test-provider");
    registerProvider(p);

    expect(getProvider("test-provider")).toBe(p);
    expect(getDefaultProvider()).toBe(p);
    expect(listProviders()).toEqual(["test-provider"]);

    unregisterProvider("test-provider");
    expect(getProvider("test-provider")).toBeUndefined();
    expect(listProviders()).toEqual([]);
  });

  test("createProvider via factory", async () => {
    disposeAll();

    registerProviderFactory("test-type", async (config) => {
      return mockProvider(config.type);
    });

    const provider = await createProvider({ type: "test-type" });
    expect(provider.name).toBe("test-type");
    expect(getProvider("test-type")).toBe(provider);

    disposeAll();
  });

  test("createProvider throws for unknown type", async () => {
    disposeAll();
    await expect(createProvider({ type: "unknown" })).rejects.toThrow(
      "No AI provider factory"
    );
  });
});

describe("AI endpoints", () => {
  test("capabilities returns available: false when no provider", async () => {
    disposeAll();
    const sm = new SessionManager();
    const endpoints = createAIEndpoints({ sessionManager: sm });

    const res = await endpoints["/api/ai/capabilities"](new Request("http://localhost/api/ai/capabilities"));
    const data = await res.json();
    expect(data.available).toBe(false);
    expect(data.provider).toBeNull();
  });

  test("capabilities returns provider info when registered", async () => {
    disposeAll();
    registerProvider(mockProvider("mock"));
    const sm = new SessionManager();
    const endpoints = createAIEndpoints({ sessionManager: sm });

    const res = await endpoints["/api/ai/capabilities"](new Request("http://localhost/api/ai/capabilities"));
    const data = await res.json();
    expect(data.available).toBe(true);
    expect(data.provider).toBe("mock");
    expect(data.capabilities.fork).toBe(true);

    disposeAll();
  });

  test("session creation and query flow", async () => {
    disposeAll();
    registerProvider(mockProvider("mock"));
    const sm = new SessionManager();
    const endpoints = createAIEndpoints({ sessionManager: sm });

    // Create session
    const createRes = await endpoints["/api/ai/session"](
      new Request("http://localhost/api/ai/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: { mode: "plan-review", plan: { plan: "# Test" } },
        }),
      })
    );
    const createData = (await createRes.json()) as { sessionId: string };
    expect(createData.sessionId).toBeDefined();
    expect(sm.size).toBe(1);

    // Query
    const queryRes = await endpoints["/api/ai/query"](
      new Request("http://localhost/api/ai/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: createData.sessionId,
          prompt: "What is this plan about?",
        }),
      })
    );
    expect(queryRes.headers.get("Content-Type")).toBe("text/event-stream");

    // Read SSE stream
    const text = await queryRes.text();
    expect(text).toContain("Echo: What is this plan about?");
    expect(text).toContain("[DONE]");

    disposeAll();
  });

  test("abort endpoint", async () => {
    disposeAll();
    registerProvider(mockProvider("mock"));
    const sm = new SessionManager();
    const endpoints = createAIEndpoints({ sessionManager: sm });

    // Create session
    const createRes = await endpoints["/api/ai/session"](
      new Request("http://localhost/api/ai/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: { mode: "plan-review", plan: { plan: "# Test" } },
        }),
      })
    );
    const { sessionId } = (await createRes.json()) as { sessionId: string };

    // Abort
    const abortRes = await endpoints["/api/ai/abort"](
      new Request("http://localhost/api/ai/abort", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      })
    );
    const abortData = (await abortRes.json()) as { ok: boolean };
    expect(abortData.ok).toBe(true);

    disposeAll();
  });

  test("sessions list endpoint", async () => {
    disposeAll();
    registerProvider(mockProvider("mock"));
    const sm = new SessionManager();
    const endpoints = createAIEndpoints({ sessionManager: sm });

    // Create two sessions
    await endpoints["/api/ai/session"](
      new Request("http://localhost/api/ai/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: { mode: "plan-review", plan: { plan: "# A" } },
        }),
      })
    );
    await endpoints["/api/ai/session"](
      new Request("http://localhost/api/ai/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: { mode: "code-review", review: { patch: "+x" } },
        }),
      })
    );

    const listRes = await endpoints["/api/ai/sessions"](
      new Request("http://localhost/api/ai/sessions")
    );
    const sessions = (await listRes.json()) as Array<{ mode: string }>;
    expect(sessions.length).toBe(2);

    disposeAll();
  });
});
