# Plannotator GitHub OAuth Integration - Verification Guide

**Purpose:** This document helps verify and troubleshoot the GitHub OAuth integration for a self-hosted Plannotator deployment on Cloudflare Workers + Pages.

**Last Updated:** 2026-04-10

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│ Cloudflare Pages (Portal)                                       │
│ https://f8b2b297.plannotator-poc.pages.dev                      │
│                                                                  │
│ - Built from apps/portal/                                       │
│ - Static site with React                                        │
│ - Configured at build time with VITE_PASTE_SERVICE_URL          │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ API Requests
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ Cloudflare Workers (Paste Service + GitHub OAuth)               │
│ https://plannotator-poc.ssiddh.workers.dev                      │
│                                                                  │
│ - Deployed from apps/paste-service/                             │
│ - Handles OAuth flow with GitHub                                │
│ - Stores paste data in KV                                       │
│ - Manages PR creation and sync                                  │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ OAuth
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ GitHub OAuth App                                                 │
│ https://github.com/settings/developers                           │
│                                                                  │
│ - Client ID: Ov23liegyqgZNEU4sfGF                               │
│ - Callback URL must match Worker URL exactly                    │
└──────────────────────────────────────────────────────────────────┘
```

---

## Dual OAuth Architecture

Plannotator uses **two separate GitHub OAuth apps** to support authentication in both local and portal sessions:

### 1. Local OAuth App
- **Purpose:** Authenticate users running Plannotator locally on their machines
- **Callback URL:** `http://localhost:19432/api/auth/github/callback`
- **Handler:** Local plan server (`packages/server/index.ts`)
- **Configuration:** `GITHUB_CLIENT_ID_LOCAL` and `GITHUB_CLIENT_SECRET_LOCAL` environment variables

### 2. Production OAuth App
- **Purpose:** Authenticate users viewing shared plans in the hosted portal
- **Callback URL:** `https://plannotator-poc.ssiddh.workers.dev/api/auth/github/callback`
- **Handler:** Paste service (`apps/paste-service/`)
- **Configuration:** `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` (Cloudflare secrets)

### OAuth Flow Selection

The client-side code automatically detects which OAuth flow to use:

```typescript
const h = window.location.hostname;
const isLocalMode = h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '[::1]';
const authUrl = isLocalMode
  ? `${window.location.origin}/api/auth/github/login`  // Local
  : `${pasteApiUrl}/api/auth/github/login`;          // Production
```

**Local session:** User at `localhost:19432` → local OAuth app → authenticate → create PR
**Portal session:** User at hosted portal → production OAuth app → authenticate → view/annotate plan

---

## Configuration Files

### Production Configuration

**`apps/paste-service/wrangler.toml`** - Used by production Worker deployment:

```toml
name = "plannotator-poc"
main = "targets/cloudflare.ts"
compatibility_date = "2024-12-01"

[[kv_namespaces]]
binding = "PASTE_KV"
id = "aad4eeb576274fb981d248d19d44e48f"
preview_id = "6efae5ac33c4443ba8f0a0b83a2eb111"

[vars]
ALLOWED_ORIGINS = "https://f8b2b297.plannotator-poc.pages.dev,http://localhost:3001"
PORTAL_URL = "https://f8b2b297.plannotator-poc.pages.dev"
GITHUB_CLIENT_ID = "Ov23liegyqgZNEU4sfGF"
OAUTH_REDIRECT_URI = "https://plannotator-poc.ssiddh.workers.dev/api/auth/github/callback"
GITHUB_DEFAULT_REPO = "ssiddh/fluffy-parakeet"
GITHUB_PR_BASE_BRANCH = "main"
```

**Location:** `apps/paste-service/wrangler.toml`
**Used by:** `wrangler deploy` (production)
**Key variable:** `OAUTH_REDIRECT_URI` must match GitHub OAuth app callback URL

### Local Development Configuration

