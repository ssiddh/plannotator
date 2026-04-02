# Phase 2: Authentication & Access Control - Research

**Researched:** 2026-04-01
**Domain:** GitHub OAuth 2.0 authentication, server-side access control, cookie-based sessions
**Confidence:** HIGH

## Summary

Phase 2 wires up the already-extracted GitHub OAuth and ACL code (from Phase 1's `packages/github/`) into the paste-service request flow so that private shares enforce authentication before serving content. The core implementation is already written -- `oauth.ts` handles the full OAuth flow, `middleware.ts` provides `extractToken()`, `validateGitHubToken()`, and `checkAccess()`, and `handler.ts` routes OAuth API endpoints. What remains is: (1) adding a server-side auth gate in the paste GET path that returns a 401 HTML error page instead of plan content for whitelist shares, (2) implementing the return-to-original-URL pattern after OAuth callback, (3) wiring the `GitHubProvider` client component to actually populate auth state from the token, and (4) ensuring the existing OAuth flow has no regressions.

The handler.ts already routes `/api/paste/:id` GET requests through `checkAccess()` and returns JSON `{error}` on 401/403. The gap is that this returns JSON, not an HTML error page (per D-05), and the auth gate needs to happen before the plan content is ever sent to the client (per D-01). The portal's `Login.tsx` page and `auth.ts` utilities already exist but need integration with the server-side gate.

**Primary recommendation:** This phase is primarily integration and wiring work. No new libraries needed. Focus on: (1) HTML 401 response in paste GET handler, (2) oauth_state cookie carrying return_to URL, (3) GitHubProvider hydration from localStorage/cookie, (4) comprehensive test coverage for auth flows.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Authentication check happens before HTML serves (server-side gate). Middleware runs in paste-service request handler before serving static assets. Unauthenticated users receive 401 response with error HTML (not plan content).
- **D-02:** Public shares (ACL type 'public') skip authentication entirely. Auth only enforced for ACL type 'whitelist'.
- **D-03:** Share URLs support embedded tokens (?token=xyz) for programmatic access. Token still validated against GitHub API.
- **D-04:** Session-only authentication (token cleared on browser close). httpOnly cookie without Max-Age attribute.
- **D-05:** Full-page error for unauthenticated users (no plan UI served). Dedicated auth-required page with 401 status.
- **D-06:** No plan metadata preview before authentication. Generic 'This share requires authentication' message.
- **D-07:** "Sign in with GitHub" redirects to full OAuth flow via `/api/auth/github/login`.
- **D-08:** After successful auth, redirect back to original share URL. Store original URL in `oauth_state` cookie.
- **D-09:** Tokens validated once on load, cached for session. KV cache with 5-minute TTL.
- **D-10:** KV cache for token validation. Cloudflare Workers KV in production, in-memory Map for Bun dev.
- **D-11:** Token expiry triggers state clear and re-authentication. Show "Session expired" error.
- **D-12:** No proactive token refresh (reactive handling only).
- **D-13:** ACL checked only on initial share access (not re-checked during session).
- **D-14:** Annotation operations don't require ACL checks.
- **D-15:** Users removed from ACL mid-session can finish their session.
- **D-16:** Single permission level (whitelist = full access).

### Claude's Discretion
- Error message wording for auth-required page
- httpOnly cookie SameSite attribute (Lax vs Strict)
- Cache key hashing algorithm for KV (sha256 already used in middleware.ts)
- Token cleanup on logout (if explicit logout endpoint added)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-01 | Private shares (ACL type "whitelist") enforce GitHub authentication before access | Server-side gate in paste GET handler; `checkAccess()` already validates ACL type; needs HTML 401 response instead of JSON |
| AUTH-02 | GitHub tokens validated before any PR operations | `handler.ts` already calls `extractToken()` + validates before PR routes; verify no gaps in `/api/pr/create` and `/api/pr/:id/comments` |
| AUTH-03 | ACL users and teams checked against GitHub API before granting access | `checkAccess()` with `checkAnyTeamMembership()` already implemented; needs integration into paste GET flow with proper error responses |
| AUTH-04 | Existing OAuth flow preserved (no breaking changes) | `handleLogin()`, `handleCallback()`, `handleTokenValidate()` already extracted; need regression tests |
| AUTH-05 | Unauthenticated users see auth-required error with login link | New HTML error page returned as 401 response; portal Login.tsx exists as reference |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Bun runtime | (project standard) | Server runtime, test runner | Already used throughout project |
| `@plannotator/github` | (workspace) | OAuth, middleware, types | Phase 1 extracted all GitHub code here |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `bun:test` | (built-in) | Test framework | All unit/integration tests |

### Alternatives Considered
None -- this phase uses only existing project code. No new dependencies needed.

## Architecture Patterns

### Existing Code Map (what's already built)

```
packages/github/
├── server/
│   ├── handler.ts          # GitHubHandler with OAuth + PR routes (COMPLETE)
│   ├── middleware.ts        # extractToken, validateGitHubToken, checkAccess (COMPLETE)
│   ├── oauth.ts            # handleLogin, handleCallback, handleTokenValidate (COMPLETE)
│   └── pr.ts               # exportToPR, fetchPRComments (COMPLETE)
├── client/
│   ├── GitHubProvider.tsx   # React context (STUB -- needs auth hydration)
│   └── useGitHub.ts         # Hook for consuming context
├── shared/
│   └── types.ts            # PasteACL, AuthResult, GitHubUser, etc. (COMPLETE)
apps/paste-service/
├── core/handler.ts          # handleRequest -- already has ACL checks on paste GET (PARTIAL)
apps/portal/
├── utils/auth.ts            # Client-side auth utilities (COMPLETE)
├── pages/Login.tsx           # Login page component (COMPLETE)
└── index.tsx                 # Portal entry (needs auth init integration)
```

### Pattern 1: Server-Side Auth Gate (D-01, D-05)

**What:** Before returning paste content on GET `/api/paste/:id`, check ACL. If whitelist and no valid token, return 401 HTML instead of JSON error.

**When to use:** Every paste GET request for whitelist-type shares.

**Current state:** `handler.ts` lines 336-392 already do ACL checking and return JSON `{error}` with 401/403 status. The change is to return HTML for browser requests.

**Example:**
```typescript
// In handleRequest, paste GET path:
if (!accessCheck.authorized) {
  const status = token ? 403 : 401;
  
  // Check Accept header to determine response format
  const acceptsHtml = request.headers.get("Accept")?.includes("text/html");
  
  if (acceptsHtml) {
    // Return auth-required HTML page (D-05, D-06)
    return new Response(authRequiredHtml(url.toString()), {
      status,
      headers: { ...cors, "Content-Type": "text/html; charset=utf-8" },
    });
  }
  
  // API clients get JSON
  return Response.json(
    { error: accessCheck.reason || "Access denied" },
    { status, headers: cors }
  );
}
```

### Pattern 2: OAuth Return-to-URL (D-08)

**What:** Store the original share URL in the oauth_state cookie before redirecting to GitHub, then redirect back after callback.

**Current state:** `handleLogin()` generates a random state string. It needs to encode the return URL alongside the CSRF token. `handleCallback()` redirects to `portalUrl` with token in fragment. It needs to redirect to the return URL instead.

**Example:**
```typescript
// In handleLogin -- encode return_to in state cookie
const statePayload = JSON.stringify({
  csrf: generateState(),
  return_to: request.headers.get("Referer") || request.url,
});
// Store full payload as oauth_state cookie

// In handleCallback -- redirect to return_to instead of portalUrl
const stateData = JSON.parse(savedState);
const returnTo = stateData.return_to || portalUrl;
// Redirect to returnTo with auth fragment
```

### Pattern 3: Middleware Composition (existing)

**What:** GitHubHandler returns `Response | null`. Non-null means the route was handled. Null means pass through to next handler.

**When to use:** All GitHub routes. Already wired in both cloudflare.ts and bun.ts targets.

### Anti-Patterns to Avoid

- **Client-side auth gate:** Never check auth in the browser before showing content. Per D-01, the server must gate. The plan content must never be sent in the response body if auth fails.
- **Storing secrets in URL query params:** The current OAuth callback correctly uses URL fragments (`#auth=...`) not query params. Keep this pattern.
- **Double token validation:** Per D-09, validate once and cache. Don't call GitHub API on every request.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OAuth 2.0 flow | Custom OAuth library | Existing `oauth.ts` implementation | Already complete, tested, handles CSRF |
| Token validation caching | Custom cache layer | Existing `validateGitHubToken()` with KV param | Already implements sha256 key + TTL |
| Team membership check | Custom org API client | Existing `checkAnyTeamMembership()` | Already handles org/team format, caching |
| Cookie parsing | Custom parser | Existing `parseCookies()` from oauth.ts | Already tested, handles encoding |

**Key insight:** Almost everything needed for this phase already exists in `packages/github/`. The work is integration, not implementation.

## Common Pitfalls

### Pitfall 1: JSON vs HTML Response for Browser Auth Failures
**What goes wrong:** Returning `{error: "Access denied"}` JSON to a browser navigating to a share URL shows raw JSON instead of a proper error page.
**Why it happens:** The current paste GET handler returns JSON for all error responses.
**How to avoid:** Check `Accept: text/html` header to determine response format. Browser requests get HTML, API requests get JSON.
**Warning signs:** Navigating to a private share URL in a browser shows raw JSON text.

### Pitfall 2: OAuth State Cookie Not Carrying Return URL
**What goes wrong:** After GitHub OAuth completes, user lands on portal home instead of their original share URL.
**Why it happens:** Current `handleLogin()` stores only a CSRF token in state, and `handleCallback()` redirects to `portalUrl` unconditionally.
**How to avoid:** Encode `{csrf, return_to}` in the state cookie. Decode in callback and redirect to return_to.
**Warning signs:** After login, user is on `share.plannotator.ai` root instead of their specific share.

### Pitfall 3: Cookie Domain Mismatch Between Paste Service and Portal
**What goes wrong:** Auth cookie set by paste-service (`plannotator-paste.plannotator.workers.dev`) is not sent when portal (`share.plannotator.ai`) makes requests.
**Why it happens:** Cookies are domain-scoped. Different domains = different cookie jars.
**How to avoid:** The current pattern uses localStorage for client-side token storage (portal `auth.ts`) and the token is sent as `Authorization: Bearer` header. Auth cookies only need to work within the paste-service domain for OAuth state. Ensure this separation is maintained.
**Warning signs:** Token present in localStorage but not sent to paste-service API.

### Pitfall 4: Token in URL Fragment Lost After Redirect
**What goes wrong:** After OAuth callback, the `#auth=...` fragment containing the token is lost if there's an additional redirect.
**Why it happens:** URL fragments are not sent to servers. If the callback handler redirects to a URL that itself redirects, the fragment is lost.
**How to avoid:** `extractAuthFromFragment()` in `auth.ts` must run on the first page load after callback. Ensure the return_to URL goes directly to the share page, not through another redirect.
**Warning signs:** User sees login page again after completing OAuth.

### Pitfall 5: In-Memory Token Cache Not Shared Across Cloudflare Workers
**What goes wrong:** Token validation cache miss rates are high in production because each Worker invocation has fresh memory.
**Why it happens:** Cloudflare Workers are stateless -- in-memory Map resets per invocation.
**How to avoid:** Use KV for production (already the plan per D-10). Only use in-memory Map for local Bun dev server where the process persists.
**Warning signs:** High GitHub API call rate in production despite caching.

### Pitfall 6: GitHubProvider Reading Wrong localStorage Key
**What goes wrong:** `GitHubProvider.tsx` reads `github_token` from localStorage but `auth.ts` writes `plannotator_github_token`.
**Why it happens:** Phase 1 created the provider as a stub with a placeholder key name.
**How to avoid:** Align the localStorage key between `GitHubProvider.tsx` and portal `auth.ts`. Use `plannotator_github_token` consistently.
**Warning signs:** Provider shows unauthenticated state even after successful OAuth.

## Code Examples

### Auth-Required HTML Page (D-05, D-06)
```typescript
// Inline HTML for 401 response -- no plan metadata, generic message
function authRequiredHtml(loginUrl: string, returnTo?: string): string {
  const loginHref = returnTo
    ? `${loginUrl}?return_to=${encodeURIComponent(returnTo)}`
    : loginUrl;
  
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Authentication Required</title>
<style>
  body { font-family: system-ui; display: flex; align-items: center;
         justify-content: center; min-height: 100vh; margin: 0;
         background: #f5f5f5; color: #333; }
  .card { background: white; padding: 3rem; border-radius: 12px;
          box-shadow: 0 4px 6px rgba(0,0,0,0.1); max-width: 400px;
          text-align: center; }
  .btn { display: inline-block; padding: 0.75rem 1.5rem;
         background: #24292e; color: white; border-radius: 6px;
         text-decoration: none; font-weight: 600; }
</style></head>
<body><div class="card">
  <h1>Authentication Required</h1>
  <p>This share requires GitHub authentication.</p>
  <a href="${loginHref}" class="btn">Sign in with GitHub</a>
</div></body></html>`;
}
```

### Token Cookie (D-04 -- Session-Only)
```typescript
// Set token as session-only httpOnly cookie (no Max-Age = session cookie)
const isSecure = url.startsWith("https://");
const secureSetting = isSecure ? "Secure; " : "";
const cookie = `plannotator_token=${token}; Path=/; HttpOnly; ${secureSetting}SameSite=Lax`;
// No Max-Age = browser clears on close (D-04)
```

### OAuth State with Return URL (D-08)
```typescript
// Encode return URL in OAuth state
const statePayload = {
  csrf: generateState(),
  return_to: new URL(request.url).searchParams.get("return_to") || "",
};
const stateValue = btoa(JSON.stringify(statePayload));

