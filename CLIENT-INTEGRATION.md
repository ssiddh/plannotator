# Client-Side Integration Guide

This document outlines how to integrate the GitHub PR sync and presence awareness features into the Plannotator portal app.

## Files Created

### Hooks
- `packages/ui/hooks/useGitHubPRSync.ts` - Poll for PR comments and convert to annotations
- `packages/ui/hooks/usePresence.ts` - SSE connection for real-time presence tracking

### Components
- `packages/ui/components/PresencePanel.tsx` - Display active viewers with avatars

### Utilities
- `packages/ui/utils/lineMapper.ts` - Map PR line numbers to plan blocks

### Modified Files
- `packages/ui/components/AnnotationPanel.tsx` - Added GitHub avatar and PR badge display
- `packages/ui/theme.css` - Added presence panel styles

## Integration Steps

### 1. Portal App Integration (apps/portal/index.tsx)

Add the PR sync and presence hooks to the main portal component:

\`\`\`typescript
import { useGitHubPRSync } from "../packages/ui/hooks/useGitHubPRSync";
import { usePresence } from "../packages/ui/hooks/usePresence";
import { PresencePanel } from "../packages/ui/components/PresencePanel";
import { getToken } from "./utils/auth";

function PlanViewer({ pasteId, prMetadata, blocks }: Props) {
  const token = getToken(); // From localStorage

  // Sync GitHub PR comments as annotations
  const {
    annotations: prAnnotations,
    isLoading: prLoading,
    error: prError,
  } = useGitHubPRSync({
    pasteId,
    prMetadata,
    blocks,
    token,
    pasteServiceUrl: process.env.PASTE_SERVICE_URL || "http://localhost:19433",
  });

  // Merge PR annotations with local annotations
  const allAnnotations = [...localAnnotations, ...prAnnotations];

  return (
    <>
      <Viewer annotations={allAnnotations} blocks={blocks} />
      <AnnotationPanel annotations={allAnnotations} ... />

      {/* Presence panel for authenticated users */}
      {token && (
        <PresencePanel
          pasteId={pasteId}
          token={token}
          pasteServiceUrl={process.env.PASTE_SERVICE_URL}
        />
      )}
    </>
  );
}
\`\`\`

### 2. Server-Side Update Required

**IMPORTANT:** The presence SSE endpoint needs to be updated to accept tokens via query parameter since EventSource doesn't support custom headers.

Update `apps/paste-service/core/handler.ts`:

\`\`\`typescript
if (url.pathname.startsWith("/api/presence/") && url.pathname.endsWith("/stream")) {
  // ... existing code ...

  // Also accept token from query param for EventSource compatibility
  const tokenFromQuery = url.searchParams.get("token");
  const token = extractToken(request) || tokenFromQuery;

  // ... rest of validation ...
}
\`\`\`

Update `packages/ui/hooks/usePresence.ts`:

\`\`\`typescript
const url = `${pasteServiceUrl}/api/presence/${pasteId}/stream?token=${encodeURIComponent(token)}`;
const eventSource = new EventSource(url);
\`\`\`

### 3. Environment Variables

Add to portal app's environment:

\`\`\`bash
# .env or similar
PASTE_SERVICE_URL=http://localhost:19433
\`\`\`

### 4. Authentication Flow

The portal app already has authentication utilities in `apps/portal/utils/auth.ts`. Ensure:

1. Token is stored in localStorage after OAuth callback
2. Token is included in all API requests
3. Token is refreshed before expiry

\`\`\`typescript
// In portal app
import { getToken, isAuthenticated, redirectToLogin } from "./utils/auth";

// Check authentication on load
useEffect(() => {
  if (!isAuthenticated()) {
    redirectToLogin();
  }
}, []);
\`\`\`

### 5. Share Dialog Integration

Update `packages/ui/components/ShareDialog.tsx` to include PR export option:

\`\`\`typescript
interface ShareDialogProps {
  // ... existing props ...
  enablePRExport?: boolean;
  onPRExport?: (pasteId: string) => void;
}

function ShareDialog({ enablePRExport, onPRExport }: ShareDialogProps) {
  const [exportToPR, setExportToPR] = useState(false);
  const [acl, setACL] = useState({ type: "public" });

  const handleShare = async () => {
    const response = await fetch(\`\${pasteServiceUrl}/api/paste\`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: \`Bearer \${token}\`,
      },
      body: JSON.stringify({
        data: encryptedPlan,
        acl,
        github_export: exportToPR,
        plan_markdown: planMarkdown,
      }),
    });

    const result = await response.json();

    if (result.github_pr) {
      onPRExport?.(result.id);
      // Show PR URL to user
      alert(\`PR created: \${result.github_pr.pr_url}\`);
    }
  };

  return (
    <Dialog>
      {/* ... existing share options ... */}

      {/* ACL Configuration */}
      <Checkbox
        checked={acl.type === "whitelist"}
        onCheckedChange={(checked) =>
          setACL(checked ? { type: "whitelist", users: [] } : { type: "public" })
        }
      >
        Require authentication
      </Checkbox>

      {acl.type === "whitelist" && (
        <Input
          placeholder="GitHub usernames (comma-separated)"
          onChange={(e) =>
            setACL({ ...acl, users: e.target.value.split(",").map(u => u.trim()) })
          }
        />
      )}

      {/* PR Export Option */}
      <Checkbox
        checked={exportToPR}
        onCheckedChange={setExportToPR}
      >
        Export to GitHub PR
      </Checkbox>
    </Dialog>
  );
}
\`\`\`

## Testing Checklist

### PR Sync
- [ ] PR comments appear as annotations
- [ ] GitHub avatars display correctly
- [ ] "GitHub PR" badge shows on PR annotations
- [ ] Line numbers map to correct blocks
- [ ] Polling updates every 5 seconds
- [ ] Error handling for failed requests

### Presence Awareness
- [ ] Presence panel shows when authenticated
- [ ] Active viewers display with avatars
- [ ] Viewer count updates in real-time
- [ ] Inactive viewers fade out after 30s
- [ ] Connection errors show error state
- [ ] Heartbeat maintains presence

### Authentication
- [ ] OAuth flow redirects correctly
- [ ] Token stored in localStorage
- [ ] Authenticated API calls include Bearer token
- [ ] 401/403 errors redirect to login
- [ ] Token refresh works (if implemented)

## Known Limitations

1. **EventSource Authentication**: Browsers don't support custom headers with EventSource, so tokens must be passed via query parameter. This is less secure than headers but acceptable for authenticated SSE streams.

2. **Presence Storage**: Presence data is stored in-memory per worker instance. If the Cloudflare Worker restarts, presence data is lost. This is acceptable since presence is ephemeral.

3. **PR Polling**: Comments are polled every 5 seconds. For very active PRs, consider implementing GitHub webhooks for real-time updates.

4. **Line Mapping**: The line-to-block mapping uses binary search and proximity scoring. It works well for most cases but may be imperfect if the plan is heavily edited between PR creation and viewing.

## Next Steps

1. **Client-side completion**: Integrate hooks and components into portal app
2. **Server update**: Add token query param support for SSE endpoint
3. **Testing**: Manual testing of full flow with multiple users
4. **Documentation**: Update README with setup instructions
5. **Deployment**: Deploy to production with environment variables configured