**`apps/paste-service/.dev.vars`** - Used by local development server:

```bash
GITHUB_CLIENT_ID=Ov23liegyqgZNEU4sfGF
GITHUB_CLIENT_SECRET=2ccabf9bddb112834111af93df12effd700c680f
OAUTH_REDIRECT_URI=http://localhost:19433/api/auth/github/callback
PORTAL_URL=http://localhost:3001
ALLOWED_ORIGINS=http://localhost:3001,http://localhost:5173
GITHUB_DEFAULT_REPO=ssiddh/fluffy-parakeet
GITHUB_PR_BASE_BRANCH=main
```

**Location:** `apps/paste-service/.dev.vars`
**Used by:** `wrangler dev` (local development)
**Key variable:** `OAUTH_REDIRECT_URI` uses localhost for local testing

### Portal Build Configuration

**Environment variable at build time:**

```bash
export VITE_PASTE_SERVICE_URL=https://plannotator-poc.ssiddh.workers.dev
cd apps/portal
bun run build
```

**Location:** `apps/portal/vite.config.ts` reads `import.meta.env.VITE_PASTE_SERVICE_URL`
**Used by:** Portal build process
**Critical:** This is baked into the JavaScript bundle at build time and cannot be changed after deployment

---

## OAuth Flow

```
1. User visits portal: https://f8b2b297.plannotator-poc.pages.dev
   ↓
2. Portal reads VITE_PASTE_SERVICE_URL from bundle (set at build time)
   → If built correctly: https://plannotator-poc.ssiddh.workers.dev
   → If not: http://localhost:19433 (default)
   ↓
3. User clicks "Sign in with GitHub"
   → Portal redirects to: ${VITE_PASTE_SERVICE_URL}/api/auth/github/login
   ↓
4. Worker /api/auth/github/login reads OAUTH_REDIRECT_URI
   → From wrangler.toml (production) or .dev.vars (local dev)
   → Generates GitHub OAuth URL with this callback
   ↓
5. GitHub OAuth page shown to user
   → If callback URL not registered: "redirect_uri is not associated" error
   ↓
6. User approves, GitHub redirects to callback URL
   → Worker /api/auth/github/callback handles it
   → Exchanges code for access token
   → Redirects back to portal with token in URL fragment
   ↓
7. Portal extracts token from URL, saves to localStorage
   → Key: plannotator_github_token
```

---

## Common Issues and Solutions

### Issue 1: "redirect_uri is not associated with this application"

**Symptom:** GitHub shows this error after clicking "Sign in with GitHub"

**Root Cause:** The `redirect_uri` sent to GitHub doesn't match what's registered in your GitHub OAuth app.

**Debug:**

1. **Check the actual redirect_uri being sent:**
   - Open browser DevTools → Network tab
   - Click "Sign in with GitHub"
   - Look for redirect to `github.com/login/oauth/authorize`
   - Check the `redirect_uri` parameter in the URL

2. **Common scenarios:**

   **Scenario A: Using local development server (most common)**
   ```
   redirect_uri=http://localhost:19433/api/auth/github/callback
   ```
   
   **Cause:** You're running `wrangler dev` locally, which uses `.dev.vars`
   
   **Fix:**
   ```bash
   # Stop local development server
   pkill -f "wrangler dev"
   
   # Verify production Worker is accessible
   curl -I https://plannotator-poc.ssiddh.workers.dev/api/paste
   
   # Update GitHub OAuth app callback to production Worker URL
   # https://github.com/settings/developers
   ```

   **Scenario B: Portal not built with correct environment variable**
   ```
   redirect_uri=http://localhost:19433/api/auth/github/callback
   ```
   
   **Cause:** Portal was built without `VITE_PASTE_SERVICE_URL` set
   
   **Fix:**
   ```bash
   cd apps/portal
   export VITE_PASTE_SERVICE_URL=https://plannotator-poc.ssiddh.workers.dev
   rm -rf dist/
   bun run build
   wrangler pages deploy dist --project-name=plannotator-poc
   ```

   **Scenario C: Wrong callback URL in GitHub OAuth app**
   ```
   redirect_uri=https://plannotator-poc.ssiddh.workers.dev/api/auth/github/callback
   ```
   
   **Cause:** GitHub OAuth app has wrong or no callback URL registered
   
   **Fix:**
   - Go to https://github.com/settings/developers
   - Click your OAuth app
   - Set "Authorization callback URL" to:
     ```
     https://plannotator-poc.ssiddh.workers.dev/api/auth/github/callback
     ```
   - **Important:** No trailing slash, must match exactly

