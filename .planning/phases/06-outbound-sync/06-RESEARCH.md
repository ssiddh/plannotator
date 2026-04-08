# Phase 6: Outbound Sync - Research

**Researched:** 2026-04-08
**Domain:** GitHub REST API (PR reviews, comment replies), React state management, KV deduplication
**Confidence:** HIGH

## Summary

Phase 6 implements Plannotator-to-GitHub annotation sync. The infrastructure is mature: Phase 3 built bidirectional KV mappings, Phase 4 built batch review submission, and Phase 5 built the inbound sync pattern with toolbar button, polling, and error handling. Phase 6 mirrors the inbound flow in reverse, reusing `submitBatchReview()`, `mapAnnotationsToComments()`, `setMapping()`, `setSyncState()`, and `generatePlanHash()`.

The primary complexity lies in three areas: (1) edit detection requires fetching current GitHub comment state and comparing to local annotation text, (2) the GitHub Reviews API does not return individual comment IDs in the review response -- a follow-up `GET /repos/.../pulls/.../reviews/{review_id}/comments` call is required to map submitted comments back to their GitHub IDs for KV storage, and (3) edit replies use a separate endpoint (`POST /repos/.../pulls/.../comments/{comment_id}/replies`) that only supports top-level comments (replies to replies are not supported).

**Primary recommendation:** Build a server-side `performOutboundSync()` module mirroring `performInboundSync()`, reusing existing export functions, with a follow-up review-comments fetch for ID mapping. Client hook mirrors `useGitHubPRSync` pattern. UI adds `OutboundSyncButton` to `ToolbarButtons.tsx` matching Phase 5 `SyncButton` structure.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: Sync both new and edited annotations (new = no KV mapping; edited = KV exists but text differs from GitHub)
- D-02: Edit detection via text field comparison (fetch GitHub comment, compare annotation.text to comment.body)
- D-03: Edited annotations post as threaded replies (format: "Updated: [new annotation text]")
- D-04: Skip annotations already synced (KV mapping exists AND text matches = skip)
- D-05: Warn but allow sync when plan changed (compare plan hash to prMetadata.planHash)
- D-06: Drift detected by full plan hash comparison (SHA-256)
- D-07: Skip images, text only (toast warning for annotations with images)
- D-08: Two separate toolbar buttons (inbound + outbound, placed adjacent)
- D-09: Outbound button shows badge with unsynced count (new annotations only, not edits)
- D-10: Outbound button disabled when no PR exists
- D-11: Use block.startLine for line mapping
- D-12: Network errors retry 3x with exponential backoff (1s, 2s, 4s)
- D-13: Rate limit errors retry after reset time
- D-14: Auth failures clear state and redirect to OAuth
- D-15: Update sync state after successful outbound sync
- D-16: Store bidirectional mapping after each comment posted
- D-17: Single batch review for all outbound annotations (event: "COMMENT")
- D-18: DELETION annotations as suggestion blocks
- D-19: GLOBAL_COMMENT annotations filtered out (toast warning)
- D-20: Success toast with stats
- D-21: Error toast with retry action

### Claude's Discretion
- Exact button icon for outbound sync (upload icon, cloud upload, arrow up)
- Badge positioning relative to inbound button (side-by-side, stacked)
- Toast duration specifics (5-8 seconds suggested)
- Retry backoff timing fine-tuning (1s, 2s, 4s suggested)
- Warning banner styling and placement for drift detection
- Edit reply prefix wording ("Updated:" vs "Changed to:" vs "Edit:")
- Error message wording for different failure types
- Badge update debouncing (immediate vs batched updates)

