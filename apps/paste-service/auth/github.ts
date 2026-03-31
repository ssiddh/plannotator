/**
 * GitHub OAuth integration for the paste service.
 *
 * Implements OAuth 2.0 authorization code flow:
 * 1. User clicks "Sign in with GitHub"
 * 2. Redirect to GitHub authorization URL
 * 3. GitHub redirects back with authorization code
 * 4. Exchange code for access token
 * 5. Store token in httpOnly cookie + return in response
 */

import type { GitHubUser } from "./types";

const GITHUB_OAUTH_AUTHORIZE = "https://github.com/login/oauth/authorize";
const GITHUB_OAUTH_TOKEN = "https://github.com/login/oauth/access_token";
const GITHUB_API_USER = "https://api.github.com/user";

interface GitHubTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_token_expires_in?: number;
}

/**
 * Generate OAuth state parameter (CSRF protection).
 * Returns a random 32-character hex string.
 */
function generateState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Initiate GitHub OAuth flow.
 * Redirects user to GitHub authorization page.
 */
export function handleLogin(
  request: Request,
  clientId: string,
  redirectUri: string
): Response {
  const state = generateState();
  const scope = "repo read:user read:org"; // repo: create PRs, read:org: team membership

  const authUrl = new URL(GITHUB_OAUTH_AUTHORIZE);
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", scope);
  authUrl.searchParams.set("state", state);

  // Store state in cookie for verification in callback
  const headers = new Headers();
  headers.set("Location", authUrl.toString());

  // Only use Secure flag on HTTPS (not localhost)
  const isSecure = redirectUri.startsWith("https://");
  const secureSetting = isSecure ? "Secure; " : "";
  headers.set(
    "Set-Cookie",
    `oauth_state=${state}; Path=/; HttpOnly; ${secureSetting}SameSite=Lax; Max-Age=600`
  );

  return new Response(null, { status: 302, headers });
}

/**
 * Handle GitHub OAuth callback.
 * Exchanges authorization code for access token.
 */
export async function handleCallback(
  request: Request,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  portalUrl: string
): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  // Check for OAuth errors
  if (error) {
    return redirectToPortal(
      portalUrl,
      `error=${encodeURIComponent(error)}`
    );
  }

  if (!code || !state) {
    return redirectToPortal(
      portalUrl,
      "error=missing_code_or_state"
    );
  }

  // Verify state (CSRF protection)
  const cookieHeader = request.headers.get("Cookie") || "";
  console.log("Callback cookies:", cookieHeader);
  const cookies = parseCookies(cookieHeader);
  const savedState = cookies.oauth_state;
  console.log("Saved state:", savedState, "Request state:", state);

  if (!savedState || savedState !== state) {
    console.log("State mismatch - redirecting with error");
    return redirectToPortal(
      portalUrl,
      "error=invalid_state"
    );
  }

  // Exchange code for access token
  console.log("Exchanging code for token...");
  try {
    const tokenResponse = await fetch(GITHUB_OAUTH_TOKEN, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "Plannotator-Paste-Service",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      return redirectToPortal(
        portalUrl,
        `error=token_exchange_failed&status=${tokenResponse.status}`
      );
    }

    const tokenData = (await tokenResponse.json()) as GitHubTokenResponse;
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      return redirectToPortal(
        portalUrl,
        "error=no_access_token"
      );
    }

    // Fetch user info to validate token
    const userResponse = await fetch(GITHUB_API_USER, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": "Plannotator-Paste-Service",
      },
    });

    if (!userResponse.ok) {
      return redirectToPortal(
        portalUrl,
        "error=user_fetch_failed"
      );
    }

    const user = (await userResponse.json()) as GitHubUser;

    // Success! Redirect to portal with token in URL fragment (not query param for security)
    // Also set httpOnly cookie with refresh token if available
    const headers = new Headers();
    const fragmentData = {
      token: accessToken,
      username: user.login,
      avatar: user.avatar_url,
    };
    const fragment = btoa(JSON.stringify(fragmentData));
    const redirectUrl = `${portalUrl}#auth=${fragment}`;
    console.log("OAuth success! Redirecting to:", redirectUrl);
    headers.set("Location", redirectUrl);

    // Store refresh token in httpOnly cookie if provided
    if (tokenData.refresh_token) {
      const maxAge = tokenData.refresh_token_expires_in || 15780000; // ~6 months default
      headers.set(
        "Set-Cookie",
        `refresh_token=${tokenData.refresh_token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`
      );
    }

    // Clear state cookie
    headers.append(
      "Set-Cookie",
      "oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
    );

    return new Response(null, { status: 302, headers });
  } catch (error) {
    console.error("OAuth callback error:", error);
    return redirectToPortal(
      portalUrl,
      `error=exception&message=${encodeURIComponent(String(error))}`
    );
  }
}

/**
 * Validate an access token by checking with GitHub API.
 * Returns user info if valid.
 */
export async function handleTokenValidate(request: Request): Promise<Response> {
  let body: { token?: string };
  try {
    body = (await request.json()) as { token?: string };
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const token = body.token;
  if (!token) {
    return Response.json({ error: "Missing token" }, { status: 400 });
  }

  try {
    const response = await fetch(GITHUB_API_USER, {
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "Plannotator-Paste-Service",
      },
    });

    if (!response.ok) {
      return Response.json(
        { error: "Invalid token", status: response.status },
        { status: 401 }
      );
    }

    const user = (await response.json()) as GitHubUser;
    return Response.json({ valid: true, user });
  } catch (error) {
    return Response.json(
      { error: "Token validation failed", message: String(error) },
      { status: 500 }
    );
  }
}

/**
 * Refresh an access token using a refresh token from httpOnly cookie.
 * GitHub currently doesn't support refresh tokens for OAuth Apps,
 * so this is a placeholder for future GitHub Apps support.
 */
export async function handleTokenRefresh(
  request: Request,
  clientId: string,
  clientSecret: string
): Promise<Response> {
  const cookies = parseCookies(request.headers.get("Cookie") || "");
  const refreshToken = cookies.refresh_token;

  if (!refreshToken) {
    return Response.json(
      { error: "No refresh token available" },
      { status: 401 }
    );
  }

  // GitHub OAuth Apps don't support refresh tokens yet
  // This is for future GitHub Apps implementation
  try {
    const response = await fetch(GITHUB_OAUTH_TOKEN, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) {
      return Response.json(
        { error: "Refresh failed" },
        { status: response.status }
      );
    }

    const data = (await response.json()) as GitHubTokenResponse;
    return Response.json({
      access_token: data.access_token,
      expires_in: data.expires_in,
    });
  } catch (error) {
    return Response.json(
      { error: "Refresh exception", message: String(error) },
      { status: 500 }
    );
  }
}

/**
 * Helper: Redirect to portal with error/success parameters.
 */
function redirectToPortal(portalUrl: string, params?: string): Response {
  const url = params ? `${portalUrl}?${params}` : portalUrl;
  return new Response(null, {
    status: 302,
    headers: { Location: url },
  });
}

/**
 * Helper: Parse cookies from Cookie header.
 */
function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const cookie of cookieHeader.split(";")) {
    const [key, value] = cookie.trim().split("=");
    if (key && value) {
      cookies[key] = decodeURIComponent(value);
    }
  }
  return cookies;
}