### Issue 2: Portal connects to localhost instead of production

**Symptom:** Portal makes requests to `http://localhost:19433` instead of production Worker

**Root Cause:** Portal was built without `VITE_PASTE_SERVICE_URL` environment variable

**Fix:**
```bash
cd apps/portal
export VITE_PASTE_SERVICE_URL=https://plannotator-poc.ssiddh.workers.dev
rm -rf dist/
bun run build
wrangler pages deploy dist --project-name=plannotator-poc
```

**Verify the fix:**
```bash
# Check the built portal HTML contains the correct URL
grep -r "plannotator-poc.ssiddh.workers.dev" apps/portal/dist/
```

### Issue 3: Local development server accidentally running

**Symptom:** Production portal connects to localhost

**Root Cause:** You have `wrangler dev` running in the background

**Fix:**
```bash
# Check if local paste service is running
lsof -i :19433

# Check for wrangler dev processes
ps aux | grep "wrangler dev"

# Kill any found
pkill -f "wrangler dev"
```

### Issue 4: "GitHub OAuth not configured" error in local session

**Symptom:** Error message when clicking "Sign in with GitHub" in local Plannotator

**Root Cause:** Missing or incorrect local GitHub OAuth app credentials

**Fix:**
1. Verify you created the local GitHub OAuth app (see setup instructions)
2. Check environment variables are set:
   ```bash
   echo $GITHUB_CLIENT_ID_LOCAL
   echo $GITHUB_CLIENT_SECRET_LOCAL
   ```
3. If missing, export them:
   ```bash
   export GITHUB_CLIENT_ID_LOCAL=<your-local-client-id>
   export GITHUB_CLIENT_SECRET_LOCAL=<your-local-secret>
   ```
4. Restart Plannotator

### Issue 5: OAuth works locally but not in portal (or vice versa)

**Symptom:** Authentication works in one environment but fails in the other

**Root Cause:** One of the OAuth apps is misconfigured

**Debug:**
1. Check which callback URL GitHub is redirecting to (look in browser address bar after clicking "Authorize")
2. **Local flow:** Should redirect to `http://localhost:19432/api/auth/github/callback`
3. **Portal flow:** Should redirect to `https://plannotator-poc.ssiddh.workers.dev/api/auth/github/callback`
4. If mismatch, verify the OAuth app callback URLs at https://github.com/settings/developers

---

## Verification Steps

### Step 1: Verify No Local Dev Server Running

```bash
# Should return nothing
lsof -i :19433

# Should return nothing or only non-wrangler processes
ps aux | grep "wrangler dev"
```

### Step 2: Verify Production Worker Deployment

```bash
cd apps/paste-service

# Check recent deployments
wrangler deployments list

# Test Worker is accessible
curl -I https://plannotator-poc.ssiddh.workers.dev/api/paste
# Should return HTTP/2 204 or 405 (not connection refused)
```

### Step 3: Verify Worker Configuration

```bash
cd apps/paste-service

# Check OAUTH_REDIRECT_URI
grep OAUTH_REDIRECT_URI wrangler.toml
# Should show: OAUTH_REDIRECT_URI = "https://plannotator-poc.ssiddh.workers.dev/api/auth/github/callback"

# Check PORTAL_URL
grep PORTAL_URL wrangler.toml
# Should show: PORTAL_URL = "https://f8b2b297.plannotator-poc.pages.dev"
```

