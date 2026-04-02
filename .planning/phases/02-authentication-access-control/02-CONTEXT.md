# Phase 2: Authentication & Access Control - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement secure authentication and access control for private shares. Users must be authenticated via GitHub OAuth before accessing whitelist-protected shares or performing PR operations. Unauthenticated users see a clear auth-required error with a login flow. Existing OAuth implementation (from Phase 1 extraction) is wired up and enforced at the right entry points.

</domain>

<decisions>
## Implementation Decisions

### Auth Gate Placement

- **D-01:** Authentication check happens before HTML serves (server-side gate)
  - Middleware runs in paste-service request handler before serving static assets
  - Unauthenticated users receive 401 response with error HTML (not plan content)
  - More secure than client-side check - private content never leaves server

- **D-02:** Public shares (ACL type 'public') skip authentication entirely
  - Auth only enforced for ACL type 'whitelist'
  - Routing logic: check ACL type first, skip auth middleware if public
  - 'Public' means truly anonymous - no login required

- **D-03:** Share URLs support embedded tokens (?token=xyz) for programmatic access
  - `extractToken()` already checks query params in addition to Bearer header
  - Enables CI/automation access to private shares without browser OAuth
  - Token still validated against GitHub API (not a bypass)

- **D-04:** Session-only authentication (token cleared on browser close)
  - httpOnly cookie without Max-Age attribute
  - Most secure - user re-authenticates each browser session
  - Reduces risk if device left unlocked or shared

### Unauthenticated Experience

- **D-05:** Full-page error for unauthenticated users (no plan UI served)
  - Dedicated auth-required page with clear message and "Sign in with GitHub" button
  - Server returns 401 status with HTML error page instead of plan content
  - Standard pattern - no confusion about what's needed

- **D-06:** No plan metadata preview before authentication
  - No plan title, author, timestamp, or any other info shown
  - 'This share requires authentication' generic message
  - Private means private - zero data leakage before auth

- **D-07:** "Sign in with GitHub" redirects to full OAuth flow
  - Button links to `/api/auth/github/login`
  - Triggers `handleLogin()` → GitHub authorization → `handleCallback()`
  - Standard OAuth 2.0 authorization code flow (already implemented)

- **D-08:** After successful auth, redirect back to original share URL
  - Store original URL in `oauth_state` cookie during login redirect
  - `handleCallback()` reads state, redirects to original destination
  - Standard OAuth return_to pattern

### Token Validation Strategy

- **D-09:** Tokens validated once on load, cached for session
  - `validateGitHubToken()` called on initial share access
  - Result cached in KV store with 5-minute TTL
  - Subsequent requests use cached validation (no repeated GitHub API calls)

- **D-10:** KV cache used to reduce GitHub API calls and avoid rate limits
  - Cloudflare Workers KV for paste-service production
  - In-memory Map for local Bun dev server
  - Prevents hitting GitHub's 5000 req/hour rate limit on busy days

- **D-11:** Token expiry triggers state clear and re-authentication
  - When `validateGitHubToken()` returns `valid: false`
  - Clear token cookie + localStorage
  - Show full-page "Session expired, please sign in again" error
  - User re-authenticates (no silent refresh attempt)

- **D-12:** No proactive token refresh (reactive handling only)
  - Don't check token expiry in background
  - Don't attempt refresh_token flow proactively
  - GitHub tokens typically valid for months - expiry is rare edge case
  - Simpler implementation, less background work

### ACL Enforcement Scope

- **D-13:** ACL checked only on initial share access (not re-checked during session)
  - `checkAccess()` validates user/team membership via GitHub API on load
  - Result trusted for duration of session
  - Faster UX, simpler logic

- **D-14:** Annotation operations don't require ACL checks
  - Annotations are local drafts in user's browser session
  - Not synced to GitHub until explicit "Sync to GitHub" action
  - ACL only matters when pushing to GitHub (Phase 6)

- **D-15:** Users removed from ACL mid-session can finish their session
  - No real-time ACL change detection (no polling or SSE)
  - User can continue viewing and annotating until tab close
  - Next visit triggers auth failure (ACL re-checked on fresh load)
  - Graceful degradation - they already saw the content