### Deferred Ideas (OUT OF SCOPE)
- Automatic conflict resolution
- Editing/deleting GitHub comments from Plannotator
- Image upload to GitHub Gist
- Annotation reactions/emoji
- Incremental sync (only since last timestamp)
- PR review submission (APPROVE/REQUEST_CHANGES) -- Phase 7
- Thread summary annotations -- Phase 7
- Issue comments for global annotations -- Phase 7
- Real-time sync via webhooks
- Multi-repo support
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SYNC-OUT-01 | User can trigger "Sync to GitHub" to export annotations as PR comments | OutboundSyncButton component + useGitHubOutboundSync hook + server endpoint |
| SYNC-OUT-02 | New annotations posted as PR review comments on correct lines | mapAnnotationsToComments() reuse + submitBatchReview() + follow-up ID fetch |
| SYNC-OUT-03 | Stable annotation IDs prevent duplicate comments on repeated sync | getCommentId() KV lookup before posting + setMapping() after posting |
| SYNC-OUT-04 | Line mapping detects when plan changed since PR creation | generatePlanHash() comparison with prMetadata.planHash |
| SYNC-OUT-05 | Drift warning shown when markdown structure changed | DriftWarningBanner component + hash comparison before sync |
| SYNC-OUT-06 | DELETION annotations converted to GitHub suggestion code blocks | mapAnnotationsToComments() already handles this (Phase 4) |
| SYNC-OUT-07 | Batch review submission for outbound annotations | submitBatchReview() reuse with event: "COMMENT" |
| SYNC-OUT-08 | Annotations with images include image references | D-07 overrides: text-only, skip images, show toast warning |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Bun runtime | latest | Server runtime, test runner | Project standard per CLAUDE.md |
| React | 19.x | UI components | Project standard |
| Tailwind CSS | v4 | Styling | Project standard per theme.css |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| web-highlighter | existing | Annotation highlighting | Already in use, no changes needed |

### Alternatives Considered
None -- Phase 6 introduces no new dependencies. All required infrastructure exists from Phases 3-5.

## Architecture Patterns

### Recommended Project Structure

New files to create:
```
packages/
├── github/
│   ├── server/
│   │   └── outboundSync.ts         # performOutboundSync() orchestration
│   │   └── outboundSync.test.ts    # Unit tests
│   └── client/
│       └── useGitHubOutboundSync.ts  # Client hook
├── ui/
│   └── components/
│       └── ToolbarButtons.tsx       # Add OutboundSyncButton (extend existing)
```

Files to modify:
```
packages/
├── github/
│   ├── server/
│   │   └── handler.ts              # Add POST /api/pr/{pasteId}/sync/outbound route
│   └── client/
│       └── GitHubProvider.tsx       # Wire syncToGitHub action
├── editor/
│   └── App.tsx                      # Register outbound sync, pass annotations
```

### Pattern 1: Server-Side Outbound Sync Orchestration

**What:** Single `performOutboundSync()` function that handles classification, posting, and KV persistence.
**When to use:** Always -- mirrors `performInboundSync()` from Phase 5.

```typescript
// packages/github/server/outboundSync.ts
export interface OutboundSyncResult {
  syncedCount: number;
  editCount: number;
  skippedCount: number;
  warnings: string[];
}

export async function performOutboundSync(
  pasteId: string,
  annotations: ExportAnnotation[],
  blocks: ExportBlock[],
  planMarkdown: string,
  prMetadata: PRMetadataWithSync,
  token: string,
  kv: any,
  options?: { fetchFn?: typeof fetchPRComments }
): Promise<OutboundSyncResult> {
  // 1. Classify annotations: new vs edited vs skip
  // 2. Post new annotations via submitBatchReview()
  // 3. Fetch review comments to get IDs for KV mapping
  // 4. Post edit replies via comment reply endpoint
  // 5. Store KV mappings + update sync state
}
```

### Pattern 2: Review Comment ID Recovery

**What:** After `submitBatchReview()`, fetch the review's comments to get individual IDs.
**When to use:** Always after batch review submission for outbound sync (needed for KV mapping).
**Why:** GitHub Reviews API response does NOT include individual comment IDs.

