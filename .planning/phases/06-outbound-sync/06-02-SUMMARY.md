---
phase: 06-outbound-sync
plan: 02
subsystem: api
tags: [github-api, react-hooks, outbound-sync, retry, error-handling]

# Dependency graph
requires:
  - phase: 06-outbound-sync/01
    provides: performOutboundSync server-side logic
  - phase: 05-inbound-sync
    provides: inbound sync handler and hook patterns
provides:
  - POST /api/pr/{pasteId}/sync/outbound handler route
  - useGitHubOutboundSync client hook with retry/error state
  - GitHubProvider registerOutboundSyncAction for App.tsx wiring
affects: [06-outbound-sync/03, ui-integration]

# Tech tracking
tech-stack:
  added: []
  patterns: [outbound-sync-handler, outbound-sync-hook, register-action-pattern]

key-files:
  created:
    - packages/github/client/useGitHubOutboundSync.ts
  modified:
    - packages/github/server/handler.ts
    - packages/github/client/GitHubProvider.tsx

key-decisions:
  - "Outbound sync route uses POST method (sends annotations/blocks/planMarkdown in body)"
  - "PRMetadataWithSync loaded via same 3-level fallback chain as inbound sync"
  - "401 handler clears localStorage token per D-14 pattern from useGitHubExport"
  - "No auto-retry on 401 or 429 -- user must manually retry"

patterns-established:
  - "registerOutboundSyncAction: same register pattern as registerSyncAction for inbound"
  - "Outbound hook is user-triggered only (no polling per D-08)"

requirements-completed: [SYNC-OUT-01, SYNC-OUT-02, SYNC-OUT-03, SYNC-OUT-04, SYNC-OUT-07]

# Metrics
duration: 2min
completed: 2026-04-08
---

# Phase 06 Plan 02: Outbound Sync Endpoint + Client Hook Summary

**POST outbound sync route with auth/metadata/body validation, React hook with 3x retry and exponential backoff, and GitHubProvider registration wiring**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-08T21:32:03Z
- **Completed:** 2026-04-08T21:34:30Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Server route POST /api/pr/{pasteId}/sync/outbound with full auth, metadata lookup, body parsing, and error mapping
- Client useGitHubOutboundSync hook with isSyncing/error/lastResult state and 3x retry with [1s, 2s, 4s] backoff
- GitHubProvider extended with registerOutboundSyncAction and syncToGitHub delegation

## Task Commits

Each task was committed atomically:

1. **Task 1: Add outbound sync route to handler.ts** - `29abecc` (feat)
2. **Task 2: Create useGitHubOutboundSync hook and extend GitHubProvider** - `75aaf4c` (feat)

## Files Created/Modified
- `packages/github/server/handler.ts` - Added PR_SYNC_OUTBOUND_PATTERN, performOutboundSync import, POST route with auth/metadata/body validation
- `packages/github/client/useGitHubOutboundSync.ts` - New hook: syncToGitHub(annotations, blocks, planMarkdown) with retry/error/loading state
- `packages/github/client/GitHubProvider.tsx` - Added registerOutboundSyncAction, outboundSyncAction state, syncToGitHub delegation

## Decisions Made
- Outbound sync route uses POST (sends body with annotations, blocks, planMarkdown) vs GET for inbound
- PRMetadataWithSync loaded via same 3-level fallback chain (sync:pasteId:pr -> storage -> pr:pasteId) as inbound
- 401 clears localStorage token per D-14 (same as useGitHubExport pattern)
- No auto-retry on 401 or 429 -- only network errors get 3x retry

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Endpoint and hook ready for Plan 03 (UI integration: SyncButton, toolbar wiring)
- App.tsx can now call registerOutboundSyncAction to wire the outbound hook

---
*Phase: 06-outbound-sync*
*Completed: 2026-04-08*