- **D-16:** Single permission level (whitelist = full access)
  - No read-only vs read-write distinction
  - If you're on the whitelist, you can view + annotate + sync to GitHub
  - Matches typical PR review workflow (reviewers have write access)
  - Simpler ACL schema, less code complexity

### Claude's Discretion

- Error message wording for auth-required page
- httpOnly cookie SameSite attribute (Lax vs Strict)
- Cache key hashing algorithm for KV (sha256 already used in middleware.ts)
- Token cleanup on logout (if explicit logout endpoint added)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §Authentication & Access Control — AUTH-01 through AUTH-05 define what must be TRUE

### Existing Implementation
- `packages/github/server/oauth.ts` — OAuth flow implementation (handleLogin, handleCallback, token validation)
- `packages/github/server/middleware.ts` — Auth middleware (extractToken, validateGitHubToken, checkAccess)
- `packages/github/shared/types.ts` — Type definitions (GitHubUser, AuthResult, PasteACL)

### Patterns
- `packages/server/external-annotations.ts` — Middleware composition pattern (Response | null)
- `apps/paste-service/core/handler.ts` — Request routing where auth middleware composes

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **OAuth implementation**: `packages/github/server/oauth.ts` (215 lines)
  - `handleLogin()` — generates OAuth state, redirects to GitHub authorization
  - `handleCallback()` — exchanges code for token, validates state CSRF protection
  - `handleTokenValidate()` — validates token against GitHub /user endpoint
  - `handleTokenRefresh()` — refreshes expired token using refresh_token (not used for proactive refresh per D-12)

- **Auth middleware**: `packages/github/server/middleware.ts` (174 lines)
  - `extractToken()` — reads token from Authorization header or ?token= query param
  - `validateGitHubToken()` — validates token via GitHub API with optional KV caching
  - `checkAccess()` — validates user/team membership against PasteACL (whitelist or public)
  - Token cache uses sha256 hashing for KV keys

- **Types**: `packages/github/shared/types.ts`
  - `PasteACL` — { type: "public" | "whitelist", users?: string[], teams?: string[] }
  - `AuthResult` — { valid: boolean, user?: GitHubUser, error?: string }
  - `GitHubUser` — { id, login, name, avatar_url }

### Established Patterns

- **Middleware composition**: Plugin middleware returns `Response | null`
  - If Response → request handled by plugin
  - If null → continue to next handler (paste storage)
  - Auth middleware returns 401 Response for auth failures
  - Auth middleware returns null for authenticated requests (pass through)

- **Cookie-based auth**: Tokens stored in httpOnly cookie + localStorage
  - httpOnly cookie for server-side validation (secure, not accessible to JS)
  - localStorage for client-side auth state (GitHubProvider reads it)
  - Phase 1 established this dual-storage pattern

### Integration Points

- **Paste service handler**: `apps/paste-service/core/handler.ts`
  - Auth middleware composes here before paste GET/POST routes
  - Order: auth check → paste lookup → serve content
  - Auth failure short-circuits (returns 401, never reaches paste storage)

- **Portal share URLs**: `https://share.plannotator.ai/#[hash]` or custom base
  - Hash contains compressed plan + ACL metadata
  - Server decompresses, checks ACL type, enforces auth if whitelist
  - Token can be passed as query param: `?token=xyz`

</code_context>

<specifics>
## Specific Ideas

- Auth-required error page should show:
  - "This share requires GitHub authentication"
  - "Sign in with GitHub" button (links to /api/auth/github/login)
  - No plan metadata, author, or title (D-06)
  
- Session cookie attributes:
  - `HttpOnly` (not accessible to JavaScript)
  - `SameSite=Lax` (protects against CSRF, allows OAuth redirect)
  - No `Max-Age` (session-only per D-04)
  - `Secure` only on HTTPS (not localhost)

- OAuth state cookie for return_to:
  - Store original share URL in state cookie during login redirect
  - Encode as JSON: `{csrf: "random", return_to: "/share/xyz"}`
  - Validate and redirect after successful callback

- KV cache key format: `token:sha256(token_value)`
  - Already implemented in middleware.ts
  - 5-minute TTL matches existing TOKEN_CACHE_TTL_SECONDS constant

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-authentication-access-control*
*Context gathered: 2026-04-02*
