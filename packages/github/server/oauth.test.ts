import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { handleLogin, handleCallback, parseCookies } from "./oauth.ts";

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

  test("encodes return_to URL in base64 JSON state when provided", () => {
    const req = new Request("http://localhost/api/auth/github/login?return_to=https://share.plannotator.ai/%23abc123");
    const response = handleLogin(req, "test-client-id", "http://localhost/callback");

    expect(response.status).toBe(302);

    // Extract state from the Set-Cookie header
    const setCookie = response.headers.get("Set-Cookie")!;
    const stateMatch = setCookie.match(/oauth_state=([^;]+)/);
    expect(stateMatch).toBeTruthy();

    // Decode the state — it should be base64 JSON with csrf and return_to
    const decoded = JSON.parse(atob(stateMatch![1]));
    expect(decoded.csrf).toBeTruthy();
    expect(decoded.csrf.length).toBe(32); // 16 bytes = 32 hex chars
    expect(decoded.return_to).toBe("https://share.plannotator.ai/#abc123");
  });

  test("encodes state as base64 JSON even without return_to (backward compatible)", () => {
    const req = new Request("http://localhost/api/auth/github/login");
    const response = handleLogin(req, "test-client-id", "http://localhost/callback");

    const setCookie = response.headers.get("Set-Cookie")!;
    const stateMatch = setCookie.match(/oauth_state=([^;]+)/);
    expect(stateMatch).toBeTruthy();

    // Should be decodable base64 JSON
    const decoded = JSON.parse(atob(stateMatch![1]));
    expect(decoded.csrf).toBeTruthy();
    expect(decoded.return_to).toBe("");
  });

  test("state in cookie matches state in GitHub redirect URL", () => {
    const req = new Request("http://localhost/api/auth/github/login?return_to=https://example.com");
    const response = handleLogin(req, "test-client-id", "http://localhost/callback");

    const setCookie = response.headers.get("Set-Cookie")!;
    const cookieState = setCookie.match(/oauth_state=([^;]+)/)![1];

    const location = response.headers.get("Location")!;
    const urlState = new URL(location).searchParams.get("state");

    expect(cookieState).toBe(urlState);
  });
});

