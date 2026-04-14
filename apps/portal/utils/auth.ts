/**
 * Authentication utilities for the portal.
 *
 * Manages GitHub OAuth tokens and authentication state:
 * - Token storage in localStorage
 * - Include token in API requests
 * - Handle 401/403 responses
 * - Auto-redirect to login when needed
 */

const TOKEN_KEY = "plannotator_github_token";
const USER_KEY = "plannotator_github_user";

export interface GitHubUser {
  login: string;
  avatar_url: string;
  name?: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  token: string | null;
  user: GitHubUser | null;
}

/**
 * Get current authentication state.
 */
export function getAuthState(): AuthState {
  const token = localStorage.getItem(TOKEN_KEY);
  const userJson = localStorage.getItem(USER_KEY);
  const user = userJson ? JSON.parse(userJson) : null;

  return {
    isAuthenticated: !!token,
    token,
    user,
  };
}

/**
 * Save authentication tokens and user info.
 */
export function saveAuthState(token: string, user: GitHubUser): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));

  // Dispatch custom event for reactive UI updates
  window.dispatchEvent(new CustomEvent("auth-state-changed", { detail: { token, user } }));
}

/**
 * Clear authentication state (logout).
 */
export function clearAuthState(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);

  window.dispatchEvent(new CustomEvent("auth-state-changed", { detail: null }));
}

/**
 * Extract auth data from URL fragment after OAuth callback.
 * Format: #auth=<base64_encoded_json>
 *
 * Returns { token, username, avatar } if present, null otherwise.
 */
export function extractAuthFromFragment(): { token: string; username: string; avatar: string } | null {
  const fragment = window.location.hash;
  if (!fragment.startsWith("#auth=")) return null;

  try {
    const encoded = fragment.slice(6); // Remove "#auth="
    const decoded = atob(encoded);
    const data = JSON.parse(decoded);

    // Clear the fragment to avoid reprocessing
    history.replaceState(null, "", window.location.pathname + window.location.search);

    return data;
  } catch {
    return null;
  }
}

/**
 * Initialize auth from URL fragment (OAuth callback).
 * Call this on app mount.
 */
export function initializeAuth(): void {
  const authData = extractAuthFromFragment();
  if (authData) {
    saveAuthState(authData.token, {
      login: authData.username,
      avatar_url: authData.avatar,
    });
  }
}

/**
 * Make authenticated API request.
 * Automatically includes Authorization header if token is present.
 *
 * Handles 401/403 errors by redirecting to login.
 */
export async function authenticatedFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const { token } = getAuthState();

  const headers = new Headers(options.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  // Handle authentication errors
  if (response.status === 401) {
    // Token invalid or expired - redirect to login
    redirectToLogin();
    throw new Error("Authentication required");
  }

  if (response.status === 403) {
    // Forbidden - user is authenticated but not authorized
    throw new Error("Access denied: You don't have permission to access this resource");
  }

  return response;
}

/**
 * Redirect to GitHub OAuth login.
 */
export function redirectToLogin(): void {
  const pasteServiceUrl = getPasteServiceUrl();
  const currentUrl = window.location.href;

  // Pass return_to as query parameter so OAuth callback knows where to redirect
  const loginUrl = new URL(`${pasteServiceUrl}/api/auth/github/login`);
  // Only send pathname + search (fragments are preserved via sessionStorage)
  const pathWithQuery = window.location.pathname + window.location.search;
  loginUrl.searchParams.set("return_to", pathWithQuery);

  // Also store in sessionStorage as backup (includes fragment for encryption keys)
  sessionStorage.setItem("plannotator_return_url", currentUrl);

  window.location.href = loginUrl.toString();
}

/**
 * Check if user should be returned to a saved URL after login.
 */
export function checkReturnUrl(): void {
  const returnUrl = sessionStorage.getItem("plannotator_return_url");
  if (returnUrl) {
    sessionStorage.removeItem("plannotator_return_url");
    window.location.href = returnUrl;
  }
}

/**
 * Get paste service URL from environment or default.
 */
function getPasteServiceUrl(): string {
  // In production, this should match PLANNOTATOR_PASTE_URL
  return (
    import.meta.env.VITE_PASTE_SERVICE_URL ||
    "https://plannotator-poc.ssiddh.workers.dev"
  );
}

/**
 * Validate current token with GitHub API.
 * Returns user info if valid, null if invalid.
 */
export async function validateToken(token: string): Promise<GitHubUser | null> {
  try {
    const pasteServiceUrl = getPasteServiceUrl();
    const response = await fetch(`${pasteServiceUrl}/api/auth/token/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    return data.user;
  } catch {
    return null;
  }
}

/**
 * Check if token is still valid on app mount.
 * If invalid, clear auth state.
 */
export async function validateAuthState(): Promise<void> {
  const { token } = getAuthState();
  if (!token) return;

  const user = await validateToken(token);
  if (!user) {
    clearAuthState();
  }
}
