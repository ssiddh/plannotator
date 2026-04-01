import { describe, test, expect } from "bun:test";
import { extractToken, checkAccess } from "./middleware.ts";

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
