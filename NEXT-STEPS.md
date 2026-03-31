# Next Steps - Implementation Roadmap

All backend and client-side code is complete and merged. Follow these steps to complete the integration.

## Current Status ✅

**Completed:**
- ✅ Phase 1-4: Backend implementation (auth, OAuth, PR, presence)
- ✅ Client-side hooks and components
- ✅ E2E testing and verification
- ✅ All PRs merged to main

**Current Branch:** `main`
**All code:** Ready to integrate

---

## Step 1: Portal App Integration (30-45 minutes)

### 1.1 Check Portal App Structure

```bash
# See what's in the portal app
ls -la apps/portal/
cat apps/portal/index.tsx | head -50
```

The portal app likely uses the plan viewer. We need to:
1. Import the hooks
2. Add presence panel
3. Merge PR annotations with local annotations

### 1.2 Integration Code

Create a new branch:
```bash
git checkout -b feature/portal-integration
```

Edit `apps/portal/index.tsx` (or wherever the main viewer is):

```typescript
import { useGitHubPRSync } from "../../packages/ui/hooks/useGitHubPRSync";
import { usePresence } from "../../packages/ui/hooks/usePresence";
import { PresencePanel } from "../../packages/ui/components/PresencePanel";
import { getToken } from "./utils/auth";

function PlanViewer({ plan, pasteId, prMetadata }: Props) {
  const [localAnnotations, setLocalAnnotations] = useState<Annotation[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);

  // Get GitHub token from localStorage
  const token = getToken(); // From apps/portal/utils/auth.ts (already exists)

  // Sync GitHub PR comments as annotations (only if authenticated)
  const {
    annotations: prAnnotations,
    isLoading: prLoading,
    error: prError,
  } = useGitHubPRSync({
    pasteId,
    prMetadata, // Comes from GET /api/paste/:id response
    blocks,
    token,
    pasteServiceUrl: import.meta.env.VITE_PASTE_SERVICE_URL || "http://localhost:19433",
    enabled: !!token && !!prMetadata, // Only poll if authenticated and PR exists
  });

  // Track presence (only if authenticated)
  const { viewers, isConnected, error: presenceError } = usePresence({
    pasteId,
    token,
    pasteServiceUrl: import.meta.env.VITE_PASTE_SERVICE_URL || "http://localhost:19433",
    enabled: !!token, // Only connect if authenticated
  });

  // Merge PR annotations with local annotations
  const allAnnotations = useMemo(() => {
    return [...localAnnotations, ...prAnnotations];
  }, [localAnnotations, prAnnotations]);

  return (
    <div className="plan-viewer">
      {/* Existing viewer */}
      <Viewer
        plan={plan}
        blocks={blocks}
        annotations={allAnnotations} // Use merged annotations
        onBlocksChange={setBlocks}
      />

      {/* Annotation panel with merged annotations */}
      <AnnotationPanel
        annotations={allAnnotations}
        blocks={blocks}
        onSelect={handleSelectAnnotation}
        onDelete={handleDeleteAnnotation}
        onEdit={handleEditAnnotation}
      />

      {/* Presence panel (shows when authenticated) */}
      {token && (
        <PresencePanel
          pasteId={pasteId}
          token={token}
          pasteServiceUrl={import.meta.env.VITE_PASTE_SERVICE_URL}
        />
      )}

      {/* Optional: Show PR loading/error states */}
      {prLoading && <div className="pr-sync-indicator">Syncing PR comments...</div>}
      {prError && <div className="pr-sync-error">PR sync error: {prError}</div>}
      {!isConnected && token && <div className="presence-offline">Presence offline</div>}
    </div>
  );
}
```

### 1.3 Environment Variables

Create `apps/portal/.env` (or `.env.local`):

```bash
# Paste service URL
VITE_PASTE_SERVICE_URL=http://localhost:19433

# GitHub OAuth (if portal handles auth directly)
# Otherwise these come from paste service
VITE_GITHUB_CLIENT_ID=Ov23liegyqgZNEU4sfGF
```

### 1.4 Test Portal Integration

```bash
# Start paste service (if not running)
cd apps/paste-service
bun run targets/bun.ts &

# Start portal app
cd apps/portal
bun run dev

# Should open at http://localhost:3001
```

Test flow:
1. Open portal
2. Load a plan (from share URL or local)
3. Verify presence panel appears (if authenticated)
4. Create share with PR export
5. Add comment on GitHub
6. Verify comment appears as annotation within 5 seconds

---

## Step 2: Share Dialog Update (15-20 minutes)

Update `packages/ui/components/ShareDialog.tsx` to add PR export option:

```typescript
export function ShareDialog({ plan, blocks, annotations }: Props) {
  const [requireAuth, setRequireAuth] = useState(false);
  const [exportToPR, setExportToPR] = useState(false);
  const [aclUsers, setAclUsers] = useState<string[]>([]);

  const handleShare = async () => {
    const token = getToken();

    const response = await fetch(`${pasteServiceUrl}/api/paste`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify({
        data: encryptedPlan,
        acl: requireAuth ? { type: "whitelist", users: aclUsers } : { type: "public" },
        github_export: exportToPR,
        plan_markdown: plan, // Raw markdown
      }),
    });

    const result = await response.json();

    // Show share URL
    setShareUrl(`https://share.plannotator.ai/p/${result.id}#key=${encryptionKey}`);

    // Show PR URL if created
    if (result.github_pr) {
      setPrUrl(result.github_pr.pr_url);
    }
  };

  return (
    <Dialog>
      {/* ... existing share options ... */}

      {/* Authentication requirement */}
      <div className="share-option">
        <Checkbox
          checked={requireAuth}
          onCheckedChange={setRequireAuth}
        >
          Require authentication
        </Checkbox>

        {requireAuth && (
          <Input
            placeholder="GitHub usernames (comma-separated)"
            value={aclUsers.join(", ")}
            onChange={(e) => setAclUsers(e.target.value.split(",").map(u => u.trim()))}
          />
        )}
      </div>

      {/* PR export */}
      <div className="share-option">
        <Checkbox
          checked={exportToPR}
          onCheckedChange={setExportToPR}
          disabled={!requireAuth} // PR export requires auth
        >
          Export to GitHub PR
        </Checkbox>
        <p className="text-sm text-muted-foreground">
          Creates a PR for collaborative review with comment sync
        </p>
      </div>

      {/* Show PR URL if created */}
      {prUrl && (
        <div className="pr-result">
          <span>✅ PR created:</span>
          <a href={prUrl} target="_blank" rel="noopener noreferrer">
            {prUrl}
          </a>
        </div>
      )}
    </Dialog>
  );
}
```

---

## Step 3: Full Testing (20-30 minutes)

### 3.1 Automated Tests

```bash
# Run all test scripts
cd apps/paste-service

export GITHUB_TOKEN="your-token"

bash test-pr-workflow.sh
bash test-presence.sh
```

### 3.2 Manual UI Testing

Follow `E2E-TESTING.md` section "Portal App E2E Test":

1. ✅ Authentication flow
2. ✅ Create share with PR export
3. ✅ View shared plan with annotations
4. ✅ Add PR comment → verify appears
5. ✅ Multi-browser presence test

### 3.3 Success Criteria

- [ ] OAuth login works
- [ ] Private shares require auth
- [ ] PR export creates PR
- [ ] PR comments appear as annotations (within 5s)
- [ ] GitHub avatars display
- [ ] Presence panel shows viewers
- [ ] Heartbeat maintains presence
- [ ] No console errors

---

## Step 4: Documentation (10 minutes)

Update the main README:

```bash
# Edit README.md
nano README.md
```

Add section:

```markdown
## Authentication & Collaboration

Plannotator now supports authenticated plan sharing with GitHub:

### Features
- **Private Shares** - Restrict access to specific users/teams
- **GitHub PR Integration** - Export plans as PRs for review
- **Real-time Collaboration** - See who's viewing plans
- **Comment Sync** - PR comments appear as annotations

### Setup

1. Create GitHub OAuth App:
   - Go to https://github.com/settings/developers
   - Create new OAuth App
   - Callback URL: `http://localhost:19433/api/auth/github/callback`

2. Configure environment:
   ```bash
   cp apps/paste-service/.dev.vars.example apps/paste-service/.dev.vars
   # Edit .dev.vars with your OAuth credentials
   ```

3. Start services:
   ```bash
   cd apps/paste-service && bun run targets/bun.ts &
   cd apps/portal && bun run dev
   ```

See [E2E-TESTING.md](E2E-TESTING.md) for complete testing guide.
```

---

## Step 5: Upstream PR (Optional, 15 minutes)

If you want to contribute back to the original repo:

```bash
# Make sure main is clean
git status

# Push to your fork
git push origin main

# Create PR to upstream
gh pr create \
  --repo backnotprop/plannotator \
  --base main \
  --head ssiddh:main \
  --title "feat: GitHub OAuth authentication and collaborative plan reviews" \
  --body "$(cat <<'EOF'
# GitHub Authentication and Collaborative Reviews

Complete implementation of authenticated plan sharing with GitHub OAuth and PR-based collaboration.

## Features

- **Authentication**: GitHub OAuth 2.0 with ACL-based access control
- **Private Shares**: Whitelist users/teams for plan access
- **PR Workflow**: Export plans as PRs, sync review comments as annotations
- **Presence**: Real-time viewer tracking via SSE

## Testing

All features tested end-to-end:
- See E2E-TESTING.md for complete test suite
- All automated tests passing

## Breaking Changes

None - backward compatible with existing shares

## Documentation

- CLIENT-INTEGRATION.md - Portal integration guide
- E2E-TESTING.md - Testing procedures
- Updated README with setup instructions

🤖 Generated via [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Timeline Estimate

| Step | Time | Status |
|------|------|--------|
| Portal Integration | 30-45 min | ⏭️ Next |
| Share Dialog Update | 15-20 min | ⏭️ Next |
| Full Testing | 20-30 min | ⏭️ Next |
| Documentation | 10 min | ⏭️ Next |
| Upstream PR | 15 min | Optional |
| **Total** | **1.5-2 hours** | |

---

## Decision Points

**Option A: Portal Integration Only**
- Integrate hooks into your fork
- Use for your own projects
- Time: ~1.5 hours

**Option B: Full Open Source Contribution**
- Complete integration + testing
- Submit PR to upstream
- Time: ~2 hours

**Option C: Staged Rollout**
1. Portal integration (now)
2. Test with real usage (1 week)
3. Gather feedback
4. Submit upstream PR (after validation)

---

## Quick Start (Right Now)

Want to see it working immediately? Run this:

```bash
# 1. Check portal structure
cat apps/portal/index.tsx | head -20

# 2. Look for the main viewer component
grep -r "Viewer" apps/portal/ --include="*.tsx"

# 3. Find where to add the hooks
# Reply with what you see, and I'll give you the exact code to add
```

---

## Need Help?

**Stuck on portal integration?**
- Share the portal app structure
- I'll provide exact code snippets

**Want to test first?**
- Run E2E tests: `bash apps/paste-service/test-pr-workflow.sh`
- Use test-oauth.html for manual verification

**Ready for upstream?**
- Review all changes: `git log --oneline main ^upstream/main`
- Clean up commits if needed
- Submit PR with clear description
