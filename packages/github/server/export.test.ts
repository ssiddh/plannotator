import { describe, test, expect, mock, beforeEach } from "bun:test";
import { generatePlanHash } from "../shared/planHash.ts";
import { mapAnnotationsToComments, submitBatchReview, exportPlanWithAnnotations } from "./export.ts";

describe("generatePlanHash (integration)", () => {
  test("returns 64-char hex string", async () => {
    const hash = await generatePlanHash("# Test Plan");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("is deterministic", async () => {
    const hash1 = await generatePlanHash("# Test Plan");
    const hash2 = await generatePlanHash("# Test Plan");
    expect(hash1).toBe(hash2);
  });
});

describe("mapAnnotationsToComments", () => {
  const blocks = [
    { id: "block-0", startLine: 1 },
    { id: "block-1", startLine: 5 },
    { id: "block-2", startLine: 10 },
  ];

  test("COMMENT annotation maps to line comment with text", () => {
    const annotations = [
      {
        id: "ann-1",
        blockId: "block-1",
        type: "COMMENT" as const,
        text: "This needs clarification",
        originalText: "some selected text",
      },
    ];

    const result = mapAnnotationsToComments(annotations, blocks, "plans/abc.md");

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      path: "plans/abc.md",
      line: 5,
      side: "RIGHT",
      body: "This needs clarification",
    });
  });

  test("DELETION annotation produces suggestion block", () => {
    const annotations = [
      {
        id: "ann-2",
        blockId: "block-1",
        type: "DELETION" as const,
        originalText: "text to delete",
      },
    ];

    const result = mapAnnotationsToComments(annotations, blocks, "plans/abc.md");

    expect(result).toHaveLength(1);
    expect(result[0].body).toContain("```suggestion");
    expect(result[0].body).toContain("text to delete");
    expect(result[0].line).toBe(5);
    expect(result[0].side).toBe("RIGHT");
  });

  test("GLOBAL_COMMENT annotation is filtered out", () => {
    const annotations = [
      {
        id: "ann-3",
        blockId: "block-0",
        type: "GLOBAL_COMMENT" as const,
        text: "General feedback",
        originalText: "",
      },
    ];

    const result = mapAnnotationsToComments(annotations, blocks, "plans/abc.md");

    expect(result).toHaveLength(0);
  });

  test("missing block defaults to line 1", () => {
    const annotations = [
      {
        id: "ann-4",
        blockId: "nonexistent-block",
        type: "COMMENT" as const,
        text: "Comment on missing block",
        originalText: "some text",
      },
    ];

    const result = mapAnnotationsToComments(annotations, blocks, "plans/abc.md");

    expect(result).toHaveLength(1);
    expect(result[0].line).toBe(1);
  });

  test("annotation with images exports text only (D-07)", () => {
    const annotations = [
      {
        id: "ann-5",
        blockId: "block-2",
        type: "COMMENT" as const,
        text: "See the attached image",
        originalText: "some text",
        images: [{ path: "/tmp/screenshot.png", name: "screenshot" }],
      },
    ];

    const result = mapAnnotationsToComments(annotations, blocks, "plans/abc.md");

    expect(result).toHaveLength(1);
    expect(result[0].body).toBe("See the attached image");
    expect(result[0].line).toBe(10);
    expect(result[0].body).not.toContain("screenshot");
    expect(result[0].body).not.toContain("/tmp/");
  });

  test("multiple annotations on same line each get their own comment (D-08)", () => {
    const annotations = [
      {
        id: "ann-6",
        blockId: "block-1",
        type: "COMMENT" as const,
        text: "First comment",
        originalText: "text",
      },
      {
        id: "ann-7",
        blockId: "block-1",
        type: "COMMENT" as const,
        text: "Second comment",
        originalText: "text",
      },
    ];

    const result = mapAnnotationsToComments(annotations, blocks, "plans/abc.md");

    expect(result).toHaveLength(2);
    expect(result[0].body).toBe("First comment");
    expect(result[1].body).toBe("Second comment");
  });
});

