# Phase 5: Inbound Sync - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Import GitHub PR comments into Plannotator as positioned annotations with author attribution, thread grouping, avatar display, and automatic deduplication. Users trigger sync manually via toolbar button and/or benefit from auto-polling when actively reviewing. Comments map to plan blocks via line numbers, with threading preserved and full pagination support for large discussions.

</domain>

<decisions>
## Implementation Decisions

### Sync Trigger & UI Placement

- **D-01:** Sync button lives in Toolbar (next to Approve/Deny buttons)
  - First-class action, always visible during plan review
  - Consistent with other primary actions (approve, deny, settings)
  - Natural place for GitHub sync operations

- **D-02:** Toolbar button shows badge with new comment count
  - Badge format: "5 new" or comment count number
  - Updates during auto-poll cycle
  - Matches notification patterns, always visible status

- **D-03:** Button disabled with tooltip when no PR exists
  - Tooltip text: "Create a PR first to sync comments"
  - Explains prerequisite, guides user to Export modal
  - Keeps UI consistent (button always present)

### Thread Display Pattern

- **D-04:** Nested annotations (parent with children field)
  - Extend Annotation type with optional `children: Annotation[]` field
  - Child annotations indented in annotation panel UI
  - Natural hierarchy matching GitHub's thread structure
  - Replies displayed in chronological order (SYNC-IN-06)

### Sync Timing Strategy

- **D-05:** Hybrid approach - auto-poll + manual button
  - Auto-poll every 5 minutes when PR exists and tab is visible
  - Use Page Visibility API to detect active/hidden state
  - Manual button allows immediate refresh anytime
  - Balances freshness with API efficiency

- **D-06:** Polling only when tab visible
  - Stop polling when tab hidden/inactive
  - Resume when tab becomes visible
  - Reduces unnecessary API calls
  - Respects user context (not actively reviewing)

### Avatar Display

- **D-07:** Inline avatar (24px) next to comment text in annotation panel
  - Uses Annotation.images field (already supported per useGitHubPRSync.ts)
  - Always visible with each comment
  - Matches GitHub PR review UI patterns
  - Visual recognition for multi-author discussions

### Conflict Handling

- **D-08:** Merge both - no conflict modal
  - Show both local and GitHub annotations on same line
  - GitHub comments marked with source: "github-pr" (read-only indicator)
  - Local annotations remain editable
  - Collaborative review pattern: multiple people can comment on same line

### Pagination Strategy

- **D-09:** Fetch all pages upfront on sync operation
  - GitHub API returns 30 comments per page
  - Fetch pages sequentially until no `Link: rel="next"` header
  - Single sync operation imports complete discussion history
  - Matches SYNC-IN-04 requirement (handle 30+ comments)

### Comment Links to GitHub

- **D-10:** Link on author username
  - Click username to open GitHub comment in new browser tab
  - Requires storing comment URL in annotation metadata
  - Unobtrusive, standard pattern for external links
  - Provides context if discussion continues on GitHub

### Timestamp Display

- **D-11:** Absolute timestamp format ('Apr 3, 2:30 PM')
  - Precise, no refresh logic needed
  - Consistent with GitHub comment timestamps
  - Easier to implement than relative time
  - Clear for historical reference

### Error Handling Patterns

#### Network Errors

- **D-12:** Auto-retry 3x with exponential backoff (Phase 4 D-20 pattern)
  - Retry delays: 1s, 2s, 4s
  - Show "Retrying..." indicator in sync button/badge
  - After 3 failures, show error toast with manual "Retry" button
  - Handles flaky networks without user action

#### Rate Limits

- **D-13:** Retry after rate limit reset (Phase 4 D-18 pattern)
  - Check `X-RateLimit-Reset` header from GitHub API response
  - Wait until reset time, then auto-retry
  - Show toast: "Rate limit hit. Retrying at [reset time]"
  - Disable auto-polling until reset (manual sync still available but will fail)

