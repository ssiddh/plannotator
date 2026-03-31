# Testing Portal Integration

The portal integration is complete. Here's how to test it locally.

## What's Been Integrated

✅ **Hooks Added to App.tsx:**
- `useGitHubPRSync` - Polls for PR review comments every 5 seconds
- Merges PR comments as annotations with GitHub attribution
- Automatic GitHub token loading from localStorage
- Automatic pasteId extraction from URL

✅ **Components Added:**
- `PresencePanel` - Shows active viewers with GitHub avatars
- Fixed position in top-right corner
- Auto-hides when no viewers present

✅ **State Management:**
- GitHub token state (`githubToken`)
- Paste ID state (`pasteId`)
- PR metadata state (`prMetadata`)

## Prerequisites

1. **Paste service running:**
   ```bash
   cd apps/paste-service
   bun run targets/bun.ts
   ```

2. **GitHub OAuth configured:**
   - Check `apps/paste-service/.dev.vars`
   - Should have `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`

## Testing Steps

### Test 1: Basic Integration (No Auth)

Start the portal dev server:

```bash
cd apps/portal
bun run dev
```

Open http://localhost:3001 - you should see the demo plan with no errors.

### Test 2: With GitHub Token (Manual)

1. **Get a GitHub token:**
   - Go to https://github.com/settings/tokens
   - Generate a new token with `repo` scope

2. **Set token in browser:**
   ```javascript
   // Open browser console (F12) on portal
   localStorage.setItem('plannotator_github_token', 'YOUR_TOKEN_HERE');
   location.reload();
   ```

3. **Create a test paste with PR export:**
   ```bash
   export GITHUB_TOKEN=YOUR_TOKEN_HERE

   # Create paste
   curl -X POST http://localhost:19433/api/paste \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer $GITHUB_TOKEN" \
     -d '{
       "data": "IyBUZXN0IFBsYW4=",
       "acl": {"type": "public"},
       "github_export": true,
       "plan_markdown": "# Test Plan\n\nThis is a test."
     }'
   ```

4. **Open the paste URL:**
   - Get the `id` from response
   - Open `http://localhost:3001/p/{id}`
   - You should see the PresencePanel appear (with your GitHub avatar)

### Test 3: PR Comment Sync

1. **Create a paste with PR export** (see Test 2)
2. **Get the PR URL** from the response (`github_pr.pr_url`)
3. **Add a review comment** on GitHub (on any line)
4. **Wait up to 5 seconds** - comment should appear as an annotation
5. **Verify GitHub attribution:**
   - Annotation should have GitHub avatar
   - Should show "GitHub PR" badge
   - Clicking should open GitHub comment URL

### Test 4: Multi-User Presence

1. **Open the same paste URL** in two different browsers
2. **Both should be authenticated** (set token in each)
3. **Verify presence panel** shows both users
4. **Close one browser** → viewer should disappear after ~30s

### Test 5: Authenticated Sharing UI

**Test the new Export Modal features:**

1. **Open the portal** at http://localhost:3001
2. **Set GitHub token** in browser console:
   ```javascript
   localStorage.setItem('plannotator_github_token', 'YOUR_TOKEN');
   location.reload();
   ```

3. **Click the Export button** in the top-right
4. **Go to the Share tab**
5. **You should see:**
   - "Authenticated Sharing" section
   - "Require authentication" checkbox
   - Username and team input fields
   - "Export to GitHub PR" checkbox (disabled until auth required)
   - "Create Authenticated Share" button

6. **Test creating a private share:**
   - Check "Require authentication"
   - Enter your GitHub username in the users field
   - Check "Export to GitHub PR"
   - Click "Create Authenticated Share"
   - Wait for success message
   - Should see share URL and PR URL

7. **Test without authentication:**
   - Clear token: `localStorage.removeItem('plannotator_github_token')`
   - Reload page
   - Open Export modal → Share tab
   - Should see "Sign in with GitHub" button
   - Clicking it should redirect to OAuth flow

## Expected Behavior

### PR Annotations

PR comments should appear as annotations with:
- ✅ GitHub avatar in annotation card
- ✅ "GitHub PR" badge
- ✅ `source: "github-pr"` field
- ✅ Click to open GitHub comment
- ✅ Distinct styling (border color)

### Presence Panel

When authenticated and viewing a paste:
- ✅ Shows in top-right corner
- ✅ Displays GitHub avatars (32x32, rounded)
- ✅ Shows viewer count
- ✅ Viewers overlap slightly
- ✅ Hover shows username tooltip
- ✅ Green indicator for active viewers

## Troubleshooting

### "Paste service not running"
```bash
cd apps/paste-service
bun run targets/bun.ts
```

### "401 Unauthorized"
- Check GitHub token is valid
- Token needs `repo` scope for PR creation
- Token should be in localStorage: `plannotator_github_token`

### "No PR created"
- Check OAuth credentials in `.dev.vars`
- Verify `GITHUB_DEFAULT_REPO` is set
- Check repository permissions

### "Comments not syncing"
- Open browser DevTools Network tab
- Should see `/api/pr/{pasteId}/comments` polling every 5s
- Check for 403 (unauthorized) or 404 (no PR)
- Verify `prMetadata` state is set (React DevTools)

### "Presence not working"
- Check `/api/presence/{pasteId}/stream` SSE connection
- Token must be passed in query param
- Heartbeat should fire every 20s
- Check for CORS issues

## Next Steps

After local testing, you can:

1. **Deploy paste service** to Cloudflare Workers
2. **Deploy portal** to static hosting (S3/CloudFront)
3. **Configure production OAuth** app with production URLs
4. **Test with real users** on different networks

## Files Modified

- `packages/editor/App.tsx` - Added hooks, state, and props for authenticated sharing
- `packages/ui/components/ExportModal.tsx` - Added ACL controls and PR export UI
- `test-portal-integration.sh` - Quick test script
- `test-e2e-flow.sh` - Full E2E test with paste creation

## Backend Components Already Complete

✅ Phase 1: Basic Auth & ACL
✅ Phase 2: GitHub OAuth
✅ Phase 3: PR Workflow Integration
✅ Phase 4: Presence Awareness

All backend APIs are functional and tested.
