# Phase 3: Data Model & Sync Infrastructure - Research

**Researched:** 2026-04-02
**Domain:** Deterministic ID generation, bidirectional mapping, sync state, conflict detection
**Confidence:** HIGH

## Summary

Phase 3 builds the foundational data layer for bidirectional sync between Plannotator and GitHub. The phase is entirely about data structures and pure functions -- no UI, no API endpoints, no network calls. All five requirements (DATA-01 through DATA-05) can be satisfied with pure TypeScript modules, SHA-256 hashing (already used in the codebase), and the existing KV storage pattern from Phase 2.

The codebase already has the critical building blocks: `Block.startLine` for line mapping, `mapLineToBlock()` for reverse mapping, `sha256()` in middleware.ts, and KV key-value patterns with TTL. The main work is: (1) replacing ephemeral IDs with content-based hashes, (2) creating a sync mapping module for KV, (3) adding sync state tracking, and (4) implementing timestamp-based conflict detection.

**Primary recommendation:** Build four focused modules -- `generateStableId()` in shared utils, `syncMappings.ts` for KV operations, extend `PRMetadata` with `planHash`, and add conflict detection logic. All are pure functions testable without mocking.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Annotation IDs use content-based SHA-256 hash (truncated to 12-16 chars), deterministic from `blockId + originalText`
- **D-02:** Collision handling via sequence suffix (`-1`, `-2`, etc.)
- **D-03:** Hash input excludes exact character offsets (only `blockId + originalText`)
- **D-04:** Mappings stored in server-side KV (Cloudflare Workers KV or in-memory Map)
- **D-05:** Bidirectional pair storage: `sync:{pasteId}:ann:{annotationId}` and `sync:{pasteId}:gh:{commentId}`
- **D-06:** Mapping TTL matches paste expiry
- **D-07:** Use `block.startLine` directly for outbound sync
- **D-08:** Line drift detected via plan markdown hash comparison (SHA-256, stored in `PRMetadata.planHash`)
- **D-09:** Drift handling: warn but allow sync (non-blocking)
- **D-10:** Per-paste sync metadata in KV: `sync:{pasteId}:state` with `lastSyncTimestamp` and `lastSyncDirection`
- **D-11:** Conflict detection via timestamp comparison (both sides modified since last sync)
- **D-12:** Conflict resolution: prompt user to choose (Keep local / Keep GitHub / Merge manually)
- **D-13:** Incremental sync (only changed annotations since `lastSyncTimestamp`)

### Claude's Discretion
- SHA-256 truncation length (12 vs 16 chars) -- balance readability vs collision risk
- KV key naming conventions (prefix structure)
- Conflict UI design (modal vs sidebar vs inline)
- Error handling for hash generation failures
- Retry logic for KV write failures

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DATA-01 | Annotation IDs use stable generation (not ephemeral timestamps) | `generateStableId()` using SHA-256 of `blockId + originalText`, replacing current `source.id` from web-highlighter and `Date.now()` patterns |
| DATA-02 | Bidirectional ID mapping stored (Plannotator annotation ID <-> GitHub comment ID) | `syncMappings.ts` module with dual KV keys per D-05, reusing existing KV patterns from middleware.ts |
| DATA-03 | Line mapping reversible (markdown line -> block ID + offset) | Already implemented: `mapLineToBlock()` in lineMapper.ts handles line->block; `block.startLine` handles block->line |
| DATA-04 | Sync metadata tracks last sync timestamp and direction | `SyncState` type + KV storage at `sync:{pasteId}:state` per D-10 |
| DATA-05 | Conflict detection when both sides modified same annotation | Timestamp comparison per D-11: `annotation.createdA > lastSyncTimestamp AND comment.updated_at > lastSyncTimestamp` |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Bun runtime (not Node.js) -- use `bun:test` for testing
- All GitHub integration code lives in `packages/github/` (ARCH-01)
- Upstream file changes limited to single context wrapper (ARCH-02) -- minimize changes to `packages/ui/`
- Plugin architecture must minimize fork diff
- Two server runtimes (Bun server + Pi server) -- shared logic in `packages/shared/`
- KV typed as `any` to avoid Cloudflare Workers dependency (decision from Phase 1)
- Build order matters: changes to `packages/ui/` require rebuild sequence

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Web Crypto API | built-in | SHA-256 hashing for stable IDs | Already used in middleware.ts; available in both browser and Bun |
| bun:test | built-in | Unit testing | Already used across all `packages/github/server/*.test.ts` files |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @plannotator/web-highlighter | existing | Text selection + highlight IDs | Annotation creation; must override its auto-generated ID |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| SHA-256 | nanoid | nanoid is random not deterministic -- violates D-01 |
| KV storage | localStorage | Device-locked, quota limits -- violates D-04 |
| Timestamp conflict | Vector clocks | Overkill for 2-party sync; timestamps sufficient per D-11 |