```typescript
// After submitBatchReview returns reviewResponse:
const reviewId = reviewResponse.id;
const reviewComments = await githubRequest(
  `GET /repos/${owner}/${repo}/pulls/${prNumber}/reviews/${reviewId}/comments`,
  token
);
// reviewComments is an array of comment objects with .id, .body, .path, .line
// Match back to annotations by position (path + line) or order
```

**Source:** GitHub REST API docs -- "List comments for a pull request review" endpoint verified.

### Pattern 3: Edit Reply via Comment Reply Endpoint

**What:** Post edited annotation text as a reply to the original GitHub comment.
**When to use:** When annotation has KV mapping but text differs from GitHub comment body.

```typescript
// POST /repos/{owner}/{repo}/pulls/{pull_number}/comments/{comment_id}/replies
await githubRequest(
  `POST /repos/${owner}/${repo}/pulls/${prNumber}/comments/${numericCommentId}/replies`,
  token,
  { body: `Updated: ${annotation.text}` }
);
```

**Source:** GitHub REST API docs -- verified. Note: `comment_id` must be numeric (strip "review_" prefix from stored IDs).

### Pattern 4: Client Hook Mirroring useGitHubPRSync

**What:** `useGitHubOutboundSync` hook that wraps server call with loading/error/retry state.
**When to use:** In App.tsx, registered into GitHubProvider.

```typescript
export function useGitHubOutboundSync({
  pasteId, prMetadata, token, annotations, blocks, planMarkdown,
  onSyncComplete, onError,
}: UseGitHubOutboundSyncOptions): UseGitHubOutboundSyncResult {
  // POST /api/pr/{pasteId}/sync/outbound
  // Handle 401, 429, network errors
  // Return { syncToGitHub, isSyncing, error, unsyncedCount }
}
```

### Anti-Patterns to Avoid
- **Polling for outbound sync:** Outbound is user-triggered only (D-08). No polling, no auto-sync.
- **Replacing original comments on edit:** D-03 specifies threaded replies. Never PATCH the original comment.
- **Assuming review response has comment IDs:** It does not. Always do a follow-up fetch.
- **Using `in_reply_to_id` from stored IDs directly:** KV stores IDs with "review_" prefix. Strip prefix before using as numeric comment_id in reply endpoint.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Annotation-to-comment mapping | Custom line mapper | `mapAnnotationsToComments()` from `export.ts` | Already handles DELETION suggestions, GLOBAL filtering, block.startLine |
| Batch review posting | Custom multi-request loop | `submitBatchReview()` from `export.ts` | Single API call, single notification |
| KV dedup/mapping | Custom storage | `getCommentId()`, `setMapping()` from `syncMappings.ts` | Bidirectional O(1) lookup, TTL management |
| Plan hash comparison | Custom hashing | `generatePlanHash()` from `planHash.ts` | SHA-256, consistent with Phase 4 |
| Sync state tracking | Custom timestamp logic | `setSyncState()` from `syncState.ts` | Direction-aware, TTL-managed |
| Error retry logic | Custom retry wrapper | Follow `useGitHubExport` / `useGitHubPRSync` pattern | 3x backoff, rate limit, auth handling proven |

**Key insight:** Phase 6 is 80% composition of existing Phase 3/4/5 primitives. The only genuinely new logic is edit detection (classify + reply) and the review-comment-ID recovery step.

## Common Pitfalls

### Pitfall 1: Review Response Missing Comment IDs
**What goes wrong:** After `submitBatchReview()`, attempting to read `reviewResponse.comments` to get IDs. The field may be absent or empty in the actual GitHub API response.
**Why it happens:** Phase 4's `exportPlanWithAnnotations` already does this (line 198), but the current code uses `reviewResponse?.comments` which may work for some GitHub API versions but is not guaranteed.
**How to avoid:** Always use the follow-up `GET /repos/.../reviews/{review_id}/comments` endpoint to reliably get comment IDs. Match by (path, line, body) tuple or by order.
**Warning signs:** KV mappings not being stored after sync, deduplication failing on subsequent syncs.

