---
phase: 07-thread-management-resolution
plan: 03
subsystem: ui
tags: [react, hooks, github-api, pr-review, export-modal]

# Dependency graph
requires:
  - phase: 07-01
    provides: submitBatchReview with event parameter, GraphQL thread resolution
provides:
  - useReview hook for PR review submission with auto-sync
  - Review tab in ExportModal with approve/request-changes/comment
  - /api/github/review server endpoint
affects: [07-04, review-workflow]

# Tech tracking
tech-stack:
  added: []
  patterns: [sync-then-submit flow in useReview, review endpoint routing in handler]

key-files:
  created:
    - packages/ui/hooks/useReview.ts
  modified:
    - packages/ui/components/ExportModal.tsx
    - packages/github/server/handler.ts

key-decisions:
  - "PR metadata repo field split into owner/repo at ExportModal level for useReview compatibility"
  - "Review endpoint submits with empty comments array (review-only, no line comments)"
  - "pendingCount approximates unsynced by filtering source !== github-pr and !isSummary"

patterns-established:
  - "useReview hook: sync-then-submit flow with ReviewState state machine (idle/syncing/submitting/success/error)"
  - "Review tab conditionally visible when ghPrMetadata is present"

requirements-completed: [THREAD-05, THREAD-06]

# Metrics
duration: 4min
completed: 2026-04-09
---

# Phase 7 Plan 3: Review Tab Summary

**PR review submission tab in ExportModal with approve/request-changes/comment buttons and auto-sync of unsynced annotations**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-09T01:22:59Z
- **Completed:** 2026-04-09T01:26:31Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- useReview hook with full sync-then-submit flow, ReviewState state machine, and granular error handling (401/403/422/429)
- Review tab in ExportModal with three color-coded action buttons matching GitHub terminology
- Server-side /api/github/review endpoint for review submission with auth validation

## Task Commits

Each task was committed atomically:

1. **Task 1: Create useReview hook** - `657ee9d` (feat)
2. **Task 2: Add Review tab to ExportModal** - `33efc66` (feat)

## Files Created/Modified
- `packages/ui/hooks/useReview.ts` - useReview hook with ReviewEvent/ReviewState types, sync-then-submit flow, pendingCount
- `packages/ui/components/ExportModal.tsx` - Review tab with approve/request-changes/comment buttons, body textarea, loading states
- `packages/github/server/handler.ts` - /api/github/review endpoint routing to submitBatchReview

## Decisions Made
- PR metadata repo field (owner/repo format) is split at the ExportModal level to create the owner/repo fields useReview expects
- Review endpoint submits with empty comments array since line comments are handled by outbound sync separately
- pendingCount is an approximation filtering by source and isSummary -- exact sync status depends on server-side KV mappings

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added /api/github/review server endpoint**
- **Found during:** Task 1 (useReview hook creation)
- **Issue:** The plan specifies useReview posts to /api/github/review but no server endpoint existed for this route
- **Fix:** Added review submission route in handler.ts that extracts/validates token, parses event/body/owner/repo/prNumber, and delegates to submitBatchReview
- **Files modified:** packages/github/server/handler.ts
- **Verification:** Route pattern matches, auth validation follows existing handler patterns
- **Committed in:** 657ee9d (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential server endpoint for the client hook to function. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Review tab complete, ready for end-to-end testing with a linked PR
- Plan 07-04 can proceed with summary annotation and thread resolution features

---
*Phase: 07-thread-management-resolution*
*Completed: 2026-04-09*
