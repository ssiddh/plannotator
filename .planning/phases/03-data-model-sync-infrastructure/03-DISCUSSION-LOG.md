# Phase 3: Data Model & Sync Infrastructure - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-01
**Phase:** 03-data-model-sync-infrastructure
**Areas discussed:** ID Stability Strategy, Bidirectional ID Mapping, Block-to-Line Conversion, Sync State & Conflict Detection

---

## ID Stability Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Content-based hash | Hash annotation properties (blockId + startOffset + endOffset + originalText). Deterministic — same selection always gets same ID. Works offline. Supports deduplication naturally. Risk: collisions if user annotates same text twice (rare but possible). | ✓ |
| UUID with storage | Generate UUID on creation, store in annotation object and sync mappings. Guaranteed unique. Requires storage of every annotation ever created. More complex but handles all edge cases (duplicate selections, splits, merges). | |
| Timestamp + content composite | Combine createdAt timestamp with content hash. Unique even for duplicate selections. Supports offline. Balances stability and uniqueness. Slightly more complex hash function. | |

**User's choice:** Content-based hash (Recommended)
**Notes:** Deterministic IDs preferred for simplicity and deduplication.

---

### Collision Handling

| Option | Description | Selected |
|--------|-------------|----------|
| Add sequence suffix | If ID exists, append -1, -2, etc. Example: hash123, hash123-1, hash123-2. Simple, deterministic order, minimal storage. Existing annotation helpers already handle ID deduplication in memory. | ✓ |
| Treat as single annotation | Multiple annotations on same text become one with merged comments/images. Simpler model but loses user intent if they wanted separate annotations. GitHub doesn't support this well (separate PR comments). | |
| Include author in hash | Hash includes author identity (Tater name). Same user + same text = same ID, different users = different IDs. Works for collaborative reviews but not for solo authors re-annotating. | |

**User's choice:** Add sequence suffix (Recommended)
**Notes:** Preserves user intent, matches GitHub PR comment model (separate comments allowed).

---

### Hash Algorithm

| Option | Description | Selected |
|--------|-------------|----------|
| SHA-256 (truncated) | Crypto-grade hash, truncate to 12-16 chars for readability. Already used in Phase 2 middleware for token cache keys. Minimal collision risk. Built into Web Crypto API and Node.js crypto. | ✓ |
| MurmurHash3 | Fast non-crypto hash, good distribution, shorter output. Requires dependency or implementation. Used in Redis, Cassandra for partitioning. Lower collision resistance than SHA-256. | |
| Base64 encode properties | Simple encoding of blockId+offsets without hashing. Longer IDs but reversible (can decode to see source). No collision protection. Easier debugging. | |

**User's choice:** SHA-256 (truncated) (Recommended)
**Notes:** Reuses existing pattern from Phase 2, no new dependencies.

---

### Hash Input

| Option | Description | Selected |
|--------|-------------|----------|
| blockId + originalText | Minimal: just the block and selected text content. Simple, works for most cases. Ignores exact character offsets — same text in same block = same ID even if position shifts slightly. Good for line drift tolerance. | ✓ |
| blockId + startOffset + endOffset + originalText | Full precision: exact position and content. More unique but breaks if block content shifts. Better duplicate detection but less forgiving of minor edits. Matches current Annotation type fields. | |
| originalText only | Content-only hash. Same text anywhere in plan = same ID. Extreme deduplication. Loses position context. Risk: user annotates 'TODO' in multiple places — all get same ID. | |

**User's choice:** blockId + originalText (Recommended)
**Notes:** Balances stability and uniqueness, more forgiving of line drift.

---

## Bidirectional ID Mapping

| Option | Description | Selected |
|--------|-------------|----------|
| Server KV store | Store in Cloudflare Workers KV (prod) or in-memory Map (dev). Centralized, survives page reloads, works across devices. Consistent with Phase 2 token cache pattern. Key: paste ID + annotation ID. TTL matches paste expiry. | ✓ |
| Client localStorage | Store mappings in browser localStorage alongside annotations. Simple, no server changes needed. Device-specific — won't work if user switches browsers/devices. Need to handle localStorage quota limits for large plans. | |
| Embedded in paste metadata | Store mappings in the paste object itself (alongside plan markdown and ACL). Persists with the share. Survives across sessions and devices. Requires extending PasteStore schema. Sync operations update the paste. | |

