---
phase: 05-inbound-sync
plan: "02"
subsystem: client
tags: [react-hooks, thread-tree, polling, page-visibility, exponential-backoff]

# Dependency graph
requires:
  - phase: 05-01
    provides: "InboundSyncResponse, PRCommentForClient types, server sync endpoint"
  - phase: 01-03
    provides: "GitHubProvider, lineMapper, useGitHubPRSync stub"
provides:
  - "buildThreadTree: flat comments to nested Annotation[] tree"
  - "formatGitHubTimestamp: locale-aware timestamp formatting"
  - "useGitHubPRSync: polling hook with retry, visibility API, thread building"
  - "GitHubProvider.registerSyncAction: wiring pattern for App.tsx"
affects: [05-03, 05-04, 06-outbound-sync]

# Tech tracking
tech-stack:
  added: []
  patterns: [registerSyncAction-pattern, page-visibility-polling, exponential-backoff-retry]

key-files:
  created:
    - packages/github/client/threadTree.ts
    - packages/github/client/threadTree.test.ts
  modified:
    - packages/github/client/useGitHubPRSync.ts
    - packages/github/client/GitHubProvider.tsx
    - packages/ui/types.ts

key-decisions:
  - "registerSyncAction pattern: App.tsx owns the sync hook (where blocks are available), provider holds the callable reference"
  - "Map keyed by githubCommentId for natural deduplication (Pitfall 5 client-side guard)"
  - "Depth clamped to 3 levels max defensively, though GitHub REST only gives 1 level of replies"

patterns-established:
  - "registerSyncAction: Provider holds callable ref, consumer registers via useEffect"
  - "Page Visibility polling: pause on hidden, immediate sync + restart on visible"

requirements-completed: [SYNC-IN-01, SYNC-IN-05, SYNC-IN-06]

# Metrics
duration: 5min
completed: 2026-04-02
---

# Phase 5 Plan 02: Client Hook Rewrite + Thread Tree Building Summary

**Thread tree builder with 12 passing tests, sync hook with 5-min Page Visibility polling, exponential backoff retry, and registerSyncAction pattern in GitHubProvider**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-03T02:56:11Z
- **Completed:** 2026-04-03T03:01:11Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments
- Thread tree building from flat PRCommentForClient[] to nested Annotation[] with parent-child grouping and chronological sorting
- Sync hook rewrite with Page Visibility API polling (5-min interval), exponential backoff retry (3x at 1s/2s/4s), and distinct handling for network/rate-limit/token-expired errors
- GitHubProvider registerSyncAction pattern enabling App.tsx to wire the hook's syncFromGitHub into the context

## Task Commits

Each task was committed atomically:

1. **Task 1: Create threadTree.ts + threadTree.test.ts** - `bcd3c2a` (feat)
2. **Task 2: Rewrite useGitHubPRSync hook** - `5a03487` (feat)
3. **Task 3: Implement syncFromGitHub in GitHubProvider** - `c5fa57c` (feat)

## Files Created/Modified
- `packages/github/client/threadTree.ts` - Thread tree building and timestamp formatting
- `packages/github/client/threadTree.test.ts` - 12 test cases for thread tree logic
- `packages/github/client/useGitHubPRSync.ts` - Sync hook with polling, retry, and thread building
- `packages/github/client/GitHubProvider.tsx` - registerSyncAction pattern for App.tsx wiring
- `packages/ui/types.ts` - Added children and githubCommentUrl fields to Annotation

## Decisions Made
- registerSyncAction pattern: App.tsx owns the sync hook (where blocks state is available), provider holds the callable reference. This avoids prop drilling and keeps the hook close to its data dependencies.
- Map keyed by githubCommentId for natural deduplication. If the server sends duplicate entries (Pitfall 5), the Map overwrites gracefully.
- Thread depth clamped to 3 levels max as defensive measure, though GitHub REST API only returns 1 level of replies in practice.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added @plannotator/ui as workspace dependency to github package**
- **Found during:** Task 1 (threadTree.test.ts)
- **Issue:** `@plannotator/ui/types` import failed because github package.json had no dependency on ui package
- **Fix:** Added `"@plannotator/ui": "workspace:*"` to github package.json dependencies and ran bun install
- **Files modified:** packages/github/package.json
- **Verification:** Tests pass, imports resolve correctly
- **Committed in:** bcd3c2a (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential for module resolution. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Thread tree builder and sync hook ready for UI integration (Plan 03/04)
- GitHubProvider registerSyncAction pattern ready for App.tsx wiring
- All 12 thread tree tests passing as regression safety net

---
*Phase: 05-inbound-sync*
*Completed: 2026-04-02*
