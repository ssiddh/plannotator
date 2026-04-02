# Phase 2: Authentication & Access Control - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-02
**Phase:** 02-authentication-access-control
**Areas discussed:** Auth gate placement, Unauthenticated experience, Token validation strategy, ACL enforcement scope

---

## Auth Gate Placement

| Option | Description | Selected |
|--------|-------------|----------|
| Before HTML serves | Server checks auth before returning any HTML. Unauthenticated users never see the plan UI. More secure, standard pattern. Middleware runs in request handler before serving static assets. | ✓ |
| After UI loads | Serve HTML immediately, check auth via client-side API call. Faster initial load, user sees UI briefly before redirect. Requires client state management for auth gate. | |
| Hybrid (quick pre-check + verify) | Quick cookie check before HTML, full validation after load. Best of both worlds but more complex. Two validation points to maintain. | |

**User's choice:** Before HTML serves (Recommended)
**Notes:** Most secure approach - private content never leaves server until auth is verified.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Skip auth for public | Public shares accessible without login. Matches expected behavior - 'public' means anyone can view. Auth only enforced for ACL type 'whitelist'. | ✓ |
| Optional auth for public | Public shares allow both authenticated and anonymous access. Auth state shown in UI but not required. Enables features like 'claim annotations' if logged in. | |
| Always require auth | Even public shares require GitHub login. Simplifies logic but reduces share reach. May frustrate users expecting 'public' to mean anonymous. | |

**User's choice:** Skip auth for public (Recommended)
**Notes:** 'Public' should mean truly anonymous access. Auth only for whitelist-protected shares.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Support token param | Allow ?token=xyz for programmatic/API access to private shares. extractToken() already checks query params. Useful for CI/automation. Token still validated against GitHub API. | ✓ |
| Cookie/header only | Tokens only accepted via httpOnly cookie or Authorization header. More secure (tokens not in URL history/logs) but less convenient for sharing. Standard OAuth pattern. | |

**User's choice:** Support token param (Recommended)
**Notes:** Enables CI/automation access to private shares without browser OAuth flow.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Session-only (browser close) | Auth token cleared when browser closes. User logs in each session. Most secure, follows banking apps. Cookie without Max-Age attribute. | ✓ |
| 7 days | Token persists for a week. Balances security and UX. Standard for developer tools. Cookie with Max-Age=604800. | |
| 30 days (long-lived) | Token persists for a month. Rare re-auth, better UX. Risk if device compromised. Cookie with Max-Age=2592000. | |
| You decide | Claude chooses session duration based on security best practices for review tools. | |

**User's choice:** Session-only (browser close)
**Notes:** Most secure option - reduces risk if device is left unlocked or shared. User re-authenticates each browser session.

---

## Unauthenticated Experience

| Option | Description | Selected |
|--------|-------------|----------|
| Full-page error | Dedicated auth-required page with clear message and login button. Standard pattern, no confusion. Server returns 401 with HTML error page instead of plan content. | ✓ |
| Modal overlay | Plan UI loads, modal blocks interaction until auth. User sees blurred plan behind modal. More work - need to serve HTML then show modal client-side. | |
| Inline banner | Plan UI partially visible with top banner saying 'Sign in to view'. Content hidden below. Unusual pattern, may confuse users. | |

**User's choice:** Full-page error (Recommended)
**Notes:** Clear, standard pattern. No confusion about what's needed.

---

| Option | Description | Selected |
|--------|-------------|----------|
| No preview | No plan info shown before auth. 'This share requires authentication' with no details. Most secure - private means private. | ✓ |
| Show metadata only | Display plan title, author, created date - but not content. Helps user decide if they want to auth. Metadata leak risk. | |
| You decide | Claude chooses based on security best practices for access control. | |

**User's choice:** No preview (Recommended)
**Notes:** Private means private - zero data leakage before authentication.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Redirect to OAuth | Full-page redirect to /api/auth/github/login → GitHub → callback. Standard OAuth flow. handleLogin() and handleCallback() already implemented. | ✓ |
| Popup window | Open OAuth in popup, return to main window after auth. Avoids losing state but popup blockers may interfere. Requires postMessage between windows. | |

**User's choice:** Redirect to OAuth (Recommended)
**Notes:** Standard OAuth 2.0 authorization code flow. Already implemented in packages/github/server/oauth.ts.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Original share URL | Redirect back to the exact share URL they tried to access. Standard OAuth return_to pattern. Store original URL in oauth_state cookie. | ✓ |
| Portal home | Redirect to portal landing page, user navigates back manually. Simpler but frustrating - they have to find the share link again. | |

**User's choice:** Original share URL (Recommended)
**Notes:** Standard OAuth return_to pattern. Store original URL in oauth_state cookie during login redirect.

---