**User's choice:** Server KV store (Recommended)
**Notes:** Centralized storage avoids device lock-in and quota issues.

---

### KV Schema

| Option | Description | Selected |
|--------|-------------|----------|
| Bidirectional pairs | Store both: sync:{pasteId}:ann:{annotationId} → commentId AND sync:{pasteId}:gh:{commentId} → annotationId. Fast lookups in both directions. Inbound sync checks 'does this GitHub comment exist?' in O(1). Outbound sync looks up 'what's the GitHub ID?' in O(1). Double storage but optimized for primary use case. | ✓ |
| Single JSON blob with dual indexes | Key: sync:{pasteId}, Value: {annToGh: {...}, ghToAnn: {...}}. One KV read gets both indexes. Efficient for small-medium plans. Requires full object rewrite on every sync. Memory-efficient but slower for large plans (>500 comments). | |
| GitHub-first index only | Key: sync:{pasteId}:gh:{commentId}, Value: annotationId. Optimize for inbound sync (GitHub → Plannotator). For outbound, scan all keys or maintain in-memory reverse index. Trades outbound performance for simpler storage. | |

**User's choice:** Bidirectional pairs (Recommended)
**Notes:** Given GitHub-first review workflow, inbound sync is the hot path. O(1) lookups in both directions are worth the double storage.

---

### Mapping TTL

| Option | Description | Selected |
|--------|-------------|----------|
| Match paste expiry | Sync mappings live as long as the paste exists. Consistent with paste lifecycle — when paste expires, mappings expire too. Requires knowing paste expiry (from PasteStore) or setting same TTL (e.g., 30 days). | ✓ |
| Longer than paste (90 days) | Keep mappings longer than paste content. Allows sync to work even if paste expired but GitHub PR still active. User can re-share plan, mappings still valid. More storage cost, handles edge cases. | |
| No expiry (permanent) | Sync mappings never expire. Simplest, no cleanup needed. Storage grows unbounded. Works if KV storage is cheap/unlimited. May accumulate stale mappings from deleted PRs. | |

**User's choice:** Match paste expiry (Recommended)
**Notes:** Consistent lifecycle management, no orphaned data.

---

## Block-to-Line Conversion

| Option | Description | Selected |
|--------|-------------|----------|
| Use block.startLine directly | Annotation has blockId, block has startLine — post comment at block.startLine. Simple, already available. Works well for heading/paragraph annotations. All comments on a block go to the same line (GitHub groups them as threads). | ✓ |
| Calculate offset within block | Parse block content to find annotation's originalText position, add to startLine. More precise — annotation on line 3 of a 10-line code block goes to startLine+3. Complex parsing, especially for markdown blocks with nested formatting. | |
| Store absolute line number in annotation | When annotation created, capture the absolute line number from source markdown. Add lineNumber field to Annotation type. Simple lookup, no calculation. Breaks if plan markdown edited after annotation (line drift). | |

**User's choice:** Use block.startLine directly (Recommended)
**Notes:** Simple, aligns with GitHub's thread grouping behavior.

---

### Line Drift Handling

| Option | Description | Selected |
|--------|-------------|----------|
| Warn but allow sync | Detect drift (compare current plan hash vs PR creation hash), show warning in UI: 'Plan changed since PR creation — line numbers may be incorrect'. Let user proceed. Matches existing SYNC-OUT-04/05 requirements. | ✓ |
| Block outbound sync | If plan changed, prevent sync entirely until user recreates PR with new plan version. Safest but strict. User can't add new annotations to existing PR after any plan edit. | |
| Re-map lines automatically | Attempt to match annotations to new line numbers using content similarity. Complex algorithm (diff-based or text search). May guess wrong. Better UX but risky for accuracy. | |

**User's choice:** Warn but allow sync (Recommended)
**Notes:** User has control, matches requirement for drift detection + warning.

---

### Drift Detection

