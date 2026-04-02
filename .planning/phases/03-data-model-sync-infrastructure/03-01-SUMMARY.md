---
phase: 03-data-model-sync-infrastructure
plan: 01
subsystem: data-model
tags: [sha256, web-crypto, sync-types, copywriting]

# Dependency graph
requires:
  - phase: 01-plugin-architecture
    provides: PRMetadata, PRStorageAdapter types in packages/github/shared/types.ts
provides:
  - generateStableId for deterministic annotation-to-comment ID mapping
  - resolveCollision for handling duplicate annotations on same text
  - PRMetadataWithSync, SyncState, SyncMapping, ConflictInfo, ConflictResolution types
  - DRIFT_WARNING, CONFLICT_DIALOG, SYNC_EMPTY_STATE, SYNC_ERRORS copywriting constants
affects: [04-pr-creation-outbound, 05-inbound-sync, 06-outbound-sync, 07-thread-resolution]

# Tech tracking
tech-stack:
  added: []
  patterns: [Web Crypto SHA-256 for content-based hashing, collision resolution with sequential suffixes]

key-files:
  created:
    - packages/github/shared/stableId.ts
    - packages/github/shared/stableId.test.ts
    - packages/github/shared/copywriting.ts
  modified:
    - packages/github/shared/types.ts

key-decisions:
  - "12-char hex truncation of SHA-256 (48 bits) balances uniqueness with readability"
  - "PRMetadataWithSync extends PRMetadata (not modifying original) for backward compatibility"
  - "Copywriting constants use as const for type-safe literal types"

patterns-established:
  - "Stable ID: blockId + originalText hashed via SHA-256, truncated to 12 hex chars"
  - "Collision resolution: sequential -1, -2 suffix pattern"
  - "Sync types extend (not modify) existing interfaces"

requirements-completed: [DATA-01, DATA-03]

# Metrics
duration: 2min
completed: 2026-04-02
---

# Phase 3 Plan 1: Stable IDs, Sync Types, and Copywriting Summary

**SHA-256 content-based stable ID generation with collision resolution, sync infrastructure types, and UI copywriting constants**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-02T18:23:15Z
- **Completed:** 2026-04-02T18:24:52Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Deterministic 12-char hex ID generation from blockId + originalText using Web Crypto SHA-256
- Sequential collision resolution (-1, -2 suffixes) for duplicate annotations
- Full sync type system: PRMetadataWithSync, SyncState, SyncMapping, ConflictInfo, ConflictResolution
- UI copywriting constants matching 03-UI-SPEC.md contract verbatim

## Task Commits

Each task was committed atomically:

1. **Task 1: Stable ID generation module with tests (DATA-01)**
   - `6754dd6` (test) - RED: failing tests for generateStableId and resolveCollision
   - `e22142d` (feat) - GREEN: implement stable ID generation module
2. **Task 2: Extend shared types + add copywriting constants** - `a1c575b` (feat)

## Files Created/Modified
- `packages/github/shared/stableId.ts` - generateStableId and resolveCollision functions
- `packages/github/shared/stableId.test.ts` - 9 unit tests covering determinism, uniqueness, collisions
- `packages/github/shared/types.ts` - Added PRMetadataWithSync, SyncState, SyncMapping, ConflictInfo, ConflictResolution
- `packages/github/shared/copywriting.ts` - DRIFT_WARNING, CONFLICT_DIALOG, SYNC_EMPTY_STATE, SYNC_ERRORS constants

## Decisions Made
- 12-char hex truncation of SHA-256 (48 bits) balances uniqueness with readability
- PRMetadataWithSync extends PRMetadata (not modifying original) for backward compatibility
- Copywriting constants use `as const` for type-safe literal types

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Stable ID module ready for consumption by Plans 02 (sync engine modules)
- Sync types ready for import by PR creation (Phase 4), inbound sync (Phase 5), outbound sync (Phase 6)
- Copywriting constants ready for UI phases
- Existing line mapper (mapLineToBlock, block.startLine) confirmed to satisfy DATA-03 bidirectionally

## Self-Check: PASSED

- All 4 files exist on disk
- All 3 task commits found in git log (6754dd6, e22142d, a1c575b)

---
*Phase: 03-data-model-sync-infrastructure*
*Completed: 2026-04-02*
