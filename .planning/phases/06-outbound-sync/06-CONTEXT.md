# Phase 6: Outbound Sync - Context

**Gathered:** 2026-04-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Export Plannotator annotations to GitHub as PR review comments with line positioning, stable ID deduplication, edit detection, and drift warnings. Users trigger sync manually via toolbar button. Both new annotations and locally-edited annotations are posted to GitHub, with edits appearing as threaded replies to preserve history.

</domain>

<decisions>
## Implementation Decisions

### Sync Scope & Filtering

- **D-01:** Sync both new and edited annotations
  - **New annotations**: No KV mapping exists (no commentId) → create new GitHub review comment
  - **Edited annotations**: KV mapping exists but annotation.text differs from GitHub comment.body → post as reply in thread
  - Requires fetching current GitHub comment state during outbound sync to detect edits
  - More complete than new-only sync, preserves edit history on GitHub

- **D-02:** Edit detection via text field comparison
  - For annotations with KV mapping, fetch current GitHub comment via API
  - Compare `annotation.text` to `comment.body`
  - If different → annotation was edited locally
  - Simple, reliable, catches all text changes without new schema fields

- **D-03:** Edited annotations post as threaded replies
  - Reply format: "Updated: [new annotation text]"
  - Preserves edit history on GitHub (original comment + reply showing update)
  - Works with GitHub REST API (no permission issues)
  - Not replacing original comment (would lose history, may not be allowed by API)

- **D-04:** Skip annotations already synced (deduplication)
  - Before posting, check KV mapping: `getCommentId(pasteId, annotationId, kv)`
  - If mapping exists AND text matches GitHub → skip (already synced)
  - If mapping exists AND text differs → post as edit reply (D-03)
  - If no mapping → new annotation, post as review comment

### Drift Handling Strategy

- **D-05:** Warn but allow sync when plan changed (Phase 4 D-15 pattern)
  - Compare current plan markdown hash to `prMetadata.planHash`
  - If hashes differ: show banner "Plan changed since PR creation — line numbers may be incorrect"
  - User can proceed or cancel
  - Not blocking sync (user may have good reason: typo fixes, safe changes)
  - Not auto-remapping lines (too complex, may map incorrectly)

- **D-06:** Drift detected by full plan hash comparison (Phase 4 D-16 pattern)
  - SHA-256 of entire plan markdown
  - Even minor edits trigger warning
  - Safe approach: always warn when content changed

### Image Reference Strategy

- **D-07:** Skip images, text only (Phase 4 D-07 pattern)
  - Annotations with images sync text only, no image references
  - Show warning toast: "N annotations with images synced text only"
  - Prevents broken links, simple implementation
  - Not Gist upload (deferred to future) or localhost URLs
  - User can manually attach images on GitHub if needed

### Sync Button Behavior

- **D-08:** Two separate toolbar buttons (Phase 5 D-01 pattern extended)
  - "Sync from GitHub" (Phase 5, existing)
  - "Sync to GitHub" (Phase 6, new) — placed adjacent to inbound button
  - Clear intent, no ambiguity about direction
  - Not single bidirectional button or dropdown menu

- **D-09:** Outbound button shows badge with unsynced count
  - Badge displays count of annotations without KV mapping (new annotations only, not edits)
  - Format: "5" or "9+" (matches Phase 5 badge pattern)
  - Updates when user adds annotations locally
  - Same styling as inbound badge

- **D-10:** Outbound button disabled when no PR exists
  - Tooltip text: "Create a PR first to sync annotations" (matches Phase 5 D-03)
  - Keeps UI consistent (button always present but grayed out)
  - Guides user to Export modal

### Line Positioning (Phase 4 patterns)

- **D-11:** Use block.startLine for line mapping (Phase 4 D-13/D-14)
  - Annotation's blockId → block lookup → block.startLine from parser
  - All annotations on same block go to same GitHub line (groups as thread)
  - Multi-line blocks: annotations appear at block start line
  - Simple, already proven in Phase 4 initial export

### Error Handling (Phase 4/5 patterns)