### Step 4: Verify GitHub OAuth App Configuration

1. Go to https://github.com/settings/developers
2. Click your OAuth app (should have client ID: `Ov23liegyqgZNEU4sfGF`)
3. Verify "Authorization callback URL" is:
   ```
   https://plannotator-poc.ssiddh.workers.dev/api/auth/github/callback
   ```
4. Verify "Homepage URL" is:
   ```
   https://f8b2b297.plannotator-poc.pages.dev
   ```

### Step 5: Verify Portal Build Configuration

```bash
cd apps/portal

# Check if portal was built with correct environment variable
# This will search the bundled JavaScript for the paste service URL
grep -r "plannotator-poc.ssiddh.workers.dev" dist/

# If nothing found, portal needs to be rebuilt:
export VITE_PASTE_SERVICE_URL=https://plannotator-poc.ssiddh.workers.dev
rm -rf dist/
bun run build
wrangler pages deploy dist --project-name=plannotator-poc
```

### Step 6: Test OAuth Flow

1. Clear browser data:
   - Open DevTools → Application → Local Storage
   - Delete all `plannotator_github_token` entries
   - Clear cookies for `f8b2b297.plannotator-poc.pages.dev`

2. Open portal:
   ```bash
   open https://f8b2b297.plannotator-poc.pages.dev
   ```

3. Open browser DevTools → Network tab

4. Click "Sign in with GitHub"

5. **Verify the redirect URL contains:**
   ```
   https://github.com/login/oauth/authorize?
     client_id=Ov23liegyqgZNEU4sfGF&
     redirect_uri=https://plannotator-poc.ssiddh.workers.dev/api/auth/github/callback&
     scope=repo+read%3Auser+read%3Aorg&
     state=...
   ```
   
   ✅ **Correct:** `redirect_uri=https://plannotator-poc.ssiddh.workers.dev/...`
   ❌ **Wrong:** `redirect_uri=http://localhost:19433/...`

6. You should see GitHub OAuth authorization page (not an error)

7. Click "Authorize"

8. You should be redirected back to portal

9. Verify token saved:
   - Open DevTools → Application → Local Storage
   - Should see `plannotator_github_token` with a value

---

## Testing End-to-End Functionality

### Test 1: Paste Creation

Open browser console on portal and run:

```javascript
fetch('https://plannotator-poc.ssiddh.workers.dev/api/paste', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${localStorage.getItem('plannotator_github_token')}`
  },
  body: JSON.stringify({ data: 'dGVzdCBkYXRh' })
})
.then(r => r.json())
.then(data => console.log('Success:', data))
.catch(e => console.error('Error:', e))
```

**Expected:** `Success: {id: "abc123..."}`

### Test 2: PR Creation

From Claude Code:

```bash
echo "# Test Plan\n\nThis is a test" > test-plan.md
```

Run:
```
/plannotator-annotate test-plan.md
```

In UI:
1. Add annotations
2. Click "Export" → "Create GitHub PR"
3. Enter repo name: `ssiddh/fluffy-parakeet`
4. Verify PR created on GitHub

### Test 3: Bidirectional Sync

**Inbound sync (GitHub → Plannotator):**
1. Add a comment on the GitHub PR
2. In Plannotator, click "Sync from GitHub"
3. Verify the comment appears in Plannotator

**Outbound sync (Plannotator → GitHub):**
1. Add an annotation in Plannotator
2. Click "Sync to GitHub"
3. Verify the annotation appears as a comment on GitHub PR

---

## Quick Troubleshooting Checklist

When GitHub OAuth fails, check in this order:

- [ ] No local `wrangler dev` running: `lsof -i :19433` returns nothing
- [ ] Production Worker is deployed: `wrangler deployments list` shows recent deployment
- [ ] Worker is accessible: `curl -I https://plannotator-poc.ssiddh.workers.dev/api/paste` returns HTTP/2 204
- [ ] Worker config is correct: `grep OAUTH_REDIRECT_URI wrangler.toml` shows Worker URL
- [ ] GitHub OAuth app callback URL is set to: `https://plannotator-poc.ssiddh.workers.dev/api/auth/github/callback`
- [ ] Portal is built with production URL: `grep -r "plannotator-poc.ssiddh.workers.dev" apps/portal/dist/` finds matches
- [ ] Browser DevTools Network tab shows `redirect_uri=https://plannotator-poc.ssiddh.workers.dev/...` (not localhost)

