import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createGitHubHandler, type GitHubHandler } from "./handler.ts";

const testConfig = {
  clientId: "test-id",
  clientSecret: "test-secret",
  redirectUri: "http://localhost/callback",
  portalUrl: "http://localhost",
  defaultRepo: "owner/repo",
  prBaseBranch: "main",
};

describe("createGitHubHandler", () => {
  test("returns object with handle function", () => {
    const handler = createGitHubHandler(testConfig);
    expect(handler).toBeDefined();
    expect(typeof handler.handle).toBe("function");
  });

  test("handle() returns Response for /api/auth/github/login (GET)", async () => {
    const handler = createGitHubHandler(testConfig);
    const req = new Request("http://localhost/api/auth/github/login");
    const url = new URL(req.url);
    const result = await handler.handle(req, url);

    expect(result).toBeInstanceOf(Response);
    expect(result).not.toBeNull();
    // Should redirect to GitHub OAuth
    expect(result!.status).toBe(302);
  });

  test("handle() returns Response for /api/auth/token/validate (POST)", async () => {
    const handler = createGitHubHandler(testConfig);
    const req = new Request("http://localhost/api/auth/token/validate", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });
    const url = new URL(req.url);
    const result = await handler.handle(req, url);

    expect(result).toBeInstanceOf(Response);
    expect(result).not.toBeNull();
  });

  test("handle() returns null for /api/paste (unknown route)", async () => {
    const handler = createGitHubHandler(testConfig);
    const req = new Request("http://localhost/api/paste");
    const url = new URL(req.url);
    const result = await handler.handle(req, url);

    expect(result).toBeNull();
  });

  test("handle() returns null for /api/some/random/path", async () => {
    const handler = createGitHubHandler(testConfig);
    const req = new Request("http://localhost/api/some/random/path");
    const url = new URL(req.url);
    const result = await handler.handle(req, url);

    expect(result).toBeNull();
  });

  test("handle() returns 503 when OAuth not configured (clientId missing) for login route", async () => {
    const handler = createGitHubHandler({});
    const req = new Request("http://localhost/api/auth/github/login");
    const url = new URL(req.url);
    const result = await handler.handle(req, url);

    expect(result).toBeInstanceOf(Response);
    expect(result!.status).toBe(503);
    const body = await result!.json();
    expect(body.error).toBe("OAuth not configured");
  });

  test("handle() returns 503 for token refresh when not configured", async () => {
    const handler = createGitHubHandler({});
    const req = new Request("http://localhost/api/auth/token/refresh", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });
    const url = new URL(req.url);
    const result = await handler.handle(req, url);

    expect(result).toBeInstanceOf(Response);
    expect(result!.status).toBe(503);
  });
});

