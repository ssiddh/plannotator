import { describe, test, expect } from "bun:test";
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
