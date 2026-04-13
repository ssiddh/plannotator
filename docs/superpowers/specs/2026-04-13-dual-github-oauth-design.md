# Dual GitHub OAuth for Local and Portal Sessions

**Date:** 2026-04-13  
**Status:** Approved  
**Author:** Claude (Sonnet 4.5)

---

## Context

Plannotator has two distinct user flows that both require GitHub authentication:

1. **Local flow**: Users run Plannotator binary locally, which starts a plan server on `localhost:19432`. They need to authenticate with GitHub to create PRs and generate authenticated share links.

2. **Portal flow**: Users receive share links that open in the hosted portal (`https://f8b2b297.plannotator-poc.pages.dev`). They need to authenticate with GitHub to view and annotate private plans.

**Current problem**: Only one GitHub OAuth app is configured, with callback URL set to the production paste service. This works for the portal flow but breaks local sessions because GitHub OAuth won't redirect to `localhost`.

**Why we need this**: For a proof-of-concept demo across the organization:
- Multiple users will have the Plannotator binary installed locally
- Users need to create PRs and authenticated shares from their local sessions
- Share recipients need to authenticate to view/annotate plans in the portal
- The paste service is always hosted (never local), so share URLs are centralized

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│ Local Plannotator Session                                        │
│ http://localhost:19432                                           │
│                                                                  │
│ User creates plan → wants to authenticate                        │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ OAuth Flow
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ GitHub OAuth App #1 (Local)                                      │
│ Client ID: <new-local-client-id>                                │
│ Callback: http://localhost:19432/api/auth/github/callback       │
│                                                                  │
│ Handles: Local Plannotator authentication                       │
└──────────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────┐
│ Portal Session                                                   │
│ https://f8b2b297.plannotator-poc.pages.dev                      │
│                                                                  │
│ User opens share link → wants to authenticate                   │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ OAuth Flow
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ GitHub OAuth App #2 (Production) [EXISTING]                     │
│ Client ID: Ov23liegyqgZNEU4sfGF                                 │
│ Callback: https://plannotator-poc.ssiddh.workers.dev/api/...    │
│                                                                  │
│ Handles: Portal authentication                                   │
└──────────────────────────────────────────────────────────────────┘
```

**Key insight**: Two different servers handle OAuth:
- **Local plan server** (`apps/hook/server/`) handles local session OAuth
- **Paste service** (`apps/paste-service/`) handles portal session OAuth

---

## Design

### 1. GitHub OAuth Apps Configuration

**Create new local OAuth app:**
- Name: "Plannotator Local"
- Homepage URL: `http://localhost:19432`
- Authorization callback URL: `http://localhost:19432/api/auth/github/callback`
- Scopes: `repo`, `read:user`, `read:org`

**Keep existing production OAuth app:**
- Name: "Plannotator POC"
- Client ID: `Ov23liegyqgZNEU4sfGF` (existing)
- Homepage URL: `https://f8b2b297.plannotator-poc.pages.dev`
- Authorization callback URL: `https://plannotator-poc.ssiddh.workers.dev/api/auth/github/callback`

### 2. Local Plan Server OAuth Implementation

**Location:** `apps/hook/server/index.ts` (or new `apps/hook/server/oauth.ts`)

**New endpoints:**

```typescript
// /api/auth/github/login
// Initiates OAuth flow, redirects to GitHub
GET /api/auth/github/login
  → Generates CSRF state token
  → Stores state in cookie
  → Redirects to: https://github.com/login/oauth/authorize?
      client_id=<LOCAL_CLIENT_ID>&
      redirect_uri=http://localhost:19432/api/auth/github/callback&
      scope=repo+read:user+read:org&
      state=<csrf_token>

// /api/auth/github/callback  
// Handles GitHub redirect, exchanges code for token
GET /api/auth/github/callback?code=<code>&state=<state>
  → Verifies CSRF state matches cookie
  → Exchanges code for access_token via GitHub API
  → Fetches user info from GitHub API
  → Redirects to: http://localhost:19432#auth=<base64_json>
     where base64_json = btoa(JSON.stringify({ token, username, avatar }))
```

**Configuration:**
- Read from environment variables:
  - `GITHUB_CLIENT_ID_LOCAL` (new)
  - `GITHUB_CLIENT_SECRET_LOCAL` (new)
- Default OAuth redirect URI: `http://localhost:19432/api/auth/github/callback` (hardcoded, since port is fixed)

