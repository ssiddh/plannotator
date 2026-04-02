---
phase: 04-pr-creation-export
plan: 01
subsystem: api
tags: [github-api, sha256, pr-review, batch-review, kv-storage]

# Dependency graph
requires:
  - phase: 03-data-model-sync
    provides: "stableId SHA-256 pattern, syncMappings, syncState, PRMetadataWithSync type"
  - phase: 04-00
    provides: "Wave 0 test skeletons for export and handler tests"
provides:
  - "generatePlanHash: SHA-256 plan hash for drift detection"
  - "mapAnnotationsToComments: annotation-to-review-comment mapping"
  - "submitBatchReview: GitHub Reviews API batch submission"
  - "exportPlanWithAnnotations: full orchestration with rollback and KV persistence"
  - "GET /api/pr/:pasteId/metadata endpoint for stored PR info"
  - "Extended POST /api/pr/create with annotations support (backward compat with PR-01)"
affects: [04-02, 04-03, 05-inbound-sync, 06-outbound-sync]

# Tech tracking
tech-stack:
  added: []
  patterns: [batch-review-submission, annotation-to-comment-mapping, rollback-on-failure, kv-key-pattern-sync]

key-files:
  created:
    - packages/github/shared/planHash.ts
    - packages/github/server/export.ts
  modified:
    - packages/github/server/handler.ts
    - packages/github/server/handler.test.ts
    - packages/github/shared/planHash.test.ts
    - packages/github/server/export.test.ts

key-decisions:
  - "submitBatchReview omits comments field (not empty array) when no line comments, per GitHub API pitfall"
  - "Metadata endpoint is unauthenticated (public read) with fallback chain: sync:pasteId:pr -> storage adapter -> pr:pasteId"
  - "GLOBAL_COMMENT annotations collected into review body text, not submitted as line comments"

patterns-established:
  - "KV key pattern sync:{pasteId}:pr for extended PR metadata with plan hash"
  - "Rollback pattern: track createdResources array, reverse-iterate on failure"
  - "Handler branching: annotations+blocks present -> exportPlanWithAnnotations, else -> exportToPR"

requirements-completed: [PR-01, PR-02, PR-03, PR-04, PR-05, PR-06]

# Metrics
duration: 6min
completed: 2026-04-02
---

# Phase 04 Plan 01: Server Export Logic Summary

**Batch review submission with annotation-to-comment mapping, plan hash generation, rollback on failure, and metadata endpoint**

## Performance

- **Duration:** 6 min
- **Started:** 2026-04-02T20:27:31Z
- **Completed:** 2026-04-02T20:33:22Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments
- SHA-256 plan hash generation for drift detection (full 64-char hex)
- Annotation-to-comment mapping: COMMENT, DELETION (suggestion blocks), GLOBAL_COMMENT (review body)
- Batch review submission via GitHub Reviews API with single-notification pattern
- Full export orchestration with branch rollback on failure and KV persistence
- Handler extended with backward-compatible annotations support and new metadata endpoint
- 30 tests across export and handler covering all behavior items including PR-01 backward compat

## Task Commits

Each task was committed atomically:

1. **Task 1: planHash utility and mapAnnotationsToComments** - `1db87c7` (feat)
2. **Task 2: submitBatchReview and exportPlanWithAnnotations** - `427fd14` (feat)
3. **Task 3: Handler annotations support and metadata endpoint** - `31423e5` (feat)

_TDD was used for Tasks 1 and 2 (RED/GREEN in single commits)_

## Files Created/Modified
- `packages/github/shared/planHash.ts` - SHA-256 plan hash generation (full 64-char hex)
- `packages/github/shared/planHash.test.ts` - 4 tests for planHash
- `packages/github/server/export.ts` - mapAnnotationsToComments, submitBatchReview, exportPlanWithAnnotations
- `packages/github/server/export.test.ts` - 15 tests for all export functions
- `packages/github/server/handler.ts` - Extended /api/pr/create + new /api/pr/:pasteId/metadata
- `packages/github/server/handler.test.ts` - 4 new tests (PR-01 compat, annotations path, metadata 200/404)

## Decisions Made
- submitBatchReview omits the `comments` field entirely when no line comments exist (empty array would fail GitHub API validation)
- Metadata endpoint is unauthenticated since PR info is public; uses fallback chain across key patterns for backward compat
- GLOBAL_COMMENT annotations are collected into the review body text rather than becoming line comments

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Server export infrastructure complete, ready for Plans 02-03 (client hook and UI)
- exportPlanWithAnnotations is the main entry point for Plan 02's useGitHubExport hook
- Metadata endpoint available for Plan 03's PR status display

---
*Phase: 04-pr-creation-export*
*Completed: 2026-04-02*
