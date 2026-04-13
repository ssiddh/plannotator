# Authenticated Share Debugging Session

**Date**: 2026-04-13  
**Status**: ISSUE IDENTIFIED - Share URL pointing to localhost instead of portal

## Problem Summary

After fixing the `undefined/api/paste` bug, authenticated shares are now being created but the share URL is incorrect and not enforcing authentication.

## Current Behavior

### What Happens:
1. User clicks "Create Authenticated Share" in local Plannotator binary
2. POST request succeeds to `https://plannotator-poc.ssiddh.workers.dev/api/paste`
3. Server returns a paste ID (e.g., `NHilNJIF`)
4. **BUG**: Share URL generated is `http://localhost:59924/p/NHilNJIF`
5. **BUG**: Opening the URL shows the plan immediately without GitHub authentication

### Expected Behavior:
1. Share URL should be: `https://plannotator-poc.pages.dev/p/NHilNJIF`
2. When opening the URL, user should be prompted to authenticate with GitHub
3. After successful GitHub authentication, user sees the plan
4. Unauthenticated users should see a "Sign in with GitHub" prompt

## Technical Analysis

### Share URL Generation

The authenticated share URL is constructed after the POST request to `/api/paste` returns.

**Location**: `packages/ui/components/ExportModal.tsx` line 308-312

```typescript
if (res.ok) {
  const result = await res.json();
  setCreatedShareId(result.id);
  if (result.github_pr?.pr_url) {
    setCreatedPrUrl(result.github_pr.pr_url);
  }
}
```

**Issue**: The code only stores the `id`, but the actual URL shown to the user is constructed somewhere else.

### Share URL Display

Need to find where the share URL is displayed to the user. Likely in the modal UI after `createdShareId` is set.

### Authentication Flow

The authentication check should happen in one of these places:
1. **Server-side**: Paste service checks auth before returning the plan data
2. **Client-side**: Portal checks auth before displaying the plan

For authenticated shares, the flow should be:
1. User opens `/p/{id}` URL on the portal
2. Portal loads and tries to fetch plan from paste service
3. Paste service returns 401/403 if user not authenticated or not in ACL
4. Portal shows "Sign in with GitHub" button
5. After OAuth, user gets redirected back and can view the plan

## Files to Investigate

### Frontend (URL Generation):
1. `packages/ui/components/ExportModal.tsx` - Where is the share URL displayed?
2. `packages/ui/hooks/useSharing.ts` - Share URL generation logic
3. `packages/ui/utils/sharing.ts` - `createShortShareUrl()` function

### Backend (Paste Service):
1. `apps/paste-service/core/handler.ts` - How is paste creation handled?
2. `apps/paste-service/core/handler.ts` - GET /api/paste/:id - Does it check auth?
3. Does the paste service return metadata indicating the share URL?

### Portal (Client Loading):
1. Where is the portal hosted? (`https://plannotator-poc.pages.dev`)
2. Does it have special handling for `/p/{id}` routes?
3. Is there a separate portal app we haven't looked at?

## Previous Fix Summary

### What Was Fixed:
- Changed `DEFAULT_PASTE_API` to `https://plannotator-poc.ssiddh.workers.dev`
- Changed `DEFAULT_SHARE_BASE` to `https://plannotator-poc.pages.dev`
- Added fallbacks in ExportModal.tsx to prevent `undefined` URLs

### What Still Needs Fixing:
1. Share URL construction is using `localhost` instead of portal URL
2. No authentication enforcement when opening the share URL
3. The connection between paste service and portal isn't working correctly

## Environment Info

- **Local binary**: `~/.local/bin/plannotator` (80MB, built Apr 13 15:56)
- **Paste service**: `https://plannotator-poc.ssiddh.workers.dev`
- **Portal**: `https://plannotator-poc.pages.dev`
- **Test share URL generated**: `http://localhost:59924/p/NHilNJIF`
- **Expected share URL**: `https://plannotator-poc.pages.dev/p/NHilNJIF`

## Fix Required

**File**: `packages/ui/components/ExportModal.tsx`

**Line 525** - Change:
```typescript
// BEFORE:
value={`${window.location.origin}/p/${createdShareId}`}

// AFTER:
value={`${shareBaseUrl || 'https://plannotator-poc.pages.dev'}/p/${createdShareId}`}
```

**Line 531** - Change:
```typescript
// BEFORE:
navigator.clipboard.writeText(`${window.location.origin}/p/${createdShareId}`);

// AFTER:
navigator.clipboard.writeText(`${shareBaseUrl || 'https://plannotator-poc.pages.dev'}/p/${createdShareId}`);
```

Note: `shareBaseUrl` is already a prop passed to `ExportModal` from the parent component, so we just need to use it instead of `window.location.origin`.

## Next Steps

1. ✅ **DONE**: Find where share URL is displayed - Found at lines 525, 531
2. **Apply the fix** above
3. **Rebuild binary** and test
4. **Verify portal deployment** - Is plannotator-poc.pages.dev actually deployed?
5. **Check ACL enforcement** - Does paste service check GitHub auth for private shares?
6. **Test full E2E flow** with the portal URL

## ROOT CAUSE IDENTIFIED ✓

**Location**: `packages/ui/components/ExportModal.tsx` lines 525 and 531

```typescript
// LINE 525 - Displays the share URL
value={`${window.location.origin}/p/${createdShareId}`}

// LINE 531 - Copies to clipboard
navigator.clipboard.writeText(`${window.location.origin}/p/${createdShareId}`);
```

**Problem**: Using `window.location.origin` which is the local plan server URL (`http://localhost:59924`), not the portal URL.

**Solution**: Should use `shareBaseUrl` prop (which comes from `PLANNOTATOR_SHARE_URL` or `DEFAULT_SHARE_BASE`) instead of `window.location.origin`.

## Questions Answered

1. ✅ `localhost:59924` is the local plan server's URL where the modal is running
2. ✅ Share URL is constructed with `window.location.origin` - this is wrong!
3. The paste service returns just the ID, not the full URL (this is correct)
4. The portal is a separate deployment at plannotator-poc.pages.dev

## Related Code References

- Previous OAuth fix: commit `072a51d` - Fixed undefined URLs
- Paste service config: `apps/paste-service/wrangler.toml`
- Portal URL env var: `PLANNOTATOR_SHARE_URL` (should be set to portal URL)
- Paste API env var: `PLANNOTATOR_PASTE_URL` (working correctly now)

## Testing Commands

```bash
# Check if paste was created
curl -H "Authorization: Bearer $GITHUB_TOKEN" \
  https://plannotator-poc.ssiddh.workers.dev/api/paste/NHilNJIF

# Test authenticated access (should fail without token)
curl https://plannotator-poc.ssiddh.workers.dev/api/paste/NHilNJIF

# Check what portal returns
curl https://plannotator-poc.pages.dev/p/NHilNJIF
```