- **D-12:** Network errors retry 3x with exponential backoff (Phase 4 D-20, Phase 5 D-12)
  - Retry delays: 1s, 2s, 4s
  - Show "Retrying..." indicator in sync button/toast
  - After 3 failures: error toast with "Retry" button
  - Handles flaky networks without user action

- **D-13:** Rate limit errors retry after reset time (Phase 4 D-18, Phase 5 D-13)
  - Check `X-RateLimit-Reset` header from GitHub API
  - Wait until reset time, then auto-retry
  - Show toast: "Rate limit hit. Retrying at [reset time]"
  - Disable auto-polling until reset (manual sync available but will fail)

- **D-14:** Auth failures clear state and redirect to OAuth (Phase 4 D-19, Phase 5 D-15)
  - If token invalid/expired during sync: remove token cookie + localStorage
  - Redirect to `/api/auth/github/login?return_to=[current URL]`
  - User re-authenticates, then retries sync
  - Consistent with Phase 2 auth flow

### Sync State Tracking (Phase 3 infrastructure)

- **D-15:** Update sync state after successful outbound sync
  - Call `setSyncState(pasteId, Date.now(), "outbound", kv, ttl)` after batch review submitted
  - Enables conflict detection (Phase 3 D-05)
  - Tracks last sync timestamp for incremental logic (future phases)

- **D-16:** Store bidirectional mapping after each comment posted
  - Call `setMapping(pasteId, annotationId, commentId, kv, ttl)` for each new comment
  - Enables deduplication on subsequent syncs (D-04)
  - Same 30-day TTL as other sync metadata (Phase 3 D-06)

### Batch Review Submission (Phase 4 patterns)

- **D-17:** Single batch review for all outbound annotations (Phase 4 D-05)
  - All annotations in one `POST /repos/{owner}/{repo}/pulls/{pr_number}/reviews` call
  - Review event: "COMMENT" (neutral batch, not APPROVE/REQUEST_CHANGES)
  - Single GitHub notification for entire sync operation
  - Review body: "Annotations synced from Plannotator"

- **D-18:** DELETION annotations as suggestion blocks (Phase 4 D-06)
  - Format: \`\`\`suggestion\n\n\`\`\` (empty suggestion = deletion)
  - GitHub renders "Apply suggestion" button
  - Prepend original text for context: "> [originalText]\n\n```suggestion..."
  - Native GitHub UX, actionable by PR author

- **D-19:** GLOBAL_COMMENT annotations filtered out
  - Global annotations have no line position (blockId: "global")
  - Cannot map to GitHub review comments (requires line number)
  - Skip during export, show info toast: "N global annotations skipped (no line position)"
  - Alternative: post as issue comments (deferred to Phase 7)

### Toast Notifications (Phase 4/5 patterns)

- **D-20:** Success toast with stats
  - Format: "Synced N annotations to GitHub" (shows count of new + edited)
  - Breakdown: "N new, M updated" if both types present
  - Auto-dismiss after 5-8 seconds
  - Non-intrusive, allows continuing work

- **D-21:** Error toast with retry action (Phase 4 D-04)
  - Shows error message + "Retry" button
  - Retry uses same parameters (no re-configuration)
  - Toast persists until user dismisses or retries

### Claude's Discretion

- Exact button icon for outbound sync (upload icon, cloud upload, arrow up)
- Badge positioning relative to inbound button (side-by-side, stacked)
- Toast duration specifics (5-8 seconds suggested)
- Retry backoff timing fine-tuning (1s, 2s, 4s suggested)
- Warning banner styling and placement for drift detection
- Edit reply prefix wording ("Updated:" vs "Changed to:" vs "Edit:")
- Error message wording for different failure types
- Badge update debouncing (immediate vs batched updates)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §Outbound Sync — SYNC-OUT-01 through SYNC-OUT-08 define what must be TRUE

