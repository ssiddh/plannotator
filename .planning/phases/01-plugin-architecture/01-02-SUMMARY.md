---
phase: 01-plugin-architecture
plan: 02
subsystem: api
tags: [middleware, composition, paste-service, github-plugin, refactoring]

# Dependency graph
requires:
  - phase: 01-plugin-architecture/01
    provides: "@plannotator/github package with server modules (handler, middleware, oauth, pr)"
provides:
  - "Paste-service handler with middleware composition pattern"
  - "Bun and Cloudflare targets composing GitHubHandler as middleware"
  - "auth/types.ts re-exporting from plugin (no type duplication)"
affects: [01-plugin-architecture/03, paste-service, cloudflare-worker]

# Tech tracking
tech-stack:
  added: []
  patterns: ["middleware composition via GitHubHandler[]", "PRStorageAdapter wrapper for store backends"]

key-files:
  created: []
  modified:
    - "apps/paste-service/core/handler.ts"
    - "apps/paste-service/auth/types.ts"
    - "apps/paste-service/targets/bun.ts"
    - "apps/paste-service/targets/cloudflare.ts"

key-decisions:
  - "Kept github_export in paste POST temporarily with plugin import, avoids breaking client"
  - "Kept PR metadata lookup in paste GET with TODO for phase-4 migration"
  - "PRStorageAdapter wraps existing store methods rather than requiring store interface changes"

patterns-established:
  - "Middleware composition: handler accepts GitHubHandler[] and tries each before own routes"
  - "Target responsibility: targets create GitHubHandler with config and storage adapter, pass as middleware"

requirements-completed: [ARCH-01, ARCH-04, ARCH-05]

# Metrics
duration: 2min
completed: 2026-04-01
---

# Phase 1 Plan 2: Paste-Service Middleware Composition Summary

**Refactored paste-service handler to delegate GitHub routes via middleware composition, removing 200+ lines of inlined OAuth/PR code**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-01T22:40:42Z
- **Completed:** 2026-04-01T22:43:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Replaced monolithic handler with middleware composition pattern (per D-01)
- Removed all inlined OAuth routes (login, callback, validate, refresh) and PR routes (create, comments) from handler.ts
- Updated both Bun and Cloudflare targets to create GitHubHandler and pass as middleware (per D-02)
- Made auth/types.ts a re-export from @plannotator/github/types (per D-09, no type duplication)

## Task Commits

Each task was committed atomically:

1. **Task 1: Refactor handler.ts to use middleware composition** - `b88f48b` (feat)
2. **Task 2: Update Bun and Cloudflare targets to compose GitHubHandler** - `501923c` (feat)

## Files Created/Modified
- `apps/paste-service/core/handler.ts` - Refactored: middleware param, plugin imports, removed OAuth/PR routes
- `apps/paste-service/auth/types.ts` - Now re-exports from @plannotator/github/types
- `apps/paste-service/targets/bun.ts` - Creates GitHubHandler with filesystem PRStorageAdapter
- `apps/paste-service/targets/cloudflare.ts` - Creates GitHubHandler with KV PRStorageAdapter

## Decisions Made
- Kept `github_export` logic in paste POST with import changed to `@plannotator/github/server/pr` -- removing it would break existing client code that combines paste creation with PR export
- Kept PR metadata lookup in paste GET route with `TODO(phase-4)` comment -- removing `github_pr` from response would break the client
- Created PRStorageAdapter inline wrappers in each target rather than modifying the PasteStore interface -- minimizes upstream diff

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None - all functionality is wired to real implementations.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Handler now uses middleware composition, ready for Plan 03 (portal UI integration)
- Both deployment targets pass GitHubHandler as middleware
- Plugin package types are the single source of truth

---
*Phase: 01-plugin-architecture*
*Completed: 2026-04-01*