#### Partial Page Failures

- **D-14:** Import partial results + auto-retry failed pages
  - Import comments from successful pages immediately
  - Retry failed pages in background (next auto-poll cycle or manual retry)
  - Show warning: "Imported 30 of 45 comments (page 2 failed - retrying)"
  - Most resilient strategy: progressive import, data not lost

#### Token Expiry During Sync

- **D-15:** Clear state, redirect to OAuth (Phase 2 D-19 / Phase 4 D-19 pattern)
  - Remove token cookie + localStorage
  - Redirect to `/api/auth/github/login` with return_to URL
  - Full re-auth flow consistent with existing patterns
  - User re-authenticates, then retries sync

### Edge Case Handling

#### Comment Edits on GitHub

- **D-16:** Update annotation text on sync
  - Detect changed `updated_at` timestamp via GitHub API
  - Replace annotation text with edited version
  - Keeps Plannotator current with GitHub discussions
  - Note: Overwrites any local modifications user made to imported annotation text

#### Comment Deletion on GitHub

- **D-17:** Remove annotation on next sync
  - Detect missing comment ID (404 or not in API response)
  - Delete the annotation from Plannotator
  - Delete bidirectional KV mapping (cleanup)
  - Keeps UI synchronized with GitHub's current state

#### Unmappable Lines (Line Drift)

- **D-18:** Import as global annotation
  - When comment.line doesn't map to valid block (plan changed since PR created)
  - Set blockId: "global" (SYNC-IN-03 pattern)
  - User sees comment in annotation panel but not line-positioned
  - Preserves data, graceful degradation for drift scenarios

#### Draft vs Published Comments

- **D-19:** Published comments only
  - Only import comments from submitted reviews (not draft/pending)
  - Draft comments stay on GitHub until user publishes
  - Standard review workflow, cleaner separation
  - Avoids exposing unfinished thoughts

### Duplicate Prevention

- **D-20:** Use bidirectional KV mapping from Phase 3
  - Before creating annotation, check if GitHub comment ID already mapped
  - Query: `getAnnotationId(pasteId, commentId, kv)` → O(1) lookup
  - Skip already-imported comments (SYNC-IN-09)
  - Prevents duplicate annotations on repeated sync

### Comment Type Differentiation

- **D-21:** Review comments mapped to lines, issue comments as global
  - Review comments (line-level): use `comment.line` to map to block via `mapLineToBlock()`
  - Issue comments (general): set blockId: "global"
  - Matches GitHub PR review patterns (SYNC-IN-02, SYNC-IN-03)
  - Clear distinction in UI based on positioning

### Claude's Discretion

- Sync button icon choice (refresh icon, sync arrows, cloud download)
- Badge styling specifics (color, size, position)
- Nested annotation indentation depth (16px, 24px, etc.)
- Avatar fallback image/initials if load fails
- Retry delay fine-tuning (1s/2s/4s suggested but adjustable)
- Error toast duration and auto-dismiss behavior
- Global annotation placement in panel (top section, bottom section, or mixed chronologically)
- Timestamp formatting locale (browser default or configurable)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §Inbound Sync — SYNC-IN-01 through SYNC-IN-09 define what must be TRUE

### Phase Context
- `.planning/phases/01-plugin-architecture/01-CONTEXT.md` — Plugin structure, middleware patterns, React context integration
- `.planning/phases/02-authentication-access-control/02-CONTEXT.md` — Auth flow, token validation, OAuth patterns, error handling
- `.planning/phases/03-data-model-sync-infrastructure/03-CONTEXT.md` — Stable IDs, bidirectional mapping, sync state, line mapper, conflict detection
- `.planning/phases/04-pr-creation-export/04-CONTEXT.md` — PR metadata storage, export patterns, toast notifications, retry logic