### Phase Context
- `.planning/phases/03-data-model-sync-infrastructure/03-CONTEXT.md` — Stable IDs, bidirectional mapping (setMapping, getCommentId), sync state, plan hash
- `.planning/phases/04-pr-creation-export/04-CONTEXT.md` — PR creation, batch review submission, DELETION suggestions, drift detection, error handling patterns
- `.planning/phases/05-inbound-sync/05-CONTEXT.md` — Sync button patterns, toolbar placement, badge display, KV deduplication, toast notifications

### Existing Implementation
- `packages/github/server/export.ts` — submitBatchReview(), mapAnnotationsToComments() from Phase 4 (initial export)
- `packages/github/server/pr.ts` — fetchPRComments() for fetching current comment state (edit detection)
- `packages/github/server/syncMappings.ts` — setMapping(), getCommentId() for bidirectional KV operations
- `packages/github/server/syncState.ts` — setSyncState(), getSyncState() for timestamp tracking
- `packages/github/shared/planHash.ts` — generatePlanHash() for drift detection
- `packages/github/shared/types.ts` — PRMetadataWithSync, ReviewComment types
- `packages/github/client/useGitHubExport.ts` — Export hook from Phase 4 (PR creation)
- `packages/github/client/GitHubProvider.tsx` — React context with prMetadata state

### UI Patterns
- `packages/ui/components/ToolbarButtons.tsx` — SyncButton from Phase 5 (inbound)
- `packages/ui/components/Toolbar.tsx` — Toolbar button placement patterns
- `packages/ui/types.ts` — Annotation, Block types
- `packages/ui/utils/parser.ts` — parseMarkdownToBlocks() for block.startLine

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets from Prior Phases

- **submitBatchReview()**: `packages/github/server/export.ts` (Phase 4)
  - Posts review comments in single GitHub API call
  - Already used for initial PR creation with annotations
  - Ready for reuse: just pass new annotations array
  - Returns GitHub review object with comment IDs

- **mapAnnotationsToComments()**: `packages/github/server/export.ts` (Phase 4)
  - Converts Annotation[] to ReviewComment[] format
  - Handles DELETION → suggestion blocks, GLOBAL_COMMENT filtering
  - Uses block.startLine for line positioning
  - Ready for outbound sync with minor extension for edit detection

- **Bidirectional mapping**: `packages/github/server/syncMappings.ts` (Phase 3)
  - `getCommentId(pasteId, annotationId, kv)` — O(1) reverse lookup
  - `setMapping(pasteId, annotationId, commentId, kv, ttl)` — stores both directions
  - All infrastructure ready, just needs integration into outbound logic

- **Sync state tracking**: `packages/github/server/syncState.ts` (Phase 3)
  - `setSyncState(pasteId, timestamp, direction, kv)` — records last sync
  - Direction: "inbound" (Phase 5), "outbound" (Phase 6), "bidirectional" (Phase 7)
  - Enables conflict detection and incremental sync patterns

- **Plan hash generation**: `packages/github/shared/planHash.ts` (Phase 3)
  - `generatePlanHash(markdown)` — SHA-256 truncated to 12 chars
  - Used in Phase 4 for drift detection on initial export
  - Ready for reuse in outbound sync drift check

- **fetchPRComments()**: `packages/github/server/pr.ts`
  - Fetches all review comments from GitHub PR
  - Used in Phase 5 for inbound sync
  - Needed for edit detection: fetch current comment body, compare to annotation.text

- **useGitHubExport hook**: `packages/github/client/useGitHubExport.ts` (Phase 4)
  - Manages export loading state, error state, retry logic
  - Returns: `{ exportToPR, isExporting, error, retry }`
  - Can be extended or mirrored for outbound sync action

- **GitHubProvider**: `packages/github/client/GitHubProvider.tsx`
  - Context exposes `prMetadata` state (includes planHash)
  - Already has `createPR()` action from Phase 4
  - Needs: `syncToGitHub()` action for outbound sync trigger

### Established Patterns

- **Toolbar sync buttons**: Phase 5 established pattern
  - SyncButton component with badge, disabled state, tooltip
  - Badge shows count, updates reactively
  - Disabled when no PR (prMetadata === null)
  - Reuse for outbound button with different props