### Pitfall 2: Comment ID Format Mismatch
**What goes wrong:** KV stores comment IDs as `review_12345` (from Phase 5 inbound sync `fetchPRComments`), but the reply endpoint needs numeric `12345`.
**Why it happens:** `fetchPRComments` prefixes with "review_" or "issue_" for internal disambiguation.
**How to avoid:** When posting replies, strip the prefix: `commentId.replace(/^review_/, "")`. When storing new outbound mappings, use the raw numeric ID (or consistently use the prefixed format and strip on API calls).
**Warning signs:** 404 errors when posting edit replies.

### Pitfall 3: Replies to Replies Not Supported
**What goes wrong:** If an edited annotation's original comment was itself a reply (in_reply_to_id set), posting a reply to it will fail.
**Why it happens:** GitHub API explicitly states "Replies to replies are not supported."
**How to avoid:** For edit replies, always reply to the top-level comment in the thread. If the mapped commentId is a reply itself, find the root comment first. For Phase 6 outbound comments (which are always top-level), this is not an issue -- but edited inbound comments that were replies will be.
**Warning signs:** 404 or 422 errors on reply API calls.

### Pitfall 4: Badge Count Requires Server Round-Trip
**What goes wrong:** Computing badge count (unsynced annotations) requires checking KV for each annotation's mapping status, which lives on the server.
**Why it happens:** Client cannot directly query KV.
**How to avoid:** Two approaches: (a) Track synced annotation IDs client-side after each sync, or (b) include mapping status in metadata endpoint. Approach (a) is simpler -- maintain a `Set<string>` of synced annotation IDs locally, updated after each outbound sync.
**Warning signs:** Badge count showing 0 or wrong number, badge not updating after sync.

### Pitfall 5: Race Between Inbound and Outbound Sync
**What goes wrong:** User triggers outbound sync while inbound sync is polling. Both modify KV mappings.
**Why it happens:** Inbound polling runs on 5-minute intervals.
**How to avoid:** Disable inbound polling during outbound sync. Set a flag, pause interval, resume after outbound completes.
**Warning signs:** Duplicate comments, stale badge counts, KV corruption.

### Pitfall 6: GLOBAL_COMMENT and Image Toasts Silently Swallowed
**What goes wrong:** Server filters globals and strips images but client shows no warning.
**Why it happens:** Server returns warnings[] array but client ignores it.
**How to avoid:** Client must display all warnings from the response as toast notifications per D-07 and D-19.
**Warning signs:** User confusion about missing annotations on GitHub.

## Code Examples

### Outbound Sync Server Endpoint Pattern
```typescript
// packages/github/server/handler.ts -- new route
const PR_SYNC_OUTBOUND_PATTERN = /^\/api\/pr\/([A-Za-z0-9]{6,16})\/sync\/outbound$/;

// Match: POST /api/pr/{pasteId}/sync/outbound
const syncOutboundMatch = url.pathname.match(PR_SYNC_OUTBOUND_PATTERN);
if (syncOutboundMatch && req.method === "POST") {
  const pasteId = syncOutboundMatch[1];
  // ... token extraction/validation (same as inbound) ...
  // ... load prMetadata (same fallback chain as inbound) ...
  const body = await req.json();
  const result = await performOutboundSync(
    pasteId, body.annotations, body.blocks,
    body.planMarkdown, prMetadata, token, kv
  );
  return Response.json(result);
}
```

