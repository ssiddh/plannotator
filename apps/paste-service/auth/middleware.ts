/**
 * Authentication middleware for the paste service.
 *
 * Validates GitHub tokens and enforces ACL rules on paste access.
 */

import type { PasteACL, AuthResult, GitHubUser } from "./types";

const GITHUB_API_BASE = "https://api.github.com";
const TOKEN_CACHE_TTL_SECONDS = 300; // 5 minutes

/**
 * Extract Authorization token from request headers.
 * Supports both "Authorization: Bearer <token>" and query param "?token=<token>"
 */
export function extractToken(req: Request): string | null {
  const authHeader = req.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  // Fallback: check query param
  const url = new URL(req.url);
  return url.searchParams.get("token");
}

/**
 * Validate GitHub token and return user info.
 * Caches validation results in KV to avoid rate limits.
 */
export async function validateGitHubToken(
  token: string,
  kv?: KVNamespace
): Promise<AuthResult> {
  if (!token) {
    return { valid: false, error: "Missing token" };
  }

  // Check cache first (if KV available)
  if (kv) {
    const cacheKey = `token:${await sha256(token)}`;
    const cached = await kv.get(cacheKey, "json");
    if (cached) {
      return {
        valid: true,
        user: cached as GitHubUser,
      };
    }
  }

  // Validate with GitHub API
  try {
    const response = await fetch(`${GITHUB_API_BASE}/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "Plannotator-Paste-Service",
      },
    });

    if (!response.ok) {
      return {
        valid: false,
        error: `GitHub API error: ${response.status}`,
      };
    }

    const user = (await response.json()) as GitHubUser;

    // Cache the result
    if (kv) {
      const cacheKey = `token:${await sha256(token)}`;
      await kv.put(cacheKey, JSON.stringify(user), {
        expirationTtl: TOKEN_CACHE_TTL_SECONDS,
      });
    }

    return { valid: true, user };
  } catch (error) {
    return {
      valid: false,
      error: `GitHub API request failed: ${error}`,
    };
  }
}

/**
 * Check if user is authorized to access a paste based on its ACL.
 */
export async function checkAccess(
  acl: PasteACL,
  user: GitHubUser | undefined,
  token: string | null,
  kv?: KVNamespace
): Promise<{ authorized: boolean; reason?: string }> {
  // Public pastes are always accessible
  if (acl.type === "public") {
    return { authorized: true };
  }

  // Whitelist requires authentication
  if (!token || !user) {
    return { authorized: false, reason: "Authentication required" };
  }

  // Check user whitelist
  if (acl.users && acl.users.includes(user.login)) {
    return { authorized: true };
  }

  // Check team membership
  if (acl.teams && acl.teams.length > 0) {
    const isMember = await checkAnyTeamMembership(
      user.login,
      acl.teams,
      token,
      kv
    );
    if (isMember) {
      return { authorized: true };
    }
  }

  return {
    authorized: false,
    reason: `Access denied: user ${user.login} not in whitelist`,
  };
}

/**
 * Check if user is a member of any of the given teams.
 * Teams are in "org/team" format (e.g., "myorg/reviewers").
 *
 * Caches results in KV to avoid rate limits (1 hour TTL).
 */
async function checkAnyTeamMembership(
  username: string,
  teams: string[],
  token: string,
  kv?: KVNamespace
): Promise<boolean> {
  for (const team of teams) {
    const [org, slug] = team.split("/");
    if (!org || !slug) continue;

    // Check cache first
    if (kv) {
      const cacheKey = `team:${username}:${org}/${slug}`;
      const cached = await kv.get(cacheKey);
      if (cached === "true") return true;
      if (cached === "false") continue; // Try next team
    }

    // Check via GitHub API
    try {
      const response = await fetch(
        `${GITHUB_API_BASE}/orgs/${org}/teams/${slug}/memberships/${username}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "User-Agent": "Plannotator-Paste-Service",
          },
        }
      );

      const isMember = response.ok;

      // Cache the result (1 hour TTL)
      if (kv) {
        const cacheKey = `team:${username}:${org}/${slug}`;
        await kv.put(cacheKey, String(isMember), { expirationTtl: 3600 });
      }

      if (isMember) return true;
    } catch {
      // Ignore errors, try next team
      continue;
    }
  }

  return false;
}

/**
 * SHA-256 hash for cache key generation.
 */
async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