- **Toast notifications**: Phase 4/5 established pattern
  - Success: stats-based message ("Synced N annotations")
  - Error: message + retry button
  - Auto-dismiss after 5-8 seconds
  - Non-intrusive, allows continuing work

- **Error handling**: Phase 4/5 established patterns
  - Auth failures redirect to OAuth with return_to URL
  - Rate limit: wait for reset, then auto-retry
  - Network errors: 3x retry with exponential backoff
  - All patterns ready for reuse in outbound sync

- **KV deduplication**: Phase 5 established pattern
  - Check mapping before creating annotation/comment
  - Skip if already mapped
  - Same pattern applies in reverse for outbound

### Integration Points

- **New server endpoint**: `/api/pr/{pasteId}/sync/outbound`
  - Compose in GitHub plugin handler (packages/github/server/handler.ts)
  - Needs: token validation, annotation fetching, edit detection, batch review submission
  - Returns: `{ syncedCount: number, editCount: number, skippedCount: number }` or error

- **Outbound sync button**: `packages/ui/components/ToolbarButtons.tsx`
  - Add "Sync to GitHub" button after "Sync from GitHub"
  - Same component structure, different props (onClick, badge count)
  - Wire to GitHubProvider.syncToGitHub() action

- **Edit detection logic**: New function in export.ts or separate module
  - `detectEditedAnnotations(annotations, pasteId, token, kv)` returns edited subset
  - For each annotation with KV mapping:
    - Fetch GitHub comment via API
    - Compare annotation.text to comment.body
    - If different, include in edited list
  - Return: `{ new: Annotation[], edited: Annotation[] }`

- **GitHubProvider extension**: Add syncToGitHub action
  - Fetch annotations from App.tsx state (via callback or context)
  - Call server endpoint `/api/pr/{pasteId}/sync/outbound`
  - Show toast with results
  - Update prMetadata if needed

### Code to Create

- **Server outbound sync module**: `packages/github/server/outboundSync.ts`
  - `performOutboundSync(pasteId, annotations, blocks, prMetadata, token, kv)`
  - Detects edits via fetchPRComments + text comparison
  - Maps annotations to ReviewComment[] (reuse mapAnnotationsToComments)
  - Posts batch review via submitBatchReview (reuse from export.ts)
  - Stores KV mappings for new comments
  - Posts edit replies for edited annotations
  - Updates sync state
  - Returns: `{ syncedCount, editCount, skippedCount }`

- **Client outbound sync hook**: `packages/github/client/useGitHubOutboundSync.ts`
  - Wraps GitHubProvider.syncToGitHub() action
  - Manages loading state, error state, retry logic
  - Returns: `{ syncToGitHub, isSyncing, error, retry, unsyncedCount }`
  - Badge count: annotations.filter(a => !hasMapping(a.id))

- **Outbound sync button**: Add to `packages/ui/components/ToolbarButtons.tsx`
  - Similar to SyncButton from Phase 5, different icon (upload vs download)
  - Badge shows unsynced count
  - Disabled when no PR
  - Wire to syncToGitHub() from hook

- **Server handler route**: Extend `packages/github/server/handler.ts`
  - Route: `POST /api/pr/{pasteId}/sync/outbound`
  - Body: `{ annotations: Annotation[], blocks: Block[], planMarkdown: string }`
  - Validates token, checks PR exists, performs sync
  - Returns sync stats or error

</code_context>

<specifics>
## Specific Ideas

- **Outbound sync button styling**:
  - Icon: upload cloud or arrow up (vs download arrow for inbound)
  - Placement: immediately after "Sync from GitHub" button in toolbar
  - Same badge styling as inbound (circle, top-right positioned, accent color)

- **Edit reply format**:
  ```
  Updated: [new annotation text]
  ```
  Simple prefix, clear intent. Alternative: "Changed to:" or "Edit:" — Claude decides.

