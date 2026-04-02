---
phase: 01-plugin-architecture
plan: 04
subsystem: build
tags: [vite, react, monorepo, peer-dependencies, rollup]

# Dependency graph
requires:
  - phase: 01-plugin-architecture (01-03)
    provides: GitHubProvider.tsx wired into App.tsx, Vite aliases configured
provides:
  - Working hook build that bundles GitHubProvider into single-file HTML
  - Verified upstream modification surface documentation
affects: [02-auth-flow, distribution, all future phases requiring hook build]

# Tech tracking
tech-stack:
  added: []
  patterns: [resolve.dedupe for monorepo peer dependencies in Vite]

key-files:
  created: []
  modified:
    - apps/hook/vite.config.ts
    - apps/hook/package.json

key-decisions:
  - "resolve.dedupe for react/react-dom is the standard Vite monorepo fix for peer dependency resolution across workspace packages"
  - "UI files (ExportModal, useSharing, sharing) confirmed NOT modified by Phase 1 -- VERIFICATION report was incorrect on this point"
  - "Paste-service modifications are architectural necessities for middleware composition (ARCH-03), not deviations from ARCH-02"

patterns-established:
  - "Vite dedupe pattern: workspace packages with React peer deps require resolve.dedupe in consuming app's vite config"

requirements-completed: [ARCH-01, ARCH-02, ARCH-03, ARCH-04, ARCH-05]

# Metrics
duration: 2min
completed: 2026-04-02
---

# Phase 01 Plan 04: Build Fix and Upstream Verification Summary

**Fixed hook build React resolution via Vite dedupe and verified upstream modification surface is minimal and architecturally necessary**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-02T00:13:12Z
- **Completed:** 2026-04-02T00:15:00Z
- **Tasks:** 2
- **Files modified:** 3 (vite.config.ts, package.json, bun.lock)

## Accomplishments
- Hook build (`bun run build:hook`) now succeeds, producing 7.6MB single-file HTML with GitHubProvider bundled
- Review build confirmed unaffected (no regression)
- UI files (ExportModal, useSharing, sharing) confirmed NOT modified by Phase 1 -- corrects VERIFICATION report misattribution
- Upstream modification surface documented: only App.tsx (semantic), paste-service (middleware composition), and vite configs (build tooling)

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix React resolution for @plannotator/github in hook build** - `dfcb861` (fix)
2. **Task 2: Verify upstream modification surface is acceptable** - No commit (verification-only task, no code changes)

## Files Created/Modified
- `apps/hook/vite.config.ts` - Added `resolve.dedupe: ['react', 'react-dom']` for monorepo peer dep resolution
- `apps/hook/package.json` - Added `@plannotator/github: "workspace:*"` to dependencies
- `bun.lock` - Updated with new workspace dependency link

## Decisions Made
- **Vite dedupe over rollup externals:** The hook build bundles React (not external) since it produces a single-file HTML. `resolve.dedupe` tells Vite to resolve React from one location regardless of import origin. This is the standard Vite monorepo solution.
- **UI files misattribution clarified:** The VERIFICATION report incorrectly listed ExportModal.tsx, useSharing.ts, and sharing.ts as Phase 1 changes. Git diff confirms 0 lines changed in these files between 8d231c2..HEAD.
- **Paste-service changes are ARCH-03 requirements:** The middleware composition pattern inherently requires the host service to accept middleware. These are structural changes, not deviations from ARCH-02.

## Deviations from Plan

None - plan executed exactly as written. Change 3 (broadening the alias) was not needed since Changes 1+2 resolved the build.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Upstream Modification Surface (Phase 1 Total)

Files changed outside `packages/github/` during Phase 1 (verified via `git diff 8d231c2..HEAD`):

| File | Category | Necessity |
|------|----------|-----------|
| `packages/editor/App.tsx` | Semantic (context wrapper) | Required by ARCH-02 |
| `apps/paste-service/core/handler.ts` | Middleware composition | Required by ARCH-03 |
| `apps/paste-service/auth/types.ts` | Type re-export | Required by ARCH-03 |
| `apps/paste-service/targets/bun.ts` | Target middleware setup | Required by ARCH-03 |
| `apps/paste-service/targets/cloudflare.ts` | Target middleware setup | Required by ARCH-03 |
| `apps/hook/vite.config.ts` | Build tooling | Required for build |
| `apps/hook/package.json` | Build tooling | Required for build |
| `apps/portal/vite.config.ts` | Build tooling | Required for build |

**NOT modified (correcting VERIFICATION report):**
- `packages/ui/components/ExportModal.tsx`
- `packages/ui/hooks/useSharing.ts`
- `packages/ui/utils/sharing.ts`

## Next Phase Readiness
- Hook build working -- plugin can be distributed
- All ARCH requirements satisfiable (ARCH-02 partial status in VERIFICATION is due to paste-service changes being architectural necessities, not true deviations)
- Ready for Phase 02 (auth flow) which will populate GitHubProvider stubs

## Self-Check: PASSED

- [x] apps/hook/vite.config.ts exists and contains dedupe
- [x] apps/hook/package.json exists and contains @plannotator/github
- [x] 01-04-SUMMARY.md created
- [x] Commit dfcb861 found in git log
- [x] Hook build exits 0
- [x] Review build exits 0

---
*Phase: 01-plugin-architecture*
*Completed: 2026-04-02*