### Existing Implementation
- `packages/github/client/useGitHubPRSync.ts` — Existing sync hook skeleton (polling, comment-to-annotation conversion, needs extension)
- `packages/github/server/pr.ts` — `fetchPRComments()` function, `githubRequest()` helper
- `packages/github/server/syncMappings.ts` — `getAnnotationId()`, `setMapping()`, `deleteMapping()` for KV operations
- `packages/github/server/syncState.ts` — `getSyncState()`, `setSyncState()` for timestamp tracking
- `packages/github/client/lineMapper.ts` — `mapLineToBlock()` for line-to-block conversion
- `packages/github/client/GitHubProvider.tsx` — React context, token management
- `packages/github/shared/types.ts` — `PRMetadata`, `PRComment`, `GitHubConfig` types

### UI Patterns
- `packages/ui/components/Toolbar.tsx` — Existing toolbar button patterns (Approve, Deny, Settings)
- `packages/ui/components/AnnotationPanel.tsx` — Annotation display, threading patterns
- `packages/ui/types.ts` — `Annotation` type (needs extension for children field)
- `packages/ui/hooks/useAnnotationHighlighter.ts` — Annotation creation and management patterns

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **useGitHubPRSync hook**: `packages/github/client/useGitHubPRSync.ts` (157 lines)
  - Already polls for PR comments at 5-second intervals
  - Converts PRComment[] to Annotation[] with GitHub metadata
  - Uses lineMapper to map comment.line to blockId
  - Sets source: "github-pr" and stores avatar in images field
  - Missing: KV mapping check for deduplication, thread nesting, pagination, error retry logic

- **fetchPRComments()**: `packages/github/server/pr.ts`
  - Fetches review comments and issue comments from GitHub API
  - Combines both comment types into single PRComment[] array
  - Ready for extension: pagination loop, error handling

- **Bidirectional mapping**: `packages/github/server/syncMappings.ts` (Phase 3)
  - `getAnnotationId(pasteId, commentId, kv)` — O(1) check if comment already imported
  - `setMapping(pasteId, annotationId, commentId, kv, ttl)` — stores both directions
  - `deleteMapping(pasteId, annotationId, commentId, kv)` — cleanup on deletion
  - All infrastructure ready, just needs integration into sync logic

- **Line mapper**: `packages/github/client/lineMapper.ts`
  - `mapLineToBlock(lineNumber, blocks)` — binary search, O(log n)
  - Returns blockId or null if line out of range
  - Handles edge cases (line before first block, after last block)
  - Ready for unmappable line handling (D-18: return null → blockId: "global")

- **Sync state tracking**: `packages/github/server/syncState.ts` (Phase 3)
  - `getSyncState(pasteId, kv)` — reads last sync timestamp
  - `setSyncState(pasteId, timestamp, direction, kv)` — updates after successful sync
  - Enables incremental sync and conflict detection
  - Ready for integration into sync workflow

- **GitHubProvider context**: `packages/github/client/GitHubProvider.tsx` (104 lines)
  - Manages token, user, prMetadata state
  - Hydrates prMetadata on mount via `/api/pr/{pasteId}/metadata`
  - Needs: syncFromGitHub() action to trigger manual sync
  - Hook already consumes this context via useGitHub()

### Established Patterns

- **Polling with Page Visibility**: Browser Page Visibility API
  - `document.hidden` property to check tab visibility
  - `visibilitychange` event to pause/resume polling
  - Standard pattern for efficient background polling

- **Nested data structures**: React components handle nested structures
  - AnnotationPanel could render recursive annotation trees
  - Children annotations indented with CSS (margin-left)
  - Similar to comment threads in social platforms

- **Toast notifications**: Phase 4 established pattern
  - Success toast: "Synced 12 comments from GitHub"
  - Error toast with retry button
  - Non-intrusive, auto-dismiss after 5-8 seconds

- **Badge indicators**: Common UI pattern for counts
  - Number badge on button (e.g., "5 new")
  - CSS absolute positioning, small circle
  - Updates reactively when new comments arrive