### Edit Detection Classification
```typescript
// Source: CONTEXT.md D-01/D-02/D-04 pattern
async function classifyAnnotations(
  annotations: ExportAnnotation[],
  pasteId: string,
  prMetadata: PRMetadataWithSync,
  token: string,
  kv: any
): Promise<{
  newAnnotations: ExportAnnotation[];
  editedAnnotations: Array<ExportAnnotation & { githubCommentId: string }>;
  skippedCount: number;
  globalCount: number;
  imageCount: number;
}> {
  const { comments } = await fetchPRComments(prMetadata, token);
  // Build lookup: numeric comment ID -> comment body
  const commentBodyMap = new Map<string, string>();
  for (const c of comments) {
    commentBodyMap.set(c.id, c.body);
  }

  const newAnns: ExportAnnotation[] = [];
  const editedAnns: Array<ExportAnnotation & { githubCommentId: string }> = [];
  let skipped = 0, globals = 0, images = 0;

  for (const ann of annotations) {
    if (ann.type === "GLOBAL_COMMENT") { globals++; continue; }
    if (ann.images?.length) images++;

    const commentId = await getCommentId(pasteId, ann.id, kv);
    if (!commentId) {
      newAnns.push(ann);
    } else {
      const githubBody = commentBodyMap.get(commentId);
      if (githubBody && ann.text !== githubBody) {
        editedAnns.push({ ...ann, githubCommentId: commentId });
      } else {
        skipped++;
      }
    }
  }

  return { newAnnotations: newAnns, editedAnnotations: editedAnns, skippedCount: skipped, globalCount: globals, imageCount: images };
}
```

### Review Comment ID Recovery After Batch Submit
```typescript
// Source: GitHub REST API docs -- List comments for a pull request review
async function fetchReviewCommentIds(
  owner: string, repo: string, prNumber: number,
  reviewId: number, token: string
): Promise<Array<{ id: number; body: string; path: string; line: number }>> {
  const comments = await githubRequest(
    `GET /repos/${owner}/${repo}/pulls/${prNumber}/reviews/${reviewId}/comments`,
    token
  );
  return comments; // Array of comment objects with numeric .id
}
```

### OutboundSyncButton Component
```typescript
// Extends existing ToolbarButtons.tsx pattern
export const OutboundSyncButton: React.FC<OutboundSyncButtonProps> = ({
  onClick, disabled, isLoading, unsyncedCount, title, disabledTitle,
}) => (
  <button
    onClick={onClick}
    disabled={disabled || isLoading}
    className={`relative p-1.5 md:px-2.5 md:py-1 rounded-md text-xs font-semibold transition-all ${
      disabled
        ? "opacity-50 cursor-not-allowed bg-muted text-muted-foreground"
        : "bg-accent/15 text-accent hover:bg-accent/25 border border-accent/30"
    }`}
    title={disabled ? disabledTitle : title}
  >
    {/* Upload arrow icon -- per UI-SPEC */}
    <svg className={`w-4 h-4 md:hidden ${isLoading ? "animate-spin" : ""}`}
      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
    {/* Badge -- identical to SyncButton badge */}
    {unsyncedCount > 0 && !isLoading && (
      <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-[16px] h-4 rounded-full bg-accent text-accent-foreground text-[10px] font-mono font-semibold px-0.5">
        {unsyncedCount > 9 ? "9+" : unsyncedCount}
      </span>
    )}
  </button>
);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Assume review response has comment IDs | Fetch review comments after submission | Observed in Phase 4 code | Must add follow-up fetch for reliable KV mapping |
| Single sync direction | Bidirectional sync with KV dedup | Phase 5 (inbound) + Phase 6 (outbound) | Shared KV infrastructure serves both |

**Important API detail:** The `POST .../pulls/{pr}/comments/{comment_id}/replies` endpoint requires a numeric comment_id. The project stores IDs with "review_" prefix. This must be handled consistently.

## Common Pitfalls

(See above -- consolidated in single section)

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | bun:test (built-in) |
| Config file | bunfig.toml (linker: isolated) |
| Quick run command | `bun test packages/github/server/outboundSync.test.ts` |
| Full suite command | `bun test packages/github/` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SYNC-OUT-01 | Trigger outbound sync endpoint | unit | `bun test packages/github/server/outboundSync.test.ts -t "trigger"` | Wave 0 |
| SYNC-OUT-02 | New annotations map to correct lines | unit | `bun test packages/github/server/outboundSync.test.ts -t "line mapping"` | Wave 0 |
| SYNC-OUT-03 | Deduplication via KV mapping | unit | `bun test packages/github/server/outboundSync.test.ts -t "dedup"` | Wave 0 |
| SYNC-OUT-04 | Drift detection via plan hash | unit | `bun test packages/github/server/outboundSync.test.ts -t "drift"` | Wave 0 |
| SYNC-OUT-05 | Drift warning triggers on hash mismatch | unit | `bun test packages/github/server/outboundSync.test.ts -t "drift warning"` | Wave 0 |
| SYNC-OUT-06 | DELETION as suggestion blocks | unit | Already covered by `bun test packages/github/server/export.test.ts` | Exists |
| SYNC-OUT-07 | Batch review submission | unit | Already covered by `bun test packages/github/server/export.test.ts` | Exists |
| SYNC-OUT-08 | Images skipped, text-only | unit | `bun test packages/github/server/outboundSync.test.ts -t "images"` | Wave 0 |

### Sampling Rate
- **Per task commit:** `bun test packages/github/server/outboundSync.test.ts`
- **Per wave merge:** `bun test packages/github/`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/github/server/outboundSync.test.ts` -- covers SYNC-OUT-01 through SYNC-OUT-05, SYNC-OUT-08
- [ ] Mock KV pattern: reuse `createMockKV()` from `inboundSync.test.ts`
- [ ] Mock `githubRequest` and `fetchPRComments` for isolated testing