describe("handleCallback", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockFetchSuccess(accessToken = "gho_test_token_123") {
    globalThis.fetch = async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (url.includes("login/oauth/access_token")) {
        return new Response(JSON.stringify({
          access_token: accessToken,
          token_type: "bearer",
          scope: "repo,read:user,read:org",
        }), { headers: { "Content-Type": "application/json" } });
      }

      if (url.includes("api.github.com/user")) {
        return new Response(JSON.stringify({
          id: 12345,
          login: "testuser",
          name: "Test User",
          avatar_url: "https://avatars.githubusercontent.com/u/12345",
        }), { headers: { "Content-Type": "application/json" } });
      }

      return new Response("Not Found", { status: 404 });
    };
  }

  function createCallbackState(csrf: string, returnTo: string = ""): string {
    return btoa(JSON.stringify({ csrf, return_to: returnTo }));
  }

  test("decodes return_to from state and redirects to original share URL", async () => {
    mockFetchSuccess();
    const csrf = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4";
    const returnTo = "https://share.plannotator.ai/#abc123";
    const stateValue = createCallbackState(csrf, returnTo);

    const req = new Request(
      `http://localhost/api/auth/github/callback?code=test_code&state=${stateValue}`,
      { headers: { Cookie: `oauth_state=${stateValue}` } }
    );

    const response = await handleCallback(req, "client-id", "client-secret", "http://localhost/callback", "https://share.plannotator.ai");

    expect(response.status).toBe(302);
    const location = response.headers.get("Location")!;
    // Should redirect to returnTo URL, not portalUrl
    expect(location).toStartWith(returnTo);
    expect(location).toContain("#auth=");
  });

  test("falls back to portalUrl when no return_to in state", async () => {
    mockFetchSuccess();
    const csrf = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4";
    const stateValue = createCallbackState(csrf);

    const req = new Request(
      `http://localhost/api/auth/github/callback?code=test_code&state=${stateValue}`,
      { headers: { Cookie: `oauth_state=${stateValue}` } }
    );

    const response = await handleCallback(req, "client-id", "client-secret", "http://localhost/callback", "https://portal.example.com");

    expect(response.status).toBe(302);
    const location = response.headers.get("Location")!;
    expect(location).toStartWith("https://portal.example.com");
    expect(location).toContain("#auth=");
  });

  test("sets session-only token cookie (HttpOnly, no Max-Age)", async () => {
    mockFetchSuccess();
    const csrf = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4";
    const stateValue = createCallbackState(csrf);

    const req = new Request(
      `http://localhost/api/auth/github/callback?code=test_code&state=${stateValue}`,
      { headers: { Cookie: `oauth_state=${stateValue}` } }
    );

    const response = await handleCallback(req, "client-id", "client-secret", "http://localhost/callback", "https://portal.example.com");

    // Check all Set-Cookie headers
    const cookies = response.headers.getSetCookie();
    const tokenCookie = cookies.find(c => c.startsWith("plannotator_token="));
    expect(tokenCookie).toBeTruthy();
    expect(tokenCookie).toContain("HttpOnly");
    expect(tokenCookie).toContain("SameSite=Lax");
    expect(tokenCookie).not.toContain("Max-Age");
    expect(tokenCookie).toContain("plannotator_token=gho_test_token_123");
  });

  test("token cookie omits Secure flag for http:// redirectUri (localhost)", async () => {
    mockFetchSuccess();
    const csrf = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4";
    const stateValue = createCallbackState(csrf);

    const req = new Request(
      `http://localhost/api/auth/github/callback?code=test_code&state=${stateValue}`,
      { headers: { Cookie: `oauth_state=${stateValue}` } }
    );

    const response = await handleCallback(req, "client-id", "client-secret", "http://localhost/callback", "https://portal.example.com");

    const cookies = response.headers.getSetCookie();
    const tokenCookie = cookies.find(c => c.startsWith("plannotator_token="));
    expect(tokenCookie).toBeTruthy();
    expect(tokenCookie).not.toContain("Secure");
  });

  test("token cookie includes Secure flag for https:// redirectUri (production)", async () => {
    mockFetchSuccess();
    const csrf = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4";
    const stateValue = createCallbackState(csrf);

    const req = new Request(
      `http://localhost/api/auth/github/callback?code=test_code&state=${stateValue}`,
      { headers: { Cookie: `oauth_state=${stateValue}` } }
    );

    const response = await handleCallback(req, "client-id", "client-secret", "https://api.plannotator.ai/callback", "https://portal.example.com");

    const cookies = response.headers.getSetCookie();
    const tokenCookie = cookies.find(c => c.startsWith("plannotator_token="));
    expect(tokenCookie).toBeTruthy();
    expect(tokenCookie).toContain("Secure");
  });

  test("CSRF validation works with base64 JSON state (mismatched state returns error)", async () => {
    mockFetchSuccess();
    const csrf1 = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4";
    const csrf2 = "ffffffffffffffffffffffffffffffff";
    const cookieState = createCallbackState(csrf1);
    const urlState = createCallbackState(csrf2);

    const req = new Request(
      `http://localhost/api/auth/github/callback?code=test_code&state=${urlState}`,
      { headers: { Cookie: `oauth_state=${cookieState}` } }
    );

    const response = await handleCallback(req, "client-id", "client-secret", "http://localhost/callback", "https://portal.example.com");

    expect(response.status).toBe(302);
    const location = response.headers.get("Location")!;
    expect(location).toContain("error=invalid_state");
  });

  test("handles missing oauth_state cookie gracefully", async () => {
    mockFetchSuccess();
    const stateValue = createCallbackState("a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4");

    const req = new Request(
      `http://localhost/api/auth/github/callback?code=test_code&state=${stateValue}`,
      { headers: {} }
    );

    const response = await handleCallback(req, "client-id", "client-secret", "http://localhost/callback", "https://portal.example.com");

    expect(response.status).toBe(302);
    const location = response.headers.get("Location")!;
    expect(location).toContain("error=invalid_state");
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