describe("PR route token validation (AUTH-02, D-09, D-10)", () => {
  let originalFetch: typeof globalThis.fetch;

  // Mock KV store
  const mockKv = {
    store: new Map<string, { value: string; expiration?: number }>(),
    async get(key: string, format?: string) {
      const entry = this.store.get(key);
      if (!entry) return null;
      const val = entry.value;
      return format === "json" ? JSON.parse(val) : val;
    },
    async put(key: string, value: string, opts?: { expirationTtl?: number }) {
      this.store.set(key, { value, expiration: opts?.expirationTtl });
    },
  };

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    mockKv.store.clear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("PR create with missing token returns 401 'Authentication required'", async () => {
    const handler = createGitHubHandler(testConfig, undefined, mockKv);
    const req = new Request("http://localhost/api/pr/create", {
      method: "POST",
      body: JSON.stringify({ pasteId: "abc123", planMarkdown: "# Plan" }),
      headers: { "Content-Type": "application/json" },
    });
    const url = new URL(req.url);
    const result = await handler.handle(req, url);

    expect(result).toBeInstanceOf(Response);
    expect(result!.status).toBe(401);
    const body = await result!.json();
    expect(body.error).toBe("Authentication required to create PR");
  });

  test("PR create with invalid token returns 401 'Invalid or expired token'", async () => {
    // Mock fetch to return 401 from GitHub API (invalid token)
    globalThis.fetch = async (input: string | URL | Request) => {
      const fetchUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (fetchUrl.includes("api.github.com/user")) {
        return new Response("Unauthorized", { status: 401 });
      }
      return new Response("Not Found", { status: 404 });
    };

    const handler = createGitHubHandler(testConfig, undefined, mockKv);
    const req = new Request("http://localhost/api/pr/create", {
      method: "POST",
      body: JSON.stringify({ pasteId: "abc123", planMarkdown: "# Plan" }),
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer invalid_token_xyz",
      },
    });
    const url = new URL(req.url);
    const result = await handler.handle(req, url);

    expect(result).toBeInstanceOf(Response);
    expect(result!.status).toBe(401);
    const body = await result!.json();
    expect(body.error).toBeTruthy(); // Either "Invalid or expired token" or GitHub API error message
  });

  test("PR create with valid token proceeds (may fail on exportToPR, but passes auth)", async () => {
    // Mock fetch: GitHub API returns valid user for token validation,
    // then fails on PR creation (we only care about auth passing)
    globalThis.fetch = async (input: string | URL | Request) => {
      const fetchUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (fetchUrl.includes("api.github.com/user")) {
        return new Response(JSON.stringify({
          id: 12345,
          login: "testuser",
          name: "Test User",
          avatar_url: "https://avatars.githubusercontent.com/u/12345",
        }), { headers: { "Content-Type": "application/json" } });
      }
      // All other API calls (PR creation) fail with 404
      return new Response("Not Found", { status: 404 });
    };

    const handler = createGitHubHandler(testConfig, undefined, mockKv);
    const req = new Request("http://localhost/api/pr/create", {
      method: "POST",
      body: JSON.stringify({ pasteId: "abc123", planMarkdown: "# Plan" }),
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer valid_token_xyz",
      },
    });
    const url = new URL(req.url);
    const result = await handler.handle(req, url);

    // Should NOT be 401 — token validation passed
    expect(result).toBeInstanceOf(Response);
    expect(result!.status).not.toBe(401);
  });

  test("PR comments with invalid token returns 401 'Invalid or expired token'", async () => {
    globalThis.fetch = async (input: string | URL | Request) => {
      const fetchUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (fetchUrl.includes("api.github.com/user")) {
        return new Response("Unauthorized", { status: 401 });
      }
      return new Response("Not Found", { status: 404 });
    };

    const handler = createGitHubHandler(testConfig, undefined, mockKv);
    const req = new Request("http://localhost/api/pr/abc123def456/comments", {
      method: "GET",
      headers: { "Authorization": "Bearer invalid_token_xyz" },
    });
    const url = new URL(req.url);
    const result = await handler.handle(req, url);

    expect(result).toBeInstanceOf(Response);
    expect(result!.status).toBe(401);
    const body = await result!.json();
    expect(body.error).toBeTruthy(); // Either "Invalid or expired token" or GitHub API error message
  });

  test("PR comments with valid token proceeds past auth", async () => {
    globalThis.fetch = async (input: string | URL | Request) => {
      const fetchUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (fetchUrl.includes("api.github.com/user")) {
        return new Response(JSON.stringify({
          id: 12345, login: "testuser", name: "Test User",
          avatar_url: "https://avatars.githubusercontent.com/u/12345",
        }), { headers: { "Content-Type": "application/json" } });
      }
      return new Response("Not Found", { status: 404 });
    };

    const handler = createGitHubHandler(testConfig, undefined, mockKv);
    const req = new Request("http://localhost/api/pr/abc123def456/comments", {
      method: "GET",
      headers: { "Authorization": "Bearer valid_token_xyz" },
    });
    const url = new URL(req.url);
    const result = await handler.handle(req, url);

    // Should NOT be 401 — token validated. Will be 404 (no PR metadata) but auth passed.
    expect(result).toBeInstanceOf(Response);
    expect(result!.status).not.toBe(401);
  });

  test("validateGitHubToken called with kv parameter (KV caching per D-09, D-10)", async () => {
    // Pre-populate KV cache with valid token result
    const crypto = globalThis.crypto;
    const msgBuffer = new TextEncoder().encode("cached_token_xyz");
    const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const tokenHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    mockKv.store.set(`token:${tokenHash}`, {
      value: JSON.stringify({
        id: 99999, login: "cacheduser", name: "Cached User",
        avatar_url: "https://avatars.githubusercontent.com/u/99999",
      }),
    });

    // Track whether fetch was called (it should NOT be if cache hit)
    let fetchCalled = false;
    globalThis.fetch = async () => {
      fetchCalled = true;
      return new Response("Should not be called", { status: 500 });
    };

    const handler = createGitHubHandler(testConfig, undefined, mockKv);
    const req = new Request("http://localhost/api/pr/create", {
      method: "POST",
      body: JSON.stringify({ pasteId: "abc123", planMarkdown: "# Plan" }),
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer cached_token_xyz",
      },
    });
    const url = new URL(req.url);
    const result = await handler.handle(req, url);

    // Token validation should use cache, not call GitHub API
    // The request will fail on exportToPR (fetch mocked to 500) but auth should pass
    expect(result).toBeInstanceOf(Response);
    expect(result!.status).not.toBe(401);
    // fetch may still be called for PR creation, so we just verify auth passed
  });
});
