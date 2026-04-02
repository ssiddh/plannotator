# Phase 3: Data Model & Sync Infrastructure - Context

**Gathered:** 2026-04-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the foundational data layer that enables bidirectional sync between Plannotator and GitHub. This includes stable deterministic annotation IDs, bidirectional mappings between Plannotator annotation IDs and GitHub comment IDs, line-to-block conversion in both directions, sync state tracking, and conflict detection when both sides modify the same annotation.

</domain>

<decisions>
## Implementation Decisions

### ID Stability Strategy

- **D-01:** Annotation IDs use content-based SHA-256 hash (truncated to 12-16 chars)
  - Deterministic: same selection always generates same ID
  - Works offline, no server round-trip needed
  - Reuses SHA-256 from Phase 2 token cache (Web Crypto API / Node.js crypto)
  - Hash input: `blockId + originalText` (minimal, tolerates minor position shifts)

- **D-02:** Collision handling via sequence suffix
  - If generated ID already exists in current annotation set, append `-1`, `-2`, etc.
  - Example: `abc123def456`, `abc123def456-1`, `abc123def456-2`
  - Preserves user intent (multiple annotations on same text remain separate)
  - Existing annotation helpers already handle ID deduplication in memory

- **D-03:** Hash input excludes exact character offsets
  - Hash only `blockId + originalText`, not `startOffset + endOffset`
  - More forgiving of line drift (same text in same block = same ID)
  - Trades precision for stability across plan edits
  - Better duplicate detection across minor content shifts

### Bidirectional ID Mapping

- **D-04:** Mappings stored in server-side KV (Cloudflare Workers KV or in-memory Map)
  - Centralized: survives page reloads, works across devices
  - Consistent with Phase 2 token cache pattern
  - Not stored in localStorage (avoids device lock-in and quota limits)
  - Not embedded in paste metadata (avoids schema extension and paste update overhead)

- **D-05:** Bidirectional pair storage for O(1) lookups in both directions
  - Key pattern: `sync:{pasteId}:ann:{annotationId}` → Value: `commentId`
  - Key pattern: `sync:{pasteId}:gh:{commentId}` → Value: `annotationId`
  - Optimized for GitHub-first review workflow (frequent inbound sync)
  - Inbound sync checks "does this GitHub comment exist?" in O(1)
  - Outbound sync looks up "what's the GitHub ID for this annotation?" in O(1)

- **D-06:** Mapping TTL matches paste expiry
  - Sync mappings live as long as the paste exists
  - Consistent lifecycle: paste expires → mappings expire
  - Requires setting same TTL as paste (e.g., 30 days)
  - No orphaned mappings for deleted pastes

### Block-to-Line Conversion

- **D-07:** Use `block.startLine` directly for outbound sync
  - Annotation has `blockId`, block has `startLine` (from parser)
  - GitHub PR comment posted at `block.startLine`
  - Simple, no calculation needed — field already exists
  - All annotations on same block go to same line (GitHub groups as threads)

- **D-08:** Line drift detected via plan markdown hash comparison
  - Hash full plan markdown at PR creation (SHA-256)
  - Store hash in PR metadata (`PRMetadata.planHash` field)
  - On sync, compare current plan hash to stored hash
  - Changed hash = drift detected

- **D-09:** Drift handling: warn but allow sync
  - Show warning in UI: "Plan changed since PR creation — line numbers may be incorrect"
  - User can proceed with sync (allow) or cancel
  - Matches SYNC-OUT-04/05 requirements (detect and warn)
  - Does not block sync (user decides if acceptable)

### Sync State & Conflict Detection

- **D-10:** Per-paste sync metadata tracked in KV
  - Key: `sync:{pasteId}:state`
  - Value: `{ lastSyncTimestamp: Date, lastSyncDirection: 'inbound' | 'outbound' }`
  - Lightweight: two fields, paste-scoped
  - Sufficient for basic conflict detection (DATA-04 requirement)

- **D-11:** Conflict detection via timestamp comparison
  - Conflict if: `annotation.createdAt > lastSyncTimestamp` AND `GitHub comment.updated_at > lastSyncTimestamp`
  - Both sides modified since last sync = conflict
  - Requires GitHub comment timestamps (available via API)
  - Simple check, works with existing `createdAt` field

- **D-12:** Conflict resolution: prompt user to choose
  - Show conflict UI: "This annotation changed in both places"
  - Options: "Keep local version" / "Keep GitHub version" / "Merge manually"
  - Safest approach: user has control, no data loss risk
  - Blocks sync until resolved (standard conflict UX)

- **D-13:** Incremental sync (only changed annotations)
  - Sync only new/modified annotations since `lastSyncTimestamp`
  - Faster, fewer GitHub API calls (rate limit friendly)
  - Inbound: skip GitHub comments already in mapping (dedupe via `sync:{pasteId}:gh:{commentId}` lookup)
  - Outbound: sync annotations with `createdAt > lastSyncTimestamp`

### Claude's Discretion

- SHA-256 truncation length (12 vs 16 chars) — balance readability vs collision risk
- KV key naming conventions (prefix structure)
- Conflict UI design (modal vs sidebar vs inline)
- Error handling for hash generation failures
- Retry logic for KV write failures

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §Data Model & Sync State — DATA-01 through DATA-05 define what must be TRUE

### Existing Implementation
- `packages/ui/types.ts` — Annotation type definition (id, blockId, startOffset, endOffset, originalText, createdAt, source)
- `packages/ui/utils/lineMapper.ts` — Line → Block mapping (binary search, already implemented)
- `packages/github/client/lineMapper.ts` — Duplicate line mapper in GitHub package (same logic)
- `packages/github/client/useGitHubPRSync.ts` — Existing sync hook with polling (incomplete, needs bidirectional mapping)