| Option | Description | Selected |
|--------|-------------|----------|
| Plan markdown hash | Hash the full plan markdown at PR creation, store in PR metadata. On sync, compare current hash. Changed hash = drift warning. Simple, catches any edit. Already have SHA-256 from ID generation. Stored in PRMetadata type. | ✓ |
| Block structure fingerprint | Hash the block IDs and startLine positions. Detects structural changes (added/removed/reordered blocks) but not content edits within blocks. More granular but complex. Useful for 'safe edits' (typo fixes) vs 'unsafe edits' (structure changes). | |
| Line count comparison | Store line count at PR creation, compare on sync. Fast, simple check. Catches additions/deletions but not reorderings or edits that keep line count same. Coarse but better than nothing. | |

**User's choice:** Plan markdown hash (Recommended)
**Notes:** Simple, catches all changes, reuses SHA-256 infrastructure.

---

## Sync State & Conflict Detection

| Option | Description | Selected |
|--------|-------------|----------|
| Timestamp + direction | Track: lastSyncTimestamp, lastSyncDirection (inbound/outbound). Simple, covers basic conflict detection: 'Was this annotation modified after last sync?' Stored in KV alongside mappings. Matches DATA-04 requirement. | ✓ |
| Per-annotation timestamps | Track lastSyncedAt for each annotation individually. More granular — can detect per-annotation conflicts. More storage. Useful if users sync incrementally (only new annotations) rather than full syncs. | |
| Full sync log | Store history of all sync operations: [{timestamp, direction, annotationIds[], success}]. Audit trail for debugging. Heavier storage. Useful for conflict resolution UI ('show me what changed'). | |

**User's choice:** Timestamp + direction (Recommended)
**Notes:** Lightweight, sufficient for basic conflict detection.

---

### Conflict Detection

| Option | Description | Selected |
|--------|-------------|----------|
| Compare timestamps | Conflict if: annotation.createdAt > lastSyncTimestamp AND GitHub comment updated_at > lastSyncTimestamp. Simple, works with existing createdAt field. Requires GitHub comment timestamps. Matches DATA-05 requirement. False positives if clocks skewed. | ✓ |
| Content hash comparison | Hash annotation content (text + images) at last sync, compare to current. Conflict if both hashes changed. More accurate — detects actual changes, not just timestamps. Requires storing previous content hashes. Heavier storage. | |
| No automatic detection | User manually resolves on sync. Show all GitHub comments and local annotations, let user choose which to keep. Simplest implementation but worst UX. Puts burden on user to spot duplicates/conflicts. | |

**User's choice:** Compare timestamps (Recommended)
**Notes:** Simple, works with existing fields, acceptable accuracy.

---

### Conflict Resolution

| Option | Description | Selected |
|--------|-------------|----------|
| Prompt user | Show conflict UI: 'This annotation changed in both places. Keep local version, GitHub version, or merge?' User chooses. Safest, gives user control. Blocks sync until resolved. Standard conflict resolution UX. | ✓ |
| Last write wins (GitHub) | GitHub version always wins on conflict. Simpler — no UI needed. Matches 'GitHub is source of truth' model for review-heavy workflow. Risk: user loses local changes if they annotated offline. | |
| Create duplicate annotations | Import GitHub comment as new annotation alongside existing local one. No data loss, user can manually merge later. Cluttered UI with duplicates. Defer resolution but don't force it. | |

**User's choice:** Prompt user (Recommended)
**Notes:** User control, safest approach, standard conflict UX.

---

### Sync Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Incremental (only changed) | Sync only new/modified annotations since last sync. Faster, fewer GitHub API calls (rate limit friendly). Requires tracking which annotations changed. More complex logic but better UX for large plans with many annotations. | ✓ |
| Full sync always | Every sync operation processes all annotations. Simpler logic, no change tracking needed. Slower for large plans. More GitHub API calls. Idempotent — same result regardless of sync history. Easier to implement and debug. | |
| User chooses per sync | Offer both options in UI: 'Sync all' vs 'Sync changes only'. Flexible but more complex UI. Good for debugging (full sync to fix issues) vs normal use (incremental). | |

**User's choice:** Incremental (only changed) (Recommended)
**Notes:** Better UX for large plans, rate limit friendly.

---

## Claude's Discretion

- SHA-256 truncation length (12 vs 16 chars)
- KV key naming conventions (prefix structure)
- Conflict UI design (modal vs sidebar vs inline)
- Error handling for hash generation failures
- Retry logic for KV write failures