describe("submitBatchReview", () => {
  let fetchCalls: Array<{ url: string; method: string; body: any }>;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    fetchCalls = [];
    originalFetch = globalThis.fetch;
    // Mock githubRequest's underlying fetch
    globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method || "GET";
      const body = init?.body ? JSON.parse(init.body as string) : undefined;
      fetchCalls.push({ url, method, body });
      return new Response(JSON.stringify({ id: 12345 }), {
        headers: { "Content-Type": "application/json" },
      });
    };
  });

  test("calls GitHub reviews API with POST and COMMENT event", async () => {
    const comments = [
      { path: "plans/test.md", line: 5, side: "RIGHT" as const, body: "Nice" },
    ];

    await submitBatchReview("owner", "repo", 42, "token123", comments);

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toContain("/repos/owner/repo/pulls/42/reviews");
    expect(fetchCalls[0].method).toBe("POST");
    expect(fetchCalls[0].body.event).toBe("COMMENT");
    expect(fetchCalls[0].body.comments).toEqual(comments);

    globalThis.fetch = originalFetch;
  });

  test("submits review with just body when comments array is empty", async () => {
    await submitBatchReview("owner", "repo", 42, "token123", [], "Review body only");

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].body.body).toBe("Review body only");
    expect(fetchCalls[0].body.comments).toBeUndefined();
    expect(fetchCalls[0].body.event).toBe("COMMENT");

    globalThis.fetch = originalFetch;
  });

  test("includes review body when provided with comments", async () => {
    const comments = [
      { path: "plans/test.md", line: 1, side: "RIGHT" as const, body: "Fix this" },
    ];

    await submitBatchReview("owner", "repo", 42, "token123", comments, "Overall feedback");

    expect(fetchCalls[0].body.body).toBe("Overall feedback");
    expect(fetchCalls[0].body.comments).toEqual(comments);

    globalThis.fetch = originalFetch;
  });
});