- **Edit detection API pattern**:
  ```typescript
  async function detectEditedAnnotations(
    annotations: Annotation[],
    pasteId: string,
    prMetadata: PRMetadata,
    token: string,
    kv: any
  ): Promise<{ new: Annotation[], edited: Annotation[] }> {
    const newAnnotations: Annotation[] = [];
    const editedAnnotations: Annotation[] = [];
    
    // Fetch current GitHub comment state
    const { comments } = await fetchPRComments(prMetadata, token);
    const commentMap = new Map(comments.map(c => [c.id, c]));
    
    for (const annotation of annotations) {
      const commentId = await getCommentId(pasteId, annotation.id, kv);
      
      if (!commentId) {
        // No mapping → new annotation
        newAnnotations.push(annotation);
      } else {
        // Has mapping → check if edited
        const githubComment = commentMap.get(commentId);
        if (githubComment && annotation.text !== githubComment.body) {
          editedAnnotations.push(annotation);
        }
        // If text matches, skip (already synced and unchanged)
      }
    }
    
    return { new: newAnnotations, edited: editedAnnotations };
  }
  ```

- **Drift warning banner**:
  - Same styling as Phase 4 drift warning
  - Position: top of Export modal or inline before sync button
  - Text: "⚠️ Plan changed since PR creation — line numbers may be incorrect"
  - Action buttons: "Proceed anyway" / "Cancel"

- **Outbound sync endpoint request format**:
  ```json
  POST /api/pr/{pasteId}/sync/outbound
  {
    "annotations": [{ "id": "...", "blockId": "...", "text": "...", ... }],
    "blocks": [{ "id": "...", "startLine": 5, ... }],
    "planMarkdown": "# Plan\n\n..."
  }
  ```

- **Outbound sync endpoint response format**:
  ```json
  {
    "syncedCount": 5,
    "editCount": 2,
    "skippedCount": 3,
    "warnings": ["3 global annotations skipped", "1 annotation with image synced text only"]
  }
  ```

- **Toast message patterns**:
  - Success (new only): "Synced 5 annotations to GitHub"
  - Success (new + edits): "Synced 5 annotations (3 new, 2 updated)"
  - Partial (warnings): "Synced 5 annotations. 2 global annotations skipped."
  - Error: "Sync failed. [error message]. [Retry button]"

- **Badge count calculation**:
  ```typescript
  const unsyncedCount = annotations.filter(annotation => {
    // Check if annotation has KV mapping (commentId exists)
    const hasMapping = await getCommentId(pasteId, annotation.id, kv);
    return !hasMapping; // Count only new annotations, not edits
  }).length;
  ```

- **Edit reply posting pattern** (separate from main batch review):
  ```typescript
  // After main batch review submitted for new annotations
  for (const editedAnnotation of editedAnnotations) {
    const commentId = await getCommentId(pasteId, editedAnnotation.id, kv);
    const githubComment = commentMap.get(commentId);
    
    // Post as reply to original comment
    await githubRequest(
      `POST /repos/${owner}/${repo}/pulls/${prNumber}/comments/${commentId}/replies`,
      token,
      { body: `Updated: ${editedAnnotation.text}` }
    );
  }
  ```

</specifics>

<deferred>
## Deferred Ideas

### Out of Scope for Phase 6

- Automatic conflict resolution — Phase 3 defined detection, but resolution is manual
- Editing/deleting GitHub comments from Plannotator — Phase 6 is one-way (Plannotator → GitHub), Phase 7 handles bidirectional thread management
- Image upload to GitHub Gist — deferred for simplicity, text-only export
- Annotation reactions/emoji — not in requirements
- Incremental sync (only annotations created since last sync timestamp) — full sync is simpler, incremental optimization is future
- PR review submission (APPROVE/REQUEST_CHANGES) — Phase 7 (THREAD-05, THREAD-06)
- Thread summary annotations — Phase 7 (THREAD-01 through THREAD-04)
- Issue comments (vs review comments) — Phase 7 extension for global annotations
- Real-time sync via webhooks — manual/polling only per PROJECT.md constraints
- Multi-repo support — Phase 1 established single repo, future extension

</deferred>

---

*Phase: 06-outbound-sync*
*Context gathered: 2026-04-08*
