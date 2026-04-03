---
phase: 05-inbound-sync
plan: "03"
subsystem: ui
tags: [react, github, annotations, threading, sync-button]

requires:
  - phase: 05-inbound-sync
    provides: "Annotation type with children, githubCommentUrl fields (05-01), sync hook + provider (05-02)"
provides:
  - "SyncButton component export in ToolbarButtons.tsx"
  - "Threaded GitHub annotation rendering in AnnotationPanel.tsx"
  - "formatAbsoluteTimestamp helper for GitHub timestamps"
affects: [05-04, outbound-sync]

tech-stack:
  added: []
  patterns: ["Recursive AnnotationCard with depth prop for threaded rendering", "GitHub author row with avatar fallback initials pattern"]

key-files:
  created: []
  modified:
    - packages/ui/components/ToolbarButtons.tsx
    - packages/ui/components/AnnotationPanel.tsx
    - packages/ui/components/AnnotationPanel.test.tsx

key-decisions:
  - "Avatar stored as first image in annotation.images -- skip images section for github-pr source"
  - "Depth capped at 3 via Math.min for recursive child rendering"
  - "Structural source-code tests for AnnotationPanel (no DOM renderer configured)"

patterns-established:
  - "GitHub author row: avatar + clickable username + absolute timestamp + GitHub icon"
  - "Read-only guard: annotation.source !== 'github-pr' gates edit/delete buttons"
  - "Recursive AnnotationCard: onSelectById/onDeleteById/onEditById props for child callbacks"

requirements-completed: [SYNC-IN-07]

duration: 3min
completed: 2026-04-03
---

# Phase 5 Plan 03: UI Components -- Sync Button + Threaded Annotation Panel Summary

**SyncButton with disabled/loading/badge states and threaded GitHub annotation rendering with 24px avatars, clickable usernames, absolute timestamps, and recursive indented replies**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-03T03:05:46Z
- **Completed:** 2026-04-03T03:08:33Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- SyncButton component with disabled tooltip, loading spinner, and count badge (1-9 or 9+)
- GitHub annotation author row with 24px avatar, fallback initials, clickable username opening GitHub, absolute timestamp, and GitHub icon
- Read-only guard hiding edit/delete buttons for GitHub-sourced annotations
- Recursive threaded reply rendering with left border indentation, depth capped at 3

## Task Commits

Each task was committed atomically:

1. **Task 1: Add SyncButton to ToolbarButtons.tsx** - `b7d5f7c` (feat)
2. **Task 2: Extend AnnotationPanel for threaded GitHub annotations** - `b6ccf2d` (feat)

## Files Created/Modified
- `packages/ui/components/ToolbarButtons.tsx` - Added SyncButton export with disabled/loading/badge states
- `packages/ui/components/AnnotationPanel.tsx` - GitHub author row, read-only guard, threaded children, formatAbsoluteTimestamp
- `packages/ui/components/AnnotationPanel.test.tsx` - Structural tests validating key patterns

## Decisions Made
- Avatar is the first image in annotation.images for GitHub annotations; images section skipped to avoid showing avatar as attachment
- Depth capped at 3 levels via Math.min for defensive threading depth limit
- Used structural (source code pattern matching) tests since no DOM renderer is configured in the test environment

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Replaced stub test with structural tests**
- **Found during:** Task 2 (verification step)
- **Issue:** AnnotationPanel.test.tsx contained a placeholder `throw new Error("Not implemented")` that failed on run
- **Fix:** Wrote 10 structural tests that validate key patterns in the component source code
- **Files modified:** packages/ui/components/AnnotationPanel.test.tsx
- **Verification:** All 10 tests pass with 14 expect() calls
- **Committed in:** b6ccf2d (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Test stub replaced with real structural assertions. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all components are fully wired with proper props and rendering logic.

## Next Phase Readiness
- SyncButton ready to be wired into toolbar by consuming component (App.tsx or similar)
- AnnotationPanel ready to render GitHub-sourced annotations with children arrays
- Plan 05-04 (integration wiring) can proceed

---
*Phase: 05-inbound-sync*
*Completed: 2026-04-03*