**Code reuse:**
- Extract OAuth logic from `apps/paste-service/auth/github.ts`
- Create shared OAuth utility in `packages/github/server/oauth.ts`
- Both local server and paste service import from shared package

### 3. Paste Service OAuth (No Changes)

**Location:** `apps/paste-service/auth/github.ts`

Keep existing implementation:
- Endpoints: `/api/auth/github/login`, `/api/auth/github/callback`
- Uses production OAuth app credentials
- Redirects to portal after successful auth

**Configuration:**
- Environment variables already set:
  - `GITHUB_CLIENT_ID` (production)
  - `GITHUB_CLIENT_SECRET` (production secret)
  - `OAUTH_REDIRECT_URI` (production callback URL)

### 4. Client-Side OAuth Detection

**Location:** `packages/editor/App.tsx`, `packages/review-editor/App.tsx`

**Current behavior:**
```typescript
// Line 2105 in App.tsx
window.location.href = `${pasteApiUrl || 'http://localhost:19433'}/api/auth/github/login`;
```

**New behavior:**
```typescript
// Detect if we're in local mode or portal mode
const isLocalMode = window.location.hostname === 'localhost';
const authUrl = isLocalMode 
  ? 'http://localhost:19432/api/auth/github/login'  // Local plan server
  : `${pasteApiUrl || 'https://plannotator-poc.ssiddh.workers.dev'}/api/auth/github/login`;  // Paste service

window.location.href = authUrl;
```

**Why this works:**
- Portal always runs at `https://f8b2b297.plannotator-poc.pages.dev` (not localhost)
- Local Plannotator always runs at `http://localhost:19432`
- Simple hostname check determines which OAuth flow to use

### 5. Environment Variables

**Local plan server** (`apps/hook/server/.env` or passed via command):
```bash
GITHUB_CLIENT_ID_LOCAL=<new-local-client-id>
GITHUB_CLIENT_SECRET_LOCAL=<new-local-secret>
```

**Paste service** (already configured):
- `.dev.vars` for local development (if needed)
- `wrangler.toml` + secrets for production

### 6. Token Storage

**No changes needed** - both flows use the same client-side storage:
- Token stored in `localStorage.getItem('plannotator_github_token')` (see `packages/github/client/GitHubProvider.tsx` line 30)
- Same token key works for both local and portal sessions

---

## Data Flow

### Local Session OAuth Flow

```
1. User at http://localhost:19432 clicks "Sign in with GitHub"
   ↓
2. Browser navigates to http://localhost:19432/api/auth/github/login
   ↓
3. Local plan server generates CSRF token, stores in cookie
   ↓
4. Server redirects to GitHub: 
   https://github.com/login/oauth/authorize?
     client_id=<LOCAL_CLIENT_ID>&
     redirect_uri=http://localhost:19432/api/auth/github/callback&
     state=<csrf_token>
   ↓
5. User approves on GitHub
   ↓
6. GitHub redirects to http://localhost:19432/api/auth/github/callback?code=<code>&state=<state>
   ↓
7. Local server verifies CSRF, exchanges code for token
   ↓
8. Server redirects to http://localhost:19432#auth=<base64_json>
   ↓
9. Client-side JavaScript extracts token from hash, stores in localStorage
   ↓
10. User is authenticated, can create PRs / authenticated shares
```

### Portal Session OAuth Flow (Unchanged)

```
1. User at https://portal.pages.dev clicks "Sign in with GitHub"
   ↓
2. Browser navigates to https://paste-service.workers.dev/api/auth/github/login
   ↓
3. Paste service generates CSRF token, stores in cookie
   ↓
4. Service redirects to GitHub:
   https://github.com/login/oauth/authorize?
     client_id=<PRODUCTION_CLIENT_ID>&
     redirect_uri=https://paste-service.workers.dev/api/auth/github/callback&
     state=<csrf_token>
   ↓
5. User approves on GitHub
   ↓
6. GitHub redirects to https://paste-service.workers.dev/api/auth/github/callback?code=<code>
   ↓
7. Paste service verifies CSRF, exchanges code for token
   ↓
8. Service redirects to https://portal.pages.dev#auth=<base64_json>
   ↓
9. Client-side JavaScript extracts token, stores in localStorage
   ↓
10. User is authenticated, can view/annotate private plans
```

---

## Implementation Plan

### Phase 1: GitHub OAuth Apps Setup
1. Create new "Plannotator Local" GitHub OAuth app
2. Configure callback URL: `http://localhost:19432/api/auth/github/callback`
3. Note down client ID and secret