// In callback, decode and redirect
const decoded = JSON.parse(atob(savedState));
if (decoded.csrf !== urlState) { /* CSRF mismatch */ }
const redirectUrl = decoded.return_to || portalUrl;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| JSON errors for all auth failures | HTML error page for browser requests | This phase | Users see proper UI instead of raw JSON |
| Simple CSRF-only OAuth state | State carrying return URL | This phase | Seamless post-login redirect |
| Stub GitHubProvider (no auth) | Hydrated provider with token from localStorage | This phase | Client knows auth state |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | bun:test (built-in) |
| Config file | None needed (Bun auto-discovers .test.ts files) |
| Quick run command | `bun test packages/github/` |
| Full suite command | `bun test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-01 | Whitelist shares return 401 HTML for unauthenticated browser requests | integration | `bun test packages/github/server/middleware.test.ts` | Partial (JSON tested, HTML not) |
| AUTH-01 | Public shares skip auth entirely | unit | `bun test packages/github/server/middleware.test.ts` | Yes (checkAccess public test exists) |
| AUTH-02 | PR routes require valid token | unit | `bun test packages/github/server/handler.test.ts` | Partial (routes tested, token validation not) |
| AUTH-03 | ACL user whitelist check | unit | `bun test packages/github/server/middleware.test.ts` | Yes |
| AUTH-03 | ACL team membership check | integration | `bun test packages/github/server/middleware.test.ts` | No (needs mock GitHub API) |
| AUTH-04 | OAuth login redirects to GitHub | unit | `bun test packages/github/server/oauth.test.ts` | Yes |
| AUTH-04 | OAuth callback exchanges code for token | integration | `bun test packages/github/server/oauth.test.ts` | No (needs mock) |
| AUTH-05 | 401 response contains HTML with login link | unit | `bun test packages/github/server/middleware.test.ts` | No (Wave 0) |
| AUTH-05 | 401 HTML has no plan metadata | unit | `bun test packages/github/server/middleware.test.ts` | No (Wave 0) |

### Sampling Rate
- **Per task commit:** `bun test packages/github/`
- **Per wave merge:** `bun test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/github/server/middleware.test.ts` -- add tests for HTML 401 response, team membership with mock KV
- [ ] `packages/github/server/handler.test.ts` -- add tests for token validation on PR routes
- [ ] `packages/github/server/oauth.test.ts` -- add tests for return_to URL in state, callback redirect

## Sources

### Primary (HIGH confidence)
- Direct code reading of `packages/github/server/*.ts` -- full implementation reviewed
- Direct code reading of `apps/paste-service/core/handler.ts` -- integration point reviewed
- Direct code reading of `apps/portal/utils/auth.ts` and `pages/Login.tsx` -- client auth flow reviewed
- Existing test files in `packages/github/server/*.test.ts` -- test patterns established

### Secondary (MEDIUM confidence)
- GitHub OAuth documentation (standard OAuth 2.0 authorization code flow) -- well-known pattern
- Cloudflare Workers KV behavior (stateless workers, KV for persistence) -- documented behavior

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new libraries, all existing code
- Architecture: HIGH -- all integration points identified, code read line-by-line
- Pitfalls: HIGH -- identified through direct code analysis (e.g., localStorage key mismatch)

**Research date:** 2026-04-01
**Valid until:** 2026-05-01 (stable -- no external dependency changes expected)