### Storage Patterns
- `packages/github/server/middleware.ts` — KV cache pattern from Phase 2 (token validation with sha256 keys, 5min TTL)
- `apps/paste-service/stores/kv.ts` — Cloudflare Workers KV interface
- `apps/paste-service/stores/fs.ts` — In-memory Map fallback for local dev

### Parser
- `packages/ui/utils/parser.ts` — `parseMarkdownToBlocks()` function (generates Block objects with startLine field)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **Line → Block mapping**: `packages/ui/utils/lineMapper.ts` (137 lines)
  - `mapLineToBlock(lineNumber, blocks)` — binary search, O(log n)
  - `mapCommentsToBlocks(comments, blocks)` — bulk mapping
  - `findClosestBlocks(lineNumber, blocks, count)` — fuzzy matching fallback
  - Already handles edge cases (line before first block, after last block)
  - Duplicated in `packages/github/client/lineMapper.ts` (same code)

- **Block type with startLine**: `packages/ui/types.ts`
  - Block already has `startLine: number` field (1-based line number from source)
  - Populated by `parseMarkdownToBlocks()` in parser.ts
  - Ready for Block → Line reverse mapping (just read the field)

- **KV storage pattern**: Phase 2 token cache (middleware.ts)
  - SHA-256 hashing for keys: `token:${sha256(value)}`
  - TTL via KV expiration
  - Cloudflare Workers KV (prod) or in-memory Map (dev)
  - Can reuse pattern for sync mappings

- **Annotation type**: `packages/ui/types.ts`
  - Has `id`, `blockId`, `originalText`, `createdAt`, `source` fields
  - `source` field already exists for external tool identifiers (e.g., "eslint")
  - Can extend to track GitHub origin: `source: "github-pr"`

### Established Patterns

- **SHA-256 hashing**: Web Crypto API (browser) or Node.js crypto (server)
  - Already used in Phase 2 for token cache keys
  - Async API: `crypto.subtle.digest('SHA-256', ...)`
  - Truncate hex output to 12-16 chars for readability

- **Timestamp comparison**: JavaScript Date milliseconds
  - Annotation `createdAt` is `number` (milliseconds since epoch)
  - GitHub API returns ISO 8601 strings — need `new Date(iso).getTime()`
  - Simple `>` comparison for conflict detection

- **KV key namespacing**: Phase 2 uses `token:` prefix
  - Sync mappings: `sync:{pasteId}:ann:{annotationId}` and `sync:{pasteId}:gh:{commentId}`
  - Sync state: `sync:{pasteId}:state`
  - Consistent naming convention

### Integration Points

- **Annotation creation**: `packages/ui/hooks/useAnnotationHighlighter.ts`
  - Currently generates ID via `Math.random().toString(36).substring(2, 9)`
  - Need to replace with stable hash-based ID generation
  - Hook has access to `blockId` and `originalText` (hash inputs)

- **GitHub PR sync hook**: `packages/github/client/useGitHubPRSync.ts` (incomplete)
  - Polls `/api/pr/{pasteId}/comments` endpoint
  - Converts PR comments to Annotations
  - Missing: bidirectional mapping check (skip already-imported comments)
  - Missing: sync state tracking (lastSyncTimestamp)

- **PR metadata**: `packages/github/shared/types.ts`
  - `PRMetadata` type needs extension: add `planHash: string` field
  - Stored alongside existing `repo`, `number`, `url` fields

### Code to Modify

- `packages/ui/utils/annotationHelpers.ts` — Add `generateStableId(blockId, originalText)` function
- `packages/github/client/useGitHubPRSync.ts` — Add bidirectional mapping lookup before creating annotations
- `packages/github/server/sync.ts` — New module for sync state and mapping operations
- `packages/github/shared/types.ts` — Extend `PRMetadata` with `planHash` field
- `packages/ui/types.ts` — Extend `Annotation` with optional `githubCommentId?: string` field (alternative to separate mapping)

</code_context>

<specifics>
## Specific Ideas

- Hash function signature: `generateStableId(blockId: string, originalText: string): Promise<string>`
  - Returns truncated SHA-256 hex (12 chars)
  - Collision handling: caller checks existence, appends `-1` if needed
  - Example output: `a3f9d2b8c1e4`, `a3f9d2b8c1e4-1`

- KV operations module: `packages/github/server/syncMappings.ts`
  - `setMapping(pasteId, annotationId, commentId, kv, ttl)` — writes both directions
  - `getCommentId(pasteId, annotationId, kv)` — reads `sync:{pasteId}:ann:{annotationId}`
  - `getAnnotationId(pasteId, commentId, kv)` — reads `sync:{pasteId}:gh:{commentId}`
  - `setSyncState(pasteId, timestamp, direction, kv)` — writes state
  - `getSyncState(pasteId, kv)` — reads state

- Drift warning UI: Show banner at top of annotation panel
  - "⚠️ Plan changed since PR creation. Line numbers may be incorrect. [Recreate PR] [Sync Anyway]"
  - Non-blocking: user can dismiss or proceed

- Conflict resolution UI: Modal dialog
  - Show diff: local annotation text vs GitHub comment text
  - Three buttons: "Keep Local", "Keep GitHub", "Cancel Sync"
  - If "Keep Local": skip import of conflicting GitHub comment
  - If "Keep GitHub": overwrite local annotation with GitHub comment content

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-data-model-sync-infrastructure*
*Context gathered: 2026-04-01*
