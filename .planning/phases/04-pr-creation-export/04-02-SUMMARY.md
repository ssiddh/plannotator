---
phase: 04-pr-creation-export
plan: 02
subsystem: api
tags: [react, hooks, github-api, export, retry, exponential-backoff]

# Dependency graph
requires:
  - phase: 03-data-model-sync
    provides: PRMetadataWithSync type, sync infrastructure types
  - phase: 02-auth-access-control
    provides: GitHubProvider with token validation, localStorage auth pattern
provides:
  - useGitHubExport hook with full export lifecycle (loading, error, retry)
  - GitHubProvider prMetadata hydration from API
  - Context setPrMetadata for post-export state updates
  - pasteId prop threading through provider
affects: [04-pr-creation-export/plan-03, 05-inbound-sync, 06-outbound-sync]

# Tech tracking
tech-stack:
  added: []
  patterns: [exponential-backoff-retry, auth-expiry-token-clear, metadata-hydration-on-mount]

key-files:
  created:
    - packages/github/client/useGitHubExport.ts
  modified:
    - packages/github/client/GitHubProvider.tsx

key-decisions:
  - "Export hook separate from context -- useGitHubExport called directly by UI, not through GitHubProvider createPR action"
  - "Local ExportAnnotation/ExportBlock types to avoid cross-package dependency on @plannotator/ui"
  - "Max 3 retries for both rate limit (429) and network errors with exponential backoff"

patterns-established:
  - "Exponential backoff: Math.pow(2, retryCount) * 1000ms with Retry-After header override for 429s"
  - "Auth expiry pattern: 401 clears localStorage token and surfaces re-auth message"

requirements-completed: [PR-02, PR-06]

# Metrics
duration: 2min
completed: 2026-04-02
---

# Phase 4 Plan 02: Client Export Hook & Provider Update Summary

**useGitHubExport hook with 429/401/network retry handling, GitHubProvider prMetadata hydration from paste API**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-02T20:23:54Z
- **Completed:** 2026-04-02T20:25:41Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Created useGitHubExport hook managing full export lifecycle with loading, error, result, and retry state
- Updated GitHubProvider to hydrate prMetadata from /api/pr/:pasteId/metadata on mount
- Context extended with setPrMetadata and pasteId for UI integration

## Task Commits

Each task was committed atomically:

1. **Task 1: Create useGitHubExport hook** - `5f69cbe` (feat)
2. **Task 2: Update GitHubProvider with prMetadata hydration** - `07c4f5d` (feat)

## Files Created/Modified
- `packages/github/client/useGitHubExport.ts` - Export hook with loading/error/retry state, rate limit and auth expiry handling
- `packages/github/client/GitHubProvider.tsx` - Updated provider with pasteId prop, prMetadata hydration, setPrMetadata in context

## Decisions Made
- Export hook is separate from context createPR stub -- UI calls useGitHubExport directly rather than going through provider action
- Local ExportAnnotation/ExportBlock types defined in hook file to avoid cross-package import from @plannotator/ui
- Max 3 retries with exponential backoff for both 429 rate limits and network errors

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Export hook ready for Plan 03 UI integration
- GitHubProvider context shape finalized for UI consumption
- Server-side /api/pr/create endpoint (Plan 01) provides the API this hook calls

---
*Phase: 04-pr-creation-export*
*Completed: 2026-04-02*

## Self-Check: PASSED