### Phase 2: Shared OAuth Utilities
1. Create `packages/github/server/oauth-local.ts` (or refactor existing)
2. Extract OAuth logic from `apps/paste-service/auth/github.ts`
3. Create reusable functions:
   - `handleLogin(clientId, redirectUri)`
   - `handleCallback(clientId, clientSecret, redirectUri, returnUrl)`
   - `generateState()`, `parseCookies()`

### Phase 3: Local Plan Server OAuth
1. Add OAuth endpoints to `apps/hook/server/index.ts`:
   - `GET /api/auth/github/login`
   - `GET /api/auth/github/callback`
2. Read local OAuth credentials from environment variables
3. Use shared OAuth utilities from Phase 2
4. Redirect to `http://localhost:19432#auth=...` after success

### Phase 4: Client-Side Detection
1. Update `packages/editor/App.tsx` (plan editor)
2. Update `packages/review-editor/App.tsx` (review editor)
3. Add `isLocalMode` detection based on hostname
4. Route to appropriate OAuth endpoint

### Phase 5: Configuration & Documentation
1. Update `.env.example` with local OAuth variables
2. Update `GITHUB-INTEGRATION-VERIFICATION.md` with dual OAuth setup
3. Add setup instructions for org users
4. Document demo flow

---

## Testing Strategy

### Local OAuth Testing
```bash
# 1. Set up local OAuth credentials
export GITHUB_CLIENT_ID_LOCAL=<new-client-id>
export GITHUB_CLIENT_SECRET_LOCAL=<new-secret>

# 2. Start local Plannotator
claude --plugin-dir ./apps/hook

# 3. Trigger plan review, click "Sign in with GitHub"
# 4. Verify redirect to GitHub with localhost callback
# 5. Approve, verify redirect back to localhost:19432#auth=...
# 6. Verify token stored in localStorage
# 7. Test PR creation with authenticated token
```

### Portal OAuth Testing
```bash
# 1. Create authenticated share from local session
# 2. Copy share URL
# 3. Open in incognito window
# 4. Click "Sign in with GitHub"
# 5. Verify redirect to GitHub with production callback
# 6. Approve, verify redirect back to portal
# 7. Verify token stored, plan visible
```

### End-to-End Demo Flow
```bash
# Local user creates authenticated PR
1. Start Plannotator locally
2. Authenticate with GitHub (local OAuth)
3. Create plan with annotations
4. Export as GitHub PR
5. Generate share link

# Remote user reviews
6. Open share link in browser (portal)
7. Authenticate with GitHub (production OAuth)
8. View plan and add annotations
9. Sync annotations to GitHub PR
```

---

## Security Considerations

1. **CSRF Protection**: Both OAuth flows use state parameter with httpOnly cookies
2. **Token Storage**: Tokens stored in localStorage (not cookies) to avoid CSRF on API calls
3. **Secrets Management**: 
   - Local secrets stored in environment variables (user's machine)
   - Production secrets stored in Cloudflare secrets (never in git)
4. **Callback URL Validation**: GitHub validates callback URLs match registered apps
5. **Scope Minimization**: Request only necessary scopes (`repo`, `read:user`, `read:org`)

---

## Rollout Plan

### For Demo (Immediate)
1. Create local GitHub OAuth app (5 minutes)
2. Implement local server OAuth endpoints (2-3 hours)
3. Update client-side detection logic (30 minutes)
4. Test end-to-end flow (1 hour)
5. Document setup for demo users

### For Production (Future)
1. Create organization-level GitHub App (more secure than OAuth app)
2. Support installation per repository
3. Add refresh token support
4. Add token expiration handling

---

## Open Questions

1. **Port conflicts**: What if a user already has something running on port 19432?
   - **Resolution**: Document that port 19432 must be available, or make it configurable
   
2. **Multiple local sessions**: Can a user run multiple Plannotator instances?
   - **Resolution**: No, fixed port means one instance at a time
   
3. **Corporate networks**: Will localhost OAuth work behind corporate proxies?
   - **Resolution**: Should work (localhost doesn't go through proxy), but may need testing

---

## Success Criteria

✅ Local Plannotator sessions can authenticate with GitHub  
✅ Portal sessions can authenticate with GitHub  
✅ Users can create PRs from local sessions  
✅ Users can generate authenticated share links  
✅ Share recipients can view/annotate plans after authenticating  
✅ No conflicts between local and portal OAuth flows  
✅ Demo flow works end-to-end for org users
