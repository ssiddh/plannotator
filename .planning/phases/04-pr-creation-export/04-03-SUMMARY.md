---
phase: 04-pr-creation-export
plan: 03
subsystem: ui
tags: [react, github-pr, export, toast, hooks]

# Dependency graph
requires:
  - phase: 04-01
    provides: server PR creation endpoints and plan hash utility
  - phase: 04-02
    provides: client export hook and GitHubProvider context
provides:
  - GitHub PR tab in ExportModal with full export flow
  - useGitHubPRExport hook encapsulating drift detection, image warning, and export orchestration
  - Toast notifications with action buttons (View PR, Retry)
  - Auto-paste-creation for PR export when no pasteId exists
affects: [04-pr-creation-export]

# Tech tracking
tech-stack:
  added: []
  patterns: [hook-based prop spreading, auto-paste-creation before PR export, toast action buttons]

key-files:
  created:
    - packages/ui/hooks/useGitHubPRExport.ts
  modified:
    - packages/ui/utils/callback.ts
    - packages/ui/components/ExportModal.tsx
    - packages/editor/App.tsx

key-decisions:
  - "useGitHubPRExport hook self-contained with local types to avoid coupling to @plannotator/github"
  - "Auto-create paste via paste service when pasteId is null (hook server mode has no /p/ URL)"
  - "doExport accepts effectivePasteId parameter for retry continuity"

patterns-established:
  - "Toast action pattern: ToastPayload.action with { label, onClick } for interactive notifications"
  - "Auto-paste creation: ensurePasteId() creates paste before PR export when not viewing a shared URL"

requirements-completed: [PR-01, PR-02, PR-03, PR-04, PR-05, PR-06]

# Metrics
duration: 12min
completed: 2026-04-02
---

# Phase 04 Plan 03: GitHub PR Tab and Export Flow Summary

**GitHub PR tab in ExportModal with one-click export, auto-paste creation, drift detection, and toast action buttons**

## Performance

- **Duration:** 12 min
- **Started:** 2026-04-02T23:48:42Z
- **Completed:** 2026-04-02T24:00:00Z
- **Tasks:** 4
- **Files modified:** 4

## Accomplishments
- GitHub PR tab in ExportModal with sign-in prompt, annotation count, drift warning, and export button
- Extended ToastPayload with optional action buttons for View PR / Retry workflows
- useGitHubPRExport hook encapsulates all export logic with minimal App.tsx surgery
- Fixed critical bug where export silently failed when no pasteId was available in hook server mode

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend ToastPayload and add GitHub PR tab to ExportModal** - `ba69975` (feat)
2. **Task 2: Create useGitHubPRExport hook** - `526a577` (feat)
3. **Task 3: Wire useGitHubPRExport hook and toast actions in App.tsx** - `c5d6df8` (feat)
4. **Task 4: Fix PR export button not working** - `9fe7b38` (fix)

## Files Created/Modified
- `packages/ui/utils/callback.ts` - Extended ToastPayload with optional action field
- `packages/ui/components/ExportModal.tsx` - Added GitHub PR tab with auth states, drift warning, export button
- `packages/ui/hooks/useGitHubPRExport.ts` - Custom hook for drift detection, image warning, auto-paste, and export orchestration
- `packages/editor/App.tsx` - Wired hook, spread props to ExportModal, toast action rendering

## Decisions Made
- useGitHubPRExport hook uses local type definitions (PRMetadataLike, ExportAnnotation, ExportBlock) to avoid direct dependency on @plannotator/github package
- Auto-paste creation added to ensurePasteId() so PR export works in hook server mode where no /p/ URL provides a pasteId
- doExport accepts effectivePasteId parameter to maintain paste ID through retry cycles

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed PR export button silently failing when pasteId is null**
- **Found during:** Task 4 (verification checkpoint)
- **Issue:** handleExportToPR returned early with `if (!pasteId || !markdown) return;` but in hook server mode there is no `/p/` URL so pasteId was always null. The existing authenticated sharing flow worked because it creates its own paste first.
- **Fix:** Added ensurePasteId() that creates a paste via the paste service API before calling doExport. Updated doExport to accept an effectivePasteId parameter for retry continuity. Updated handleExportToPR to show error toast when paste creation fails.
- **Files modified:** packages/ui/hooks/useGitHubPRExport.ts
- **Verification:** Build succeeds, button now creates paste then calls PR export endpoint
- **Committed in:** 9fe7b38

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential fix for the export to work in the primary use case (hook server mode). No scope creep.

## Issues Encountered
None beyond the bug fixed above.

## Known Stubs
None - all data paths are wired to real implementations.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All PR creation and export UI is complete
- Ready for inbound sync (Phase 05) and outbound sync (Phase 06)
- Drift detection, toast actions, and error handling patterns established for reuse

---
*Phase: 04-pr-creation-export*
*Completed: 2026-04-02*