## Token Validation Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Once on load + cache | Validate on initial share access, cache result for session. Fast UX, acceptable risk for review tool. validateGitHubToken() with KV cache (5-min TTL) handles this. | ✓ |
| Every API request | Validate on every /api/github/* call. Most secure but slow (GitHub rate limits). Every PR sync, every ACL check hits GitHub API. | |
| Lazy (only for PR ops) | Skip validation on share access, only validate when user tries PR operations. Fast initial load but may surprise user with late auth failure. | |

**User's choice:** Once on load + cache (Recommended)
**Notes:** Fast UX with acceptable security risk. KV cache (5-min TTL) reduces GitHub API calls.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Use KV cache | Cache validation results for 5 minutes (existing TTL). Reduces GitHub rate limit pressure. Cloudflare Workers KV for paste-service, in-memory Map for local dev. | ✓ |
| No caching | Validate against GitHub API every time. Most current but slow and rate-limited. May hit GitHub's 5000 req/hour limit on busy days. | |
| You decide | Claude chooses caching strategy based on rate limit and performance trade-offs. | |

**User's choice:** Use KV cache (Recommended)
**Notes:** Prevents hitting GitHub's 5000 req/hour rate limit on busy days. In-memory Map for local dev, KV for production.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Clear state + require re-auth | Clear token cookie + localStorage, show full-page 'Session expired, please sign in again' error. User re-authenticates. Standard pattern. | ✓ |
| Silent re-auth attempt | Try to refresh token automatically if refresh_token exists. Falls back to re-auth prompt if refresh fails. More seamless but complex. | |
| Allow read-only mode | Let user continue viewing plan but block PR operations. Show inline 'Auth expired' banner with re-auth button. Graceful degradation. | |

**User's choice:** Clear state + require re-auth (Recommended)
**Notes:** Standard pattern for token expiry. Clear state and require full re-authentication.

---

| Option | Description | Selected |
|--------|-------------|----------|
| No proactive refresh | Only refresh when user hits expired token. Simpler, less background work. GitHub tokens typically valid for months - expiry rare. | ✓ |
| Background refresh | Check token expiry periodically (e.g., on page visibility change), refresh if < 1 day left. Seamless but adds complexity. Requires refresh_token storage. | |

**User's choice:** No proactive refresh (Recommended)
**Notes:** Simpler implementation. GitHub tokens typically valid for months - expiry is a rare edge case.

---

## ACL Enforcement Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Only on initial access | Check ACL once when user loads share. Trust that result for the session. Simpler, faster. checkAccess() validates user/team via GitHub API on load only. | ✓ |
| Before every GitHub sync | Re-check ACL before each 'Sync from/to GitHub' operation. Ensures user still has access. Slower but catches mid-session ACL changes. | |
| Every annotation action | Check ACL on every annotation create/update/delete. Most secure but slow - constant GitHub API calls. Likely overkill for review tool. | |

**User's choice:** Only on initial access (Recommended)
**Notes:** Simpler and faster. Trust initial ACL check for duration of session.

---

| Option | Description | Selected |
|--------|-------------|----------|
| No ACL for annotations | Annotations are local to the user's session, not synced until explicit 'Sync to GitHub'. No ACL check needed - they're just drafts. ACL only matters when pushing to GitHub. | ✓ |
| ACL for all annotations | Check ACL before allowing any annotation. Prevents unauthorized users from drafting feedback. More secure but slower UX. | |

**User's choice:** No ACL for annotations (Recommended)
**Notes:** Annotations are local drafts. ACL only matters when syncing to GitHub (Phase 6).

---

| Option | Description | Selected |
|--------|-------------|----------|
| Allow finish session | User can continue viewing/annotating until they close the tab. Next visit triggers auth failure. Graceful - they already saw the content. | ✓ |
| Immediate kick-out | Detect ACL change (requires polling or SSE), show 'Access revoked' error and lock UI. Real-time enforcement but adds complexity. | |
| Block GitHub ops only | User can continue viewing but PR sync operations fail with 'Access denied'. Partial enforcement - read access preserved. | |

**User's choice:** Allow finish session (Recommended)
**Notes:** Graceful degradation. No real-time ACL change detection. Next visit triggers auth failure.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Single permission level | ACL whitelist means full access - view + annotate + sync to GitHub. Simpler, matches PR workflow (reviewers have write access). | ✓ |
| Read vs write split | Some users can view only, others can sync to GitHub. Requires ACL schema changes (whitelist_ro vs whitelist_rw). More flexible but complex. | |
| You decide | Claude chooses permission model based on typical PR review access patterns. | |

**User's choice:** Single permission level (Recommended)
**Notes:** Simpler ACL schema. Whitelist = full access (view + annotate + sync). Matches typical PR review workflow.

---

## Claude's Discretion

- Error message wording for auth-required page
- httpOnly cookie SameSite attribute (Lax vs Strict)
- Cache key hashing algorithm for KV (sha256 already used in middleware.ts)
- Token cleanup on logout (if explicit logout endpoint added)

## Deferred Ideas

None - discussion stayed within phase scope