## Open Questions

1. **Comment ID matching strategy after batch review**
   - What we know: GitHub returns review object with `.id`, then we fetch review's comments
   - What's unclear: How to reliably match returned comments back to submitted annotations when multiple annotations target the same line
   - Recommendation: Match by (path, line, body) tuple since body is unique per annotation. If ambiguous, fall back to positional order (comments returned in submission order). Both approaches should be tested.

2. **Edit reply for inbound-synced annotations that were replies**
   - What we know: GitHub API says "replies to replies are not supported"
   - What's unclear: If a user edits an annotation that was imported from a GitHub reply comment (in_reply_to_id set), can we still reply to it?
   - Recommendation: For Phase 6, skip edit detection for annotations with `source: "github-pr"` (imported annotations). These were created by GitHub users, not Plannotator users. Only detect edits for locally-created annotations.

## Sources

### Primary (HIGH confidence)
- `packages/github/server/export.ts` -- submitBatchReview, mapAnnotationsToComments implementation
- `packages/github/server/inboundSync.ts` -- performInboundSync pattern to mirror
- `packages/github/server/syncMappings.ts` -- KV bidirectional mapping API
- `packages/github/server/handler.ts` -- route registration pattern
- `packages/github/client/useGitHubPRSync.ts` -- client hook pattern with retry
- `packages/github/client/useGitHubExport.ts` -- export hook pattern
- `packages/github/client/GitHubProvider.tsx` -- context with syncToGitHub stub
- `packages/ui/components/ToolbarButtons.tsx` -- SyncButton pattern
- GitHub REST API docs -- review creation, review comment listing, comment reply endpoint

### Secondary (MEDIUM confidence)
- GitHub REST API response format for review creation (verified that comment IDs are NOT in response)
- Reply endpoint limitation (verified: "replies to replies are not supported")

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all infrastructure exists
- Architecture: HIGH -- mirrors proven Phase 5 inbound pattern
- Pitfalls: HIGH -- based on actual code review and API documentation verification
- GitHub API behavior: HIGH -- verified via official docs

**Research date:** 2026-04-08
**Valid until:** 2026-05-08 (stable -- GitHub REST API v3 is mature)
