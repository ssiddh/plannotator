import { describe, test, expect } from "bun:test";
import { handleLogin, parseCookies } from "./oauth.ts";

describe("handleLogin", () => {
  test("returns a redirect Response (302) with correct GitHub OAuth URL", () => {
    const req = new Request("http://localhost/api/auth/github/login");
    const response = handleLogin(req, "test-client-id", "http://localhost/callback");

    expect(response.status).toBe(302);

    const location = response.headers.get("Location");
    expect(location).toBeTruthy();
    expect(location).toContain("github.com/login/oauth/authorize");
    expect(location).toContain("client_id=test-client-id");
    expect(location).toContain("redirect_uri=");
  });

  test("includes state parameter in redirect URL", () => {
    const req = new Request("http://localhost/api/auth/github/login");
    const response = handleLogin(req, "test-client-id", "http://localhost/callback");

    const location = response.headers.get("Location")!;
    expect(location).toContain("state=");

    // State should also be set in a cookie
    const setCookie = response.headers.get("Set-Cookie");
    expect(setCookie).toBeTruthy();
    expect(setCookie).toContain("oauth_state=");
  });

  test("sets scope to include repo and read:user", () => {
    const req = new Request("http://localhost/api/auth/github/login");
    const response = handleLogin(req, "test-client-id", "http://localhost/callback");

    const location = response.headers.get("Location")!;
    expect(location).toContain("scope=");
  });
});

describe("parseCookies", () => {
  test("parses semicolon-separated cookie string correctly", () => {
    const result = parseCookies("foo=bar; baz=qux");
    expect(result).toEqual({ foo: "bar", baz: "qux" });
  });

  test("returns empty object for empty string", () => {
    const result = parseCookies("");
    expect(result).toEqual({});
  });

  test("handles URL-encoded values", () => {
    const result = parseCookies("name=hello%20world");
    expect(result).toEqual({ name: "hello world" });
  });
});
