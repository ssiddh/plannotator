---
phase: 06-outbound-sync
plan: 03
subsystem: ui
tags: [react, github-sync, toolbar, toast, outbound-sync]

# Dependency graph
requires:
  - phase: 06-02
    provides: useGitHubOutboundSync hook and POST /api/pr/{pasteId}/sync/outbound endpoint
  - phase: 05-03
    provides: SyncButton component and AnnotationPanel with thread support
provides:
  - OutboundSyncButton component with upload icon, badge, and disabled state
  - Full App.tsx wiring for outbound sync — hook, button, toasts, error handling
affects: [06-outbound-sync, 07-thread-resolution]

# Tech tracking
tech-stack:
  added: []
  patterns: [outbound-sync-button-mirrors-inbound, handleOutboundSync-filters-github-pr-annotations, syncedAnnotationIds-tracking-for-badge]

key-files:
  created: []
  modified:
    - packages/ui/components/ToolbarButtons.tsx
    - packages/editor/App.tsx

key-decisions:
  - "OutboundSyncButton always visible when githubToken exists (D-10: disabled when no PR for discoverability)"
  - "handleOutboundSync filters source:'github-pr' annotations to avoid re-syncing inbound comments"
  - "syncedAnnotationIds Set tracks which annotations have been pushed for badge count accuracy"
  - "Error toast with Retry action persists without auto-dismiss per D-21"

patterns-established:
  - "Outbound button mirrors inbound SyncButton styling and structure"
  - "Toast cascading: success first, warnings after 2s delay, drift warning after 4s"

requirements-completed: [SYNC-OUT-01, SYNC-OUT-04, SYNC-OUT-05, SYNC-OUT-08]

# Metrics
duration: 3min
completed: 2026-04-08
---

# Phase 6 Plan 3: Outbound Sync UI & Wiring Summary

**OutboundSyncButton with upload icon and badge wired in App.tsx with full toast notifications, drift warning, and error handling for push-to-GitHub flow**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-08T21:36:32Z
- **Completed:** 2026-04-08T21:39:50Z
- **Tasks:** 2 (of 3; Task 3 is human-verify checkpoint)
- **Files modified:** 2

## Accomplishments
- OutboundSyncButton component with upload arrow SVG, "Push" label, badge (9+ for 10+), and disabled state
- Full App.tsx integration: useGitHubOutboundSync hook with onSyncComplete/onError callbacks
- Toast notifications matching D-20 copywriting (new/updated/already-synced), D-07 (images), D-19 (globals), D-05 (drift)
- Error handling: token_expired clears token (D-14), rate_limit shows reset time (D-13), network error with Retry button (D-21)
- Badge tracks unsynced count via syncedAnnotationIds state, excluding github-pr and GLOBAL_COMMENT annotations

## Task Commits

Each task was committed atomically:

1. **Task 1: Add OutboundSyncButton component to ToolbarButtons.tsx** - `86159e7` (feat)
2. **Task 2: Wire outbound sync in App.tsx** - `8f08060` (feat)
3. **Task 3: Verify outbound sync end-to-end** - checkpoint:human-verify (pending)

## Files Created/Modified
- `packages/ui/components/ToolbarButtons.tsx` - Added OutboundSyncButton component with upload icon, badge, disabled/loading states
- `packages/editor/App.tsx` - Imported and wired useGitHubOutboundSync hook, handleOutboundSync handler, unsyncedCount computation, OutboundSyncButton in toolbar

## Decisions Made
- OutboundSyncButton visible when githubToken exists even without PR (disabled state for discoverability per D-10)
- handleOutboundSync filters out github-pr source annotations to avoid circular syncing
- syncedAnnotationIds tracks pushed annotations via a Set for accurate badge count
- Error toast (network) persists without auto-dismiss, includes Retry action per D-21
- Toast cascading: success -> warnings (2s delay) -> drift (4s delay) to avoid overwriting

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Plan 06-02 was executed on a parallel worktree branch; needed to merge that branch before proceeding. Resolved by merging worktree-agent-a0c33ae4.

## Known Stubs

None - all data sources are wired to live hook results.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Outbound sync UI complete pending human verification (Task 3 checkpoint)
- Ready for Phase 7 (thread resolution) after verification

---
*Phase: 06-outbound-sync*
*Completed: 2026-04-08*
