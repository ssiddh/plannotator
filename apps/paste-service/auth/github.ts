/**
 * GitHub OAuth integration for the paste service.
 *
 * Implements OAuth 2.0 authorization code flow:
 * 1. User clicks "Sign in with GitHub"
 * 2. Redirect to GitHub authorization URL
 * 3. GitHub redirects back with authorization code
 * 4. Exchange code for access token
 * 5. Store token in httpOnly cookie + return in response
 *
 * This module re-exports OAuth flow handlers from the shared @plannotator/github package.
 * Token validation and refresh remain paste-service specific.
 */

import type { GitHubUser } from "./types";
import {
  handleLogin as sharedHandleLogin,
  handleCallback as sharedHandleCallback,
  parseCookies,
} from "@plannotator/github/server/oauth";

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
 * Initiate GitHub OAuth flow.
 * Redirects user to GitHub authorization page.
 *
 * Delegates to shared OAuth implementation from @plannotator/github.
 */
export function handleLogin(
  request: Request,
  clientId: string,
  redirectUri: string
): Response {
  return sharedHandleLogin(request, clientId, redirectUri);
}

/**
 * Handle GitHub OAuth callback.
 * Exchanges authorization code for access token.
 *
 * Delegates to shared OAuth implementation from @plannotator/github.
 */
export async function handleCallback(
  request: Request,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  portalUrl: string
): Promise<Response> {
  return await sharedHandleCallback(
    request,
    clientId,
    clientSecret,
    redirectUri,
    portalUrl
  );
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