### Integration Points

- **Toolbar sync button**: `packages/ui/components/Toolbar.tsx`
  - Add "Sync from GitHub" button after Deny button
  - Use GitHub icon, show badge with count
  - Disabled state when no PR (prMetadata === null)
  - onClick triggers manual sync via GitHubProvider action

- **Annotation panel threading**: `packages/ui/components/AnnotationPanel.tsx`
  - Render nested annotations recursively
  - Indent child annotations (e.g., 24px margin-left)
  - Show thread lines connecting parent to children
  - Avatar display inline with each annotation

- **Server endpoint**: New `/api/pr/{pasteId}/sync/inbound` route
  - Compose in GitHub plugin handler (packages/github/server/handler.ts)
  - Needs: token validation, fetchPRComments with pagination, KV mapping checks, state update
  - Returns: `{ annotations: Annotation[], syncState: SyncState }` or error

- **Page visibility polling**: `useGitHubPRSync` hook extension
  - Add visibilitychange event listener
  - Pause polling when document.hidden === true
  - Resume when visible
  - Clear interval on unmount

### Code to Extend/Create

- **Extend useGitHubPRSync.ts**:
  - Add KV deduplication check before creating annotations
  - Implement thread nesting (group replies under parent via in_reply_to_id)
  - Add Page Visibility API for smart polling
  - Add retry logic for network errors
  - Handle pagination (fetch all pages)
  - Detect edited/deleted comments (compare updated_at, check for 404s)

- **Extend Annotation type** (`packages/ui/types.ts`):
  - Add `children?: Annotation[]` field for nested threading
  - Add `githubCommentUrl?: string` for clickable username links
  - Keep existing source, images, author fields (already correct)

- **Create server sync endpoint** (`packages/github/server/handler.ts` extension):
  - Route: `GET /api/pr/{pasteId}/sync/inbound`
  - Fetch all PR comment pages with pagination loop
  - Check each comment against KV mapping (skip if already imported)
  - Build nested annotation structure from GitHub threads
  - Update sync state timestamp
  - Return annotations array + sync metadata

- **Extend AnnotationPanel.tsx**:
  - Recursive rendering for nested annotations
  - CSS indentation for children
  - Avatar display inline (24px)
  - Clickable username links to GitHub

- **Extend Toolbar.tsx**:
  - Add "Sync from GitHub" button
  - Badge component for count display
  - Disabled state styling + tooltip
  - Wire to GitHubProvider.syncFromGitHub() action

</code_context>

<specifics>
## Specific Ideas

- Sync button icon: GitHub Octicons "sync" icon (circular arrows) or "download" icon
- Badge styling: Small circle (18px diameter), positioned top-right of button, background color matches theme
- Toolbar button tooltip on disabled state: "Create a PR first to sync comments" (exact text)

- Thread nesting structure in Annotation:
  ```typescript
  interface Annotation {
    id: string;
    blockId: string;
    // ... existing fields
    children?: Annotation[]; // NEW: nested replies
    githubCommentUrl?: string; // NEW: link to GitHub comment
  }
  ```

- GitHub comment URL format: Store full URL from API response (e.g., `comment.html_url`)
  - Click username → `window.open(annotation.githubCommentUrl, '_blank')`

- Nested annotation rendering pattern:
  ```tsx
  function renderAnnotation(annotation: Annotation, depth: number) {
    return (
      <div style={{ marginLeft: `${depth * 24}px` }}>
        <Avatar src={annotation.images[0]?.path} size={24} />
        <span onClick={() => window.open(annotation.githubCommentUrl)}>
          {annotation.author}
        </span>
        <p>{annotation.text}</p>
        {annotation.children?.map(child => renderAnnotation(child, depth + 1))}
      </div>
    );
  }
  ```

