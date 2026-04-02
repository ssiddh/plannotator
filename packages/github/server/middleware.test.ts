import { describe, test, expect } from "bun:test";
import { extractToken, checkAccess, validateGitHubToken } from "./middleware.ts";

describe("extractToken", () => {
  test("returns token from Bearer header", () => {
    const req = new Request("http://localhost/api/test", {
      headers: { Authorization: "Bearer my-token-123" },
    });
    expect(extractToken(req)).toBe("my-token-123");
  });

  test("returns token from query param", () => {
    const req = new Request("http://localhost/api/test?token=query-token-456");
    expect(extractToken(req)).toBe("query-token-456");
  });

  test("returns null when no token present", () => {
    const req = new Request("http://localhost/api/test");
    expect(extractToken(req)).toBeNull();
  });

  test("prefers Bearer header over query param", () => {
    const req = new Request("http://localhost/api/test?token=query-token", {
      headers: { Authorization: "Bearer header-token" },
    });
    expect(extractToken(req)).toBe("header-token");
  });

  test("returns null for non-Bearer auth header", () => {
    const req = new Request("http://localhost/api/test", {
      headers: { Authorization: "Basic abc123" },
    });
    // Should fall back to query param, which is also absent
    expect(extractToken(req)).toBeNull();
  });
});

describe("checkAccess", () => {
  test("returns authorized:true for public ACL", async () => {
    const result = await checkAccess({ type: "public" }, undefined, null);
    expect(result.authorized).toBe(true);
  });

  test("returns authorized:false for whitelist ACL without token", async () => {
    const result = await checkAccess(
      { type: "whitelist", users: ["alice"] },
      undefined,
      null
    );
    expect(result.authorized).toBe(false);
    expect(result.reason).toContain("Authentication required");
  });

  test("returns authorized:true for whitelist ACL with matching user", async () => {
    const result = await checkAccess(
      { type: "whitelist", users: ["alice"] },
      { login: "alice", avatar_url: "https://example.com/avatar.png" },
      "fake-token"
    );
    expect(result.authorized).toBe(true);
  });

  test("returns authorized:false for whitelist ACL with non-matching user", async () => {
    const result = await checkAccess(
      { type: "whitelist", users: ["alice"] },
      { login: "bob", avatar_url: "https://example.com/avatar.png" },
      "fake-token"
    );
    expect(result.authorized).toBe(false);
    expect(result.reason).toContain("not in whitelist");
  });
});

describe("checkAccess with teams", () => {
  test("returns authorized:true when user is member of a whitelisted team", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url: string | Request | URL) => {
      const urlStr = url.toString();
      if (urlStr.includes("/orgs/myorg/teams/reviewers/memberships/alice")) {
        return new Response(JSON.stringify({ state: "active" }), { status: 200 });
      }
      return new Response("Not found", { status: 404 });
    };

    try {
      const result = await checkAccess(
        { type: "whitelist", teams: ["myorg/reviewers"] },
        { login: "alice", avatar_url: "https://example.com/a.png" },
        "fake-token"
      );
      expect(result.authorized).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("returns authorized:false when user is NOT member of any whitelisted team", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response("Not found", { status: 404 });

    try {
      const result = await checkAccess(
        { type: "whitelist", teams: ["myorg/reviewers"] },
        { login: "bob", avatar_url: "https://example.com/b.png" },
        "fake-token"
      );
      expect(result.authorized).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("query param token through auth gate (D-03)", () => {
  test("extractToken reads ?token= query param from request URL", () => {
    const req = new Request("https://share.plannotator.ai/abc123?token=ghp_validtoken123");
    const token = extractToken(req);
    expect(token).toBe("ghp_validtoken123");
  });

  test("valid query param token passes through auth gate (not blocked by HTML 401)", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url: string | Request | URL) => {
      const urlStr = url.toString();
      if (urlStr.includes("api.github.com/user")) {
        return new Response(
          JSON.stringify({ login: "ci-bot", avatar_url: "https://example.com/bot.png" }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("Not found", { status: 404 });
    };

    try {
      // Step 1: extractToken reads from query param
      const req = new Request("https://share.plannotator.ai/abc123?token=ghp_validtoken123");
      const token = extractToken(req);
      expect(token).toBe("ghp_validtoken123");

      // Step 2: validateGitHubToken confirms the token is valid via GitHub API
      const authResult = await validateGitHubToken(token!);
      expect(authResult.valid).toBe(true);
      expect(authResult.user?.login).toBe("ci-bot");

      // Step 3: checkAccess allows the validated user who is on the whitelist
      const accessResult = await checkAccess(
        { type: "whitelist", users: ["ci-bot"] },
        authResult.user!,
        token
      );
      expect(accessResult.authorized).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("single permission level (D-16)", () => {
  test("checkAccess returns { authorized: true } with no permission level fields", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response("Not found", { status: 404 });

    try {
      const result = await checkAccess(
        { type: "whitelist", users: ["alice"] },
        { login: "alice", avatar_url: "https://example.com/a.png" },
        "fake-token"
      );

      expect(result.authorized).toBe(true);

      // D-16: No permission level distinction -- only { authorized, reason? } fields
      const keys = Object.keys(result);
      expect(keys).not.toContain("readOnly");
      expect(keys).not.toContain("permissions");
      expect(keys).not.toContain("accessLevel");
      expect(keys).not.toContain("role");
      expect(keys).not.toContain("scope");

      for (const key of keys) {
        expect(["authorized", "reason"]).toContain(key);
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