## Architecture Patterns

### Recommended Module Structure
```
packages/
├── github/
│   ├── shared/
│   │   ├── types.ts              # Extend PRMetadata, add SyncState + SyncMapping types
│   │   └── stableId.ts           # generateStableId() -- shared between client + server
│   ├── server/
│   │   ├── syncMappings.ts       # KV operations for bidirectional ID mapping
│   │   └── syncState.ts          # KV operations for sync state + conflict detection
│   └── client/
│       └── lineMapper.ts         # Already exists -- no changes needed
└── ui/
    └── hooks/
        └── useAnnotationHighlighter.ts  # Minimal change: override web-highlighter ID
```

### Pattern 1: Content-Based Deterministic ID
**What:** Generate annotation IDs from a SHA-256 hash of `blockId + originalText`
**When to use:** Every annotation creation (replaces `source.id` from web-highlighter)
**Example:**
```typescript
// packages/github/shared/stableId.ts
export async function generateStableId(blockId: string, originalText: string): Promise<string> {
  const input = `${blockId}:${originalText}`;
  const msgBuffer = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hex.slice(0, 12); // 12 hex chars = 48 bits = ~281 trillion combinations
}

export function resolveCollision(baseId: string, existingIds: Set<string>): string {
  if (!existingIds.has(baseId)) return baseId;
  let suffix = 1;
  while (existingIds.has(`${baseId}-${suffix}`)) suffix++;
  return `${baseId}-${suffix}`;
}
```

### Pattern 2: Bidirectional KV Mapping
**What:** Store two KV entries per mapping for O(1) lookup in both directions
**When to use:** Every sync operation (inbound and outbound)
**Example:**
```typescript
// packages/github/server/syncMappings.ts
export async function setMapping(
  pasteId: string,
  annotationId: string,
  commentId: string,
  kv: any,
  ttlSeconds: number
): Promise<void> {
  await Promise.all([
    kv.put(`sync:${pasteId}:ann:${annotationId}`, commentId, { expirationTtl: ttlSeconds }),
    kv.put(`sync:${pasteId}:gh:${commentId}`, annotationId, { expirationTtl: ttlSeconds }),
  ]);
}
```

### Pattern 3: Timestamp-Based Conflict Detection
**What:** Compare annotation modification time and GitHub comment update time against last sync
**When to use:** During inbound sync to detect conflicts
**Example:**
```typescript
// packages/github/server/syncState.ts
export interface ConflictInfo {
  annotationId: string;
  commentId: string;
  localModifiedAt: number;
  remoteModifiedAt: number;
  lastSyncAt: number;
}

export function detectConflict(
  localModifiedAt: number,
  remoteModifiedAt: string, // ISO 8601 from GitHub
  lastSyncTimestamp: number
): boolean {
  const remoteMs = new Date(remoteModifiedAt).getTime();
  return localModifiedAt > lastSyncTimestamp && remoteMs > lastSyncTimestamp;
}
```