describe("exportPlanWithAnnotations", () => {
  let fetchCalls: Array<{ url: string; method: string; body: any }>;
  let originalFetch: typeof globalThis.fetch;
  let mockKv: { store: Map<string, string>; get: any; put: any };

  beforeEach(() => {
    fetchCalls = [];
    originalFetch = globalThis.fetch;

    mockKv = {
      store: new Map(),
      async get(key: string) {
        return this.store.get(key) || null;
      },
      async put(key: string, value: string, _opts?: any) {
        this.store.set(key, value);
      },
    };
  });

  function setupFetchMock(options?: { failReview?: boolean }) {
    let callIndex = 0;
    globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method || "GET";
      const body = init?.body ? JSON.parse(init.body as string) : undefined;
      fetchCalls.push({ url, method, body });

      // exportToPR makes multiple calls: get ref, create blob, get commit, create tree, create commit, create ref, create PR
      if (url.includes("/git/ref/heads/")) {
        return new Response(JSON.stringify({ object: { sha: "base-sha-123" } }));
      }
      if (url.includes("/git/blobs")) {
        return new Response(JSON.stringify({ sha: "blob-sha-123" }));
      }
      if (url.includes("/git/commits/base-sha-123")) {
        return new Response(JSON.stringify({ tree: { sha: "tree-sha-123" } }));
      }
      if (url.includes("/git/trees")) {
        return new Response(JSON.stringify({ sha: "new-tree-sha" }));
      }
      if (url.includes("/git/commits") && method === "POST") {
        return new Response(JSON.stringify({ sha: "new-commit-sha" }));
      }
      if (url.includes("/git/refs") && method === "POST") {
        return new Response(JSON.stringify({ ref: "refs/heads/plan/test123" }));
      }
      if (url.includes("/pulls") && method === "POST" && !url.includes("/reviews")) {
        return new Response(JSON.stringify({
          number: 99,
          html_url: "https://github.com/owner/repo/pull/99",
          created_at: "2026-04-02T00:00:00Z",
        }));
      }
      if (url.includes("/reviews") && method === "POST") {
        if (options?.failReview) {
          return new Response("Review submission failed", { status: 422 });
        }
        return new Response(JSON.stringify({
          id: 555,
          body: "review body",
          comments: [{ id: 1001 }, { id: 1002 }],
        }));
      }
      if (url.includes("/git/refs/heads/") && method === "DELETE") {
        return new Response(null, { status: 204 });
      }
      return new Response(JSON.stringify({}));
    };
  }

  test("calls exportToPR then submitBatchReview then stores metadata to KV", async () => {
    setupFetchMock();

    const annotations = [
      { id: "ann-1", blockId: "b-0", type: "COMMENT" as const, text: "Good point", originalText: "text" },
    ];
    const blocks = [{ id: "b-0", startLine: 3 }];
    const config = { defaultRepo: "owner/repo", prBaseBranch: "main" };

    const result = await exportPlanWithAnnotations(
      "test123", "# Plan", annotations, blocks, "token", config, mockKv
    );

    expect(result.pr_number).toBe(99);
    expect(result.pr_url).toBe("https://github.com/owner/repo/pull/99");
    expect(result.planHash).toMatch(/^[0-9a-f]{64}$/);

    // Verify KV storage
    const stored = mockKv.store.get("sync:test123:pr");
    expect(stored).toBeDefined();
    const parsed = JSON.parse(stored!);
    expect(parsed.pr_number).toBe(99);
    expect(parsed.planHash).toMatch(/^[0-9a-f]{64}$/);

    // Verify review submission happened
    const reviewCalls = fetchCalls.filter(c => c.url.includes("/reviews"));
    expect(reviewCalls.length).toBeGreaterThanOrEqual(1);

    globalThis.fetch = originalFetch;
  });

  test("rolls back branch on review submission failure", async () => {
    setupFetchMock({ failReview: true });

    const annotations = [
      { id: "ann-1", blockId: "b-0", type: "COMMENT" as const, text: "Comment", originalText: "text" },
    ];
    const blocks = [{ id: "b-0", startLine: 1 }];
    const config = { defaultRepo: "owner/repo", prBaseBranch: "main" };

    await expect(
      exportPlanWithAnnotations("test123", "# Plan", annotations, blocks, "token", config, mockKv)
    ).rejects.toThrow();

    // Verify rollback: DELETE refs call should exist
    const deleteCalls = fetchCalls.filter(c => c.url.includes("/git/refs/heads/") && c.method === "DELETE");
    expect(deleteCalls.length).toBeGreaterThanOrEqual(1);

    globalThis.fetch = originalFetch;
  });

  test("skips review submission when only GLOBAL_COMMENTs exist (no line comments)", async () => {
    setupFetchMock();

    const annotations = [
      { id: "ann-g", blockId: "b-0", type: "GLOBAL_COMMENT" as const, text: "Overall looks good", originalText: "" },
    ];
    const blocks = [{ id: "b-0", startLine: 1 }];
    const config = { defaultRepo: "owner/repo", prBaseBranch: "main" };

    const result = await exportPlanWithAnnotations(
      "test123", "# Plan", annotations, blocks, "token", config, mockKv
    );

    expect(result.pr_number).toBe(99);

    // Review should still be submitted (with body text from global comments)
    const reviewCalls = fetchCalls.filter(c => c.url.includes("/reviews"));
    expect(reviewCalls).toHaveLength(1);
    expect(reviewCalls[0].body.body).toContain("Overall looks good");
    // But no comments array (global comments go to review body)
    expect(reviewCalls[0].body.comments).toBeUndefined();

    globalThis.fetch = originalFetch;
  });

  test("stores sync state after successful export", async () => {
    setupFetchMock();

    const annotations = [
      { id: "ann-1", blockId: "b-0", type: "COMMENT" as const, text: "note", originalText: "text" },
    ];
    const blocks = [{ id: "b-0", startLine: 1 }];
    const config = { defaultRepo: "owner/repo", prBaseBranch: "main" };

    await exportPlanWithAnnotations("test123", "# Plan", annotations, blocks, "token", config, mockKv);

    // Verify sync state stored
    const syncState = mockKv.store.get("sync:test123:state");
    expect(syncState).toBeDefined();
    const parsed = JSON.parse(syncState!);
    expect(parsed.lastSyncDirection).toBe("outbound");

    globalThis.fetch = originalFetch;
  });
});
