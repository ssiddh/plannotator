---
phase: 06-outbound-sync
plan: 01
subsystem: sync
tags: [github-api, outbound-sync, batch-review, tdd, kv-mapping]

requires:
  - phase: 03-data-model
    provides: "syncMappings (getCommentId, setMapping), syncState (setSyncState), planHash (generatePlanHash)"
  - phase: 04-pr-creation-export
    provides: "mapAnnotationsToComments, submitBatchReview, ReviewComment, ExportAnnotation, ExportBlock"
  - phase: 05-inbound-sync
    provides: "fetchPRComments, githubRequest, PRMetadataWithSync, PRComment patterns"
provides:
  - "performOutboundSync() orchestration function for syncing annotations to GitHub"
  - "OutboundSyncResult type with syncedCount, editCount, skippedCount, warnings, hasDrift"
  - "classifyAnnotations() for categorizing annotations as new/edited/skipped"
affects: [06-outbound-sync, 07-thread-resolution]

tech-stack:
  added: []
  patterns: [dependency-injection-for-testing, comment-id-recovery-via-review-api, review-prefix-stripping]

key-files:
  created:
    - packages/github/server/outboundSync.ts
    - packages/github/server/outboundSync.test.ts
  modified: []

key-decisions:
  - "Positional matching for comment ID recovery: match review response comments to submitted annotations by array index (submission order) when (path, line, body) matching is ambiguous"
  - "Edit comparison uses expected body format: DELETION annotations compared as suggestion blocks, COMMENT annotations compared as plain text"
  - "GLOBAL_COMMENT annotations fully filtered (not posted), reported via warnings array"

patterns-established:
  - "Outbound sync DI pattern: options parameter with fetchFn, githubRequestFn, submitBatchReviewFn, generatePlanHashFn for test injection"
  - "Comment ID prefix stripping: review_NNN -> NNN for reply endpoint"

requirements-completed: [SYNC-OUT-01, SYNC-OUT-02, SYNC-OUT-03, SYNC-OUT-04, SYNC-OUT-05, SYNC-OUT-06, SYNC-OUT-07, SYNC-OUT-08]

duration: 3min
completed: 2026-04-08
---

# Phase 06 Plan 01: Outbound Sync Core Logic Summary

**TDD-built outbound sync with annotation classification (new/edited/skipped), batch review posting, threaded edit replies with "Updated:" prefix, and comment ID recovery via review API**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-08T21:27:40Z
- **Completed:** 2026-04-08T21:30:18Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- performOutboundSync classifies annotations as new/edited/skipped via KV mapping and GitHub body comparison
- New annotations posted via submitBatchReview in a single batch (single GitHub notification)
- Edited annotations posted as threaded replies with "Updated:" prefix, stripping "review_" prefix for numeric comment ID
- Comment IDs recovered from review API response and stored in KV for future edit detection
- Drift detection compares current plan hash to prMetadata.planHash
- GLOBAL_COMMENT filtering and image-only warnings reported in result
- Full TDD: 10 test cases covering all behaviors, 120 total suite tests passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Red -- Write failing tests** - `b81f098` (test)
2. **Task 2: Green -- Implement performOutboundSync** - `5afd7f6` (feat)

_TDD plan: Red phase created failing tests, Green phase implemented minimal code to pass._

## Files Created/Modified
- `packages/github/server/outboundSync.ts` - Core outbound sync orchestration: classifyAnnotations + performOutboundSync
- `packages/github/server/outboundSync.test.ts` - 10 test cases covering all sync behaviors

## Decisions Made
- Positional matching for comment ID recovery: match review response comments to submitted annotations by array index when (path, line, body) matching is ambiguous
- Edit comparison uses expected body format: DELETION annotations compared as suggestion blocks, COMMENT as plain text
- GLOBAL_COMMENT annotations fully filtered (not posted), reported via warnings array

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- outboundSync.ts ready for handler integration (06-02: HTTP endpoint wiring)
- performOutboundSync accepts all dependencies via options parameter for easy integration
- classifyAnnotations exported separately for potential reuse in UI sync status display

---
## Self-Check: PASSED

All files exist, all commits verified.

*Phase: 06-outbound-sync*
*Completed: 2026-04-08*