---

## Important URLs

- **Production Worker:** https://plannotator-poc.ssiddh.workers.dev
- **Production Portal:** https://f8b2b297.plannotator-poc.pages.dev
- **GitHub OAuth App Settings:** https://github.com/settings/developers
- **GitHub OAuth Client ID:** Ov23liegyqgZNEU4sfGF
- **Demo Repository:** https://github.com/ssiddh/fluffy-parakeet

---

## Commands Reference

```bash
# Deploy Worker
cd apps/paste-service
wrangler deploy

# Deploy Portal
cd apps/portal
export VITE_PASTE_SERVICE_URL=https://plannotator-poc.ssiddh.workers.dev
bun run build
wrangler pages deploy dist --project-name=plannotator-poc

# View Worker logs
wrangler tail plannotator-poc

# Check Worker deployments
wrangler deployments list

# Stop local development server
pkill -f "wrangler dev"

# Check if local dev is running
lsof -i :19433
ps aux | grep "wrangler dev"

# Test Worker is accessible
curl -I https://plannotator-poc.ssiddh.workers.dev/api/paste
```

---

## File Structure Reference

```
plannotator/
├── apps/
│   ├── paste-service/
│   │   ├── wrangler.toml              # Production config
│   │   ├── .dev.vars                  # Local dev config
│   │   ├── targets/cloudflare.ts      # Worker entry point
│   │   ├── auth/github.ts             # OAuth handlers
│   │   └── core/handler.ts            # Request routing
│   └── portal/
│       ├── vite.config.ts             # Build config
│       ├── utils/auth.ts              # OAuth client logic
│       └── pages/Login.tsx            # Login UI
└── packages/
    └── github/
        ├── server/handler.ts          # GitHub API integration
        └── client/useGitHub.ts        # React hooks
```

---

## Developer Notes

### Why localhost in redirect_uri?

If you see `redirect_uri=http://localhost:19433/...`, one of these is true:

1. **You're running `wrangler dev`** - This uses `.dev.vars` which has localhost configured
2. **Portal was built without `VITE_PASTE_SERVICE_URL`** - Default is localhost:19433
3. **Portal is connecting to local dev server** - Check browser Network tab to see where requests go

### Why does the portal need to be rebuilt?

The `VITE_PASTE_SERVICE_URL` environment variable is **baked into the JavaScript bundle at build time**. Vite replaces `import.meta.env.VITE_PASTE_SERVICE_URL` with the actual string during the build process. After deployment, this cannot be changed — you must rebuild and redeploy.

### Why can't I test locally with production OAuth?

GitHub OAuth apps allow only **one** callback URL. If you set it to the production Worker URL, your local development server (which uses `http://localhost:19433/api/auth/github/callback`) won't work. You'd need to temporarily update `.dev.vars` to use production URLs, but then the OAuth callback would go to production, not localhost — breaking the flow.

**Solution:** Keep two separate GitHub OAuth apps:
- One for production with Worker callback URL
- One for local dev with localhost callback URL

---

## Contact

For issues with this deployment:
- User: ssiddh
- Worker subdomain: ssiddh.workers.dev
- Worker name: plannotator-poc
- Pages project: plannotator-poc
