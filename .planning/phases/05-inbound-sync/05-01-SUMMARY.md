---
phase: 05-inbound-sync
plan: "01"
subsystem: api
tags: [github-api, pagination, kv, sync, deduplication]

requires:
  - phase: 03-data-model
    provides: sync mappings, sync state, stable IDs
  - phase: 04-pr-creation-export
    provides: PR metadata storage, fetchPRComments base implementation

provides:
  - Paginated GitHub comment fetching with error handling
  - Inbound sync orchestration with dedup and edit/delete detection
  - InboundSyncResponse and PRCommentForClient types
  - GET /api/pr/{pasteId}/sync/inbound endpoint

affects: [05-inbound-sync, 06-outbound-sync]

tech-stack:
  added: []
  patterns: [fetchAllPages pagination helper, processedCommentIds Set dedup guard, fetchFn injection for testability]

key-files:
  created:
    - packages/github/server/inboundSync.ts
    - packages/github/server/inboundSync.test.ts
  modified:
    - packages/ui/types.ts
    - packages/github/shared/types.ts
    - packages/github/server/pr.ts
    - packages/github/server/handler.ts

key-decisions:
  - "fetchAllPages uses raw fetch() instead of githubRequest() for header access (Link, rate limit)"
  - "performInboundSync accepts optional fetchFn parameter for test injection instead of module mocking"
  - "Timestamp stored per-comment in KV (sync:{pasteId}:ts:{commentId}) for edit detection"
  - "Imported list stored as JSON array in sync:{pasteId}:imported for deletion detection"

patterns-established:
  - "Pagination: fetchAllPages with Link header parsing and per-page error tracking"
  - "Dedup guard: processedCommentIds Set prevents duplicates within single sync operation"
  - "Error classification: token_expired (401), rate_limited:timestamp (403), failedPages for partial failures"

requirements-completed: [SYNC-IN-02, SYNC-IN-03, SYNC-IN-04, SYNC-IN-08, SYNC-IN-09]

duration: 3min
completed: 2026-04-03
---

# Phase 05 Plan 01: Type Extensions + Server-Side Inbound Sync Endpoint Summary

**Paginated GitHub comment fetching with KV dedup, edit/delete detection, and inbound sync endpoint returning categorized stats**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-03T02:47:49Z
- **Completed:** 2026-04-03T02:50:45Z
- **Tasks:** 5
- **Files modified:** 6

## Accomplishments
- Extended Annotation and PRComment types with threading, edit detection, and client response shapes
- Rewrote fetchPRComments with Link header pagination, 401/403 error handling, and incremental since parameter
- Created inboundSync.ts orchestration module with KV dedup, processedCommentIds Set guard, edit detection, and deletion tracking
- Added GET /api/pr/{pasteId}/sync/inbound route to handler with token validation and incremental sync
- 10 passing unit tests covering all sync scenarios including Pitfall 5 dedup guard

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend Annotation and PRComment types** - `85f2df2` (feat)
2. **Task 2: Add pagination to fetchPRComments** - `369547f` (feat)
3. **Task 3: Create inboundSync.ts server module** - `edddb6a` (feat)
4. **Task 4: Add inbound sync route to handler.ts** - `376a090` (feat)
5. **Task 5: Create inboundSync.test.ts** - `ef07ef5` (test)

## Files Created/Modified
- `packages/ui/types.ts` - Added children and githubCommentUrl to Annotation
- `packages/github/shared/types.ts` - Added updated_at, in_reply_to_id to PRComment; new InboundSyncResponse and PRCommentForClient types
- `packages/github/server/pr.ts` - Rewrote fetchPRComments with pagination, error handling, since parameter
- `packages/github/server/inboundSync.ts` - New sync orchestration module
- `packages/github/server/handler.ts` - New /sync/inbound route with token validation
- `packages/github/server/inboundSync.test.ts` - 10 unit tests

## Decisions Made
- fetchAllPages uses raw fetch() instead of githubRequest() for header access (Link, rate limit headers)
- performInboundSync accepts optional fetchFn parameter for test injection (avoids module mocking complexity)
- Per-comment timestamps stored in KV (sync:{pasteId}:ts:{commentId}) for edit detection
- Imported comment list stored as JSON array in sync:{pasteId}:imported for deletion detection

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Inbound sync endpoint ready for client-side hook integration (Plan 02)
- InboundSyncResponse type available for useInboundSync hook
- PRCommentForClient shape ready for annotation conversion

---
*Phase: 05-inbound-sync*
*Completed: 2026-04-03*
