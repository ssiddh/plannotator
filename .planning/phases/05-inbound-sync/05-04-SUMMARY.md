---
phase: 05-inbound-sync
plan: "04"
subsystem: ui
tags: [react, github-sync, toolbar, toast, vite-aliases]

# Dependency graph
requires:
  - phase: 05-inbound-sync
    provides: "useGitHubPRSync hook, SyncButton component, GitHubProvider, AnnotationPanel threaded display"
provides:
  - "End-to-end wiring: SyncButton in toolbar triggers GitHub PR comment sync"
  - "Toast notifications for sync success, rate limit, token expiry, and network errors"
  - "Vite alias fix enabling subpath imports from @plannotator/github/client"
affects: [06-outbound-sync, ui, build]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Vite alias directory mapping for monorepo subpath imports"]

key-files:
  created: []
  modified:
    - packages/editor/App.tsx
    - apps/hook/vite.config.ts
    - apps/portal/vite.config.ts

key-decisions:
  - "SyncButton calls syncFromGitHub directly from hook (not via GitHubProvider registerSyncAction) because App.tsx renders GitHubProvider and cannot consume its context"
  - "Vite alias @plannotator/github/client changed from single-file to directory mapping to support subpath imports"

patterns-established:
  - "Vite alias pattern: use directory aliases with specific file aliases for default exports"

requirements-completed: [SYNC-IN-01]

# Metrics
duration: 6min
completed: 2026-04-03
---

# Phase 5 Plan 04: Wiring + Integration in Editor App.tsx Summary

**Wired useGitHubPRSync hook with SyncButton in toolbar, toast notifications, and Vite alias fix for github/client subpath imports**

## Performance

- **Duration:** 6 min
- **Started:** 2026-04-03T03:10:32Z
- **Completed:** 2026-04-03T03:16:32Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Wired the full-featured useGitHubPRSync hook from @plannotator/github/client with isSyncing, newCommentCount, syncFromGitHub, onSyncComplete, and onError callbacks
- Added SyncButton to the toolbar (visible when GitHub token and PR metadata exist) with spinner and badge
- Added toast messages for sync success ("Synced N comments from GitHub"), token expiry, rate limits, and network errors
- Fixed Vite aliases to support subpath imports from @plannotator/github/client directory

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire useGitHubPRSync hook and SyncButton in App.tsx** - `b15c913` (feat)
2. **Task 2: Build verification and Vite alias fix** - `51eacbd` (fix)

## Files Created/Modified
- `packages/editor/App.tsx` - Wired sync hook, SyncButton in toolbar, annotation merging, toast callbacks
- `apps/hook/vite.config.ts` - Fixed @plannotator/github/client alias to directory mapping
- `apps/portal/vite.config.ts` - Same alias fix for portal build

## Decisions Made
- SyncButton calls syncFromGitHub directly from the hook rather than through GitHubProvider registerSyncAction, because App.tsx renders GitHubProvider as a parent and cannot consume its own context. The registerSyncAction pattern remains available for child components.
- Changed Vite alias `@plannotator/github/client` from pointing to a single file (GitHubProvider.tsx) to the directory, with a separate `@plannotator/github/client/GitHubProvider` alias for the specific file import. This enables importing other modules from the client directory.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed Vite alias for github/client subpath imports**
- **Found during:** Task 2 (Build verification)
- **Issue:** `@plannotator/github/client` alias pointed to a single file (GitHubProvider.tsx), causing imports of `@plannotator/github/client/useGitHubPRSync` to fail with ENOTDIR
- **Fix:** Changed alias to point to the directory, added specific alias for GitHubProvider file, updated import paths
- **Files modified:** apps/hook/vite.config.ts, apps/portal/vite.config.ts, packages/editor/App.tsx
- **Verification:** `bun run build:hook` compiles successfully (2779 modules)
- **Committed in:** 51eacbd

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary fix for the import path to resolve correctly. No scope creep.

## Issues Encountered
- The `cp ../review/dist/index.html dist/review.html` step in build:hook fails because the review app hasn't been built in this worktree. This is unrelated to our changes -- the Vite build itself completes successfully.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Inbound sync fully wired end-to-end: button click -> server fetch with pagination -> deduplication -> thread tree -> annotation display
- Ready for Phase 6 (outbound sync) which will use the same GitHubProvider and toolbar patterns
- The syncToGitHub placeholder in GitHubProvider is ready for Phase 6 implementation

## Self-Check: PASSED

---
*Phase: 05-inbound-sync*
*Completed: 2026-04-03*