- Pagination loop pattern:
  ```typescript
  async function fetchAllComments(prMetadata, token) {
    let page = 1;
    let allComments = [];
    while (true) {
      const response = await fetch(
        `${GITHUB_API}/repos/${owner}/${repo}/pulls/${prNumber}/comments?page=${page}&per_page=30`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const comments = await response.json();
      allComments.push(...comments);
      
      // Check for next page in Link header
      const linkHeader = response.headers.get('Link');
      if (!linkHeader || !linkHeader.includes('rel="next"')) {
        break;
      }
      page++;
    }
    return allComments;
  }
  ```

- Deduplication check pattern:
  ```typescript
  for (const comment of githubComments) {
    const existingAnnotationId = await getAnnotationId(pasteId, comment.id, kv);
    if (existingAnnotationId) {
      // Check for edits (D-16)
      const existingAnnotation = annotations.find(a => a.id === existingAnnotationId);
      if (existingAnnotation && new Date(comment.updated_at) > new Date(existingAnnotation.createdA)) {
        // Update annotation text (comment was edited on GitHub)
        existingAnnotation.text = comment.body;
      }
      continue; // Skip, already imported
    }
    // New comment, import it
    const newAnnotation = convertToAnnotation(comment, blocks);
    await setMapping(pasteId, newAnnotation.id, comment.id, kv, ttl);
  }
  ```

- Page Visibility API integration:
  ```typescript
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        clearInterval(pollIntervalRef.current);
      } else {
        startPolling();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);
  ```

- Thread nesting algorithm (convert flat GitHub comments to tree):
  ```typescript
  function buildThreadTree(comments: PRComment[]): Annotation[] {
    const annotationMap = new Map<string, Annotation>();
    const roots: Annotation[] = [];
    
    // First pass: create all annotations
    for (const comment of comments) {
      const annotation = convertToAnnotation(comment);
      annotationMap.set(comment.id, annotation);
    }
    
    // Second pass: link children to parents
    for (const comment of comments) {
      const annotation = annotationMap.get(comment.id)!;
      if (comment.in_reply_to_id) {
        const parent = annotationMap.get(comment.in_reply_to_id);
        if (parent) {
          parent.children = parent.children || [];
          parent.children.push(annotation);
        } else {
          roots.push(annotation); // Orphaned reply, treat as root
        }
      } else {
        roots.push(annotation); // Top-level comment
      }
    }
    
    return roots;
  }
  ```

- Sync status badge update pattern:
  ```typescript
  const [newCommentCount, setNewCommentCount] = useState(0);
  
  useEffect(() => {
    if (lastSync && annotations.length > previousAnnotationCount) {
      const newCount = annotations.length - previousAnnotationCount;
      setNewCommentCount(newCount);
    }
  }, [annotations, lastSync]);
  
  // In Toolbar:
  <button onClick={syncFromGitHub} disabled={!prMetadata}>
    Sync from GitHub
    {newCommentCount > 0 && <Badge>{newCommentCount} new</Badge>}
  </button>
  ```

</specifics>

<deferred>
## Deferred Ideas

### Reviewed Todos (not folded)

None - no relevant todos matched this phase.

### Out of Scope for Phase 5

- Real-time sync via webhooks - manual/polling only per Phase 2 philosophy
- Comment reactions (emoji) sync - not in requirements
- Resolved thread status display - Phase 7 (THREAD-07)
- Outbound sync (Plannotator → GitHub) - Phase 6
- Thread summary annotations - Phase 7 (THREAD-01 through THREAD-04)
- PR review submission from Plannotator - Phase 7 (THREAD-05, THREAD-06)
- Automatic AI-generated thread summaries - explicitly out of scope (PROJECT.md)
- Multi-repo support - Phase 1 established single repo, future extension
- Silent token refresh (refresh_token flow) - Phase 2 chose reactive handling only

</deferred>

---

*Phase: 05-inbound-sync*
*Context gathered: 2026-04-03*