### Anti-Patterns to Avoid
- **Storing mapping in annotation object:** Annotations are client-side, lose data on page reload. Use server-side KV.
- **Using web-highlighter's auto-generated ID as stable ID:** It is session-ephemeral (random). Must override with content hash.
- **Coupling conflict resolution UI to data layer:** Phase 3 builds detection only. Resolution UI is a later concern (D-12 says "prompt user" but the UI is not in this phase's scope).
- **Modifying the `Annotation` type directly for sync fields:** Use separate mapping storage rather than extending the core type. Keeps plugin isolated per ARCH-02.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SHA-256 hashing | Custom hash function | `crypto.subtle.digest('SHA-256', ...)` | Already used in middleware.ts; cross-platform (browser + Bun) |
| Line-to-block mapping | Custom linear scan | Existing `mapLineToBlock()` in lineMapper.ts | Binary search, handles edge cases, tested |
| Block-to-line mapping | Custom reverse lookup | `block.startLine` field | Already populated by `parseMarkdownToBlocks()` |
| KV storage with TTL | Custom expiry logic | Cloudflare KV `expirationTtl` / FsPasteStore pattern | Proven patterns in paste-service stores |

## Common Pitfalls

### Pitfall 1: Async SHA-256 in Synchronous Contexts
**What goes wrong:** `crypto.subtle.digest()` returns a Promise. Annotation creation in `useAnnotationHighlighter` is synchronous (called from web-highlighter's `CREATE` event).
**Why it happens:** Web-highlighter fires synchronous events; the handler must return synchronously.
**How to avoid:** Pre-compute the stable ID asynchronously when the annotation is about to be created (e.g., on text selection), then use the cached hash in the synchronous callback. Alternatively, use a sync-compatible approach: generate a temporary ID in the CREATE handler, then replace it with the stable hash after await completes.
**Warning signs:** Annotation created with `undefined` or `[object Promise]` as ID.

### Pitfall 2: Collision Resolution Race Conditions
**What goes wrong:** Two annotations created simultaneously on the same text could both get the same base ID before either checks for collisions.
**Why it happens:** `generateStableId` is deterministic -- same input always produces same output.
**How to avoid:** Collision resolution must check against the current annotation set atomically. Since annotations are managed in React state (single-threaded), this is naturally safe in the browser. Server-side KV writes should use the dual-key pattern (both directions) atomically via `Promise.all`.
**Warning signs:** Duplicate annotation IDs in the annotation array.

### Pitfall 3: blockId Instability Across Plan Versions
**What goes wrong:** `blockId` is generated as `block-0`, `block-1`, etc. by the parser. If the plan changes (blocks added/removed), the same content gets a different `blockId`, changing the stable hash.
**Why it happens:** Parser uses a sequential counter, not content-based IDs for blocks.
**How to avoid:** This is an accepted tradeoff per D-03 (hash only `blockId + originalText`). The plan hash comparison (D-08) detects when the plan changed. Annotations on unchanged text in unchanged block positions will maintain stable IDs. Changed plans trigger drift warning.
**Warning signs:** Sync creates duplicate comments because the same text has a new annotation ID after plan edit.

### Pitfall 4: createdA Field Naming
**What goes wrong:** The Annotation type uses `createdA` (not `createdAt`) as the timestamp field.
**Why it happens:** Appears to be a typo baked into the type system (`createdA: number` on line 25 of types.ts).
**How to avoid:** Use `createdA` consistently. Do NOT assume `createdAt` -- always reference the actual type definition.
**Warning signs:** TypeScript compile errors about missing properties.

### Pitfall 5: GitHub API Timestamp Format
**What goes wrong:** Conflict detection compares local millisecond timestamps with GitHub ISO 8601 strings.
**Why it happens:** GitHub returns `"2026-04-01T12:00:00Z"` format; local annotations use `Date.now()` (milliseconds).
**How to avoid:** Always convert GitHub timestamps via `new Date(isoString).getTime()` before comparison.
**Warning signs:** Conflicts always detected or never detected due to type mismatch.

## Code Examples

### Existing SHA-256 Pattern (from middleware.ts)
```typescript
// Source: packages/github/server/middleware.ts lines 195-200
async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
```

### Existing KV Pattern (from middleware.ts)
```typescript
// Source: packages/github/server/middleware.ts lines 46-49
// Cache key pattern: prefix:hash
const cacheKey = `token:${await sha256(token)}`;
const cached = await kv.get(cacheKey, "json");
// Write with TTL:
await kv.put(cacheKey, JSON.stringify(user), { expirationTtl: TOKEN_CACHE_TTL_SECONDS });
```

### Current Annotation ID Generation (multiple locations)
```typescript
// Source: packages/ui/hooks/useAnnotationHighlighter.ts line 196
// web-highlighter generates source.id automatically (random/session-ephemeral)
const newAnnotation: Annotation = {
  id: source.id,  // <-- This must become stable hash
  // ...
};

// Source: packages/ui/components/Viewer.tsx line 405
id: `global-${Date.now()}`,  // <-- Global comments use timestamp

// Source: packages/ui/components/plan-diff/PlanCleanDiffView.tsx line 134
id: `diff-${now}-${index}`,  // <-- Diff annotations use timestamp + index
```

### Existing Line Mapper (already implemented)
```typescript
// Source: packages/github/client/lineMapper.ts
// Line -> Block: mapLineToBlock(lineNumber, blocks) -> blockId | null
// Block -> Line: block.startLine (direct field access)
// Bulk mapping: mapCommentsToBlocks(comments, blocks) -> Map<commentId, blockId>
```

### PRMetadata Extension Needed
```typescript
// Source: packages/github/shared/types.ts lines 40-45
// Current:
export interface PRMetadata {
  repo: string;
  pr_number: number;
  pr_url: string;
  created_at: string;
}
// Needs: planHash: string field for drift detection (D-08)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Random annotation IDs | Content-based SHA-256 hash IDs | This phase | Enables deduplication across sync cycles |
| No sync state | KV-persisted sync metadata | This phase | Enables incremental sync + conflict detection |
| One-way line mapping | Bidirectional line<->block mapping | Already exists | DATA-03 largely satisfied by existing code |

## Open Questions

1. **SHA-256 truncation: 12 vs 16 chars**
   - What we know: 12 hex chars = 48 bits (~281T combinations). 16 hex chars = 64 bits (~18 quintillion).
   - What's unclear: Expected annotation volume per paste (affects collision probability).
   - Recommendation: Use 12 chars. At 1000 annotations per paste, collision probability is ~1.8e-9 (negligible). Suffix collision handling (D-02) covers edge cases. Shorter is more readable in debug logs.

2. **web-highlighter ID override timing**
   - What we know: web-highlighter generates IDs synchronously in its CREATE event. SHA-256 is async.
   - What's unclear: Whether web-highlighter allows overriding the source.id before the CREATE callback fires.
   - Recommendation: Generate stable ID after CREATE fires using the `source.text` + resolved `blockId`, then update the annotation's ID. The annotation is added to React state after the callback, so there is a window to compute and replace. If timing is too tight, use a two-phase approach: temporary ID -> stable ID replacement before state commit.

3. **Global comments and diff annotations**
   - What we know: Global comments use `global-${Date.now()}`. Diff annotations use `diff-${now}-${index}`. Neither has `blockId` or `originalText` in the traditional sense.
   - What's unclear: Should these also use stable IDs?
   - Recommendation: Global comments can use `sha256("global:" + text)`. Diff annotations are ephemeral (only exist during diff view) and likely do not need stable IDs. Phase 3 should focus on regular text annotations; global comments are a stretch goal.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | bun:test (built-in) |
| Config file | none (Bun auto-discovers `*.test.ts` files) |
| Quick run command | `bun test packages/github/shared/ packages/github/server/syncMappings.test.ts packages/github/server/syncState.test.ts` |
| Full suite command | `bun test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DATA-01 | Stable ID generation (deterministic, collision handling) | unit | `bun test packages/github/shared/stableId.test.ts` | No -- Wave 0 |
| DATA-02 | Bidirectional mapping CRUD (set, get both directions, TTL) | unit | `bun test packages/github/server/syncMappings.test.ts` | No -- Wave 0 |
| DATA-03 | Line mapping reversible (line->block and block->line) | unit | `bun test packages/github/client/lineMapper.test.ts` | No -- Wave 0 (but lineMapper.ts exists and is tested implicitly) |
| DATA-04 | Sync state read/write (timestamp, direction) | unit | `bun test packages/github/server/syncState.test.ts` | No -- Wave 0 |
| DATA-05 | Conflict detection (both sides modified -> conflict) | unit | `bun test packages/github/server/syncState.test.ts` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `bun test packages/github/`
- **Per wave merge:** `bun test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/github/shared/stableId.test.ts` -- covers DATA-01 (deterministic output, collision resolution, async behavior)
- [ ] `packages/github/server/syncMappings.test.ts` -- covers DATA-02 (set/get both directions, missing mapping returns null)
- [ ] `packages/github/server/syncState.test.ts` -- covers DATA-04, DATA-05 (state persistence, conflict detection logic)
- [ ] Mock KV helper: in-memory Map implementing `get/put` with optional TTL for test isolation (follows pattern from existing middleware.test.ts which mocks `globalThis.fetch`)

## Sources

### Primary (HIGH confidence)
- `packages/github/server/middleware.ts` -- SHA-256 implementation, KV cache pattern, token validation
- `packages/github/shared/types.ts` -- PRMetadata, PRComment, PRStorageAdapter types
- `packages/github/client/lineMapper.ts` -- mapLineToBlock, mapCommentsToBlocks, findClosestBlocks
- `packages/github/client/useGitHubPRSync.ts` -- Current sync hook, ID generation pattern (`github-pr-${comment.id}`)
- `packages/ui/types.ts` -- Annotation type (note: `createdA` not `createdAt`), Block type with `startLine`
- `packages/ui/hooks/useAnnotationHighlighter.ts` -- Current annotation creation flow, web-highlighter integration
- `packages/ui/utils/parser.ts` -- `parseMarkdownToBlocks()`, Block ID generation (`block-${counter}`)
- `apps/paste-service/stores/kv.ts` -- KvPasteStore KV interface pattern
- `apps/paste-service/stores/fs.ts` -- FsPasteStore with TTL, PR metadata storage pattern

### Secondary (MEDIUM confidence)
- Web Crypto API docs (MDN) -- `crypto.subtle.digest()` is available in all modern runtimes including Bun

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in use in the codebase
- Architecture: HIGH -- follows established patterns from Phase 1 and Phase 2
- Pitfalls: HIGH -- identified from direct code inspection of annotation creation flow and type definitions

**Research date:** 2026-04-02
**Valid until:** 2026-05-02 (stable domain, no external dependency changes expected)
