---
phase: 01-plugin-architecture
plan: 01
subsystem: api
tags: [github, oauth, typescript, workspace, plugin-architecture]

# Dependency graph
requires: []
provides:
  - "@plannotator/github workspace package with server modules"
  - "GitHubHandler interface (Response | null composition pattern)"
  - "Consolidated GitHub types (PasteACL, GitHubUser, PRMetadata, PRComment, GitHubConfig, PRStorageAdapter)"
  - "Config-injected server modules (oauth, middleware, pr, handler)"
affects: [01-plugin-architecture, 02-ui-components, 03-data-layer]

# Tech tracking
tech-stack:
  added: ["@plannotator/github workspace package"]
  patterns: ["GitHubHandler composition pattern (Response | null)", "Config injection via GitHubConfig (no process.env)", "PRStorageAdapter for storage decoupling"]

key-files:
  created:
    - packages/github/package.json
    - packages/github/tsconfig.json
    - packages/github/shared/types.ts
    - packages/github/server/handler.ts
    - packages/github/server/oauth.ts
    - packages/github/server/middleware.ts
    - packages/github/server/pr.ts
    - packages/github/server/handler.test.ts
    - packages/github/server/oauth.test.ts
    - packages/github/server/middleware.test.ts
    - packages/github/server/pr.test.ts
  modified: []

key-decisions:
  - "KV parameter typed as any to avoid Cloudflare Workers dependency in plugin package"
  - "githubRequest exported from pr.ts for future direct API call usage by handler"
  - "PRStorageAdapter interface decouples plugin from PasteStore for flexible storage backends"
  - "parseCookies exported from oauth.ts since middleware needs it"

patterns-established:
  - "GitHubHandler: factory function createGitHubHandler returns object with handle(req, url) -> Response | null"
  - "Config injection: all server modules accept GitHubConfig instead of reading process.env"
  - "Storage adapter: PRStorageAdapter abstracts PR metadata storage (KV, filesystem, etc.)"

requirements-completed: [ARCH-01, ARCH-03, ARCH-05]

# Metrics
duration: 6min
completed: 2026-04-01
---

# Phase 01 Plan 01: GitHub Plugin Package Summary

**Isolated @plannotator/github workspace package with config-injected server modules following the ExternalAnnotationHandler composition pattern**

## Performance

- **Duration:** 6 min
- **Started:** 2026-04-01T22:30:13Z
- **Completed:** 2026-04-01T22:35:49Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments
- Created @plannotator/github workspace package with explicit exports map and TypeScript configuration
- Consolidated all GitHub types from paste-service into a single shared/types.ts with new GitHubConfig and PRStorageAdapter interfaces
- Extracted 4 server modules (handler, oauth, middleware, pr) with config injection replacing all process.env references
- 26 tests across 4 test files with 44 assertions, all passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Create package scaffold and consolidated types** - `4b3c8ea` (feat)
2. **Task 2: Extract server modules (handler, oauth, middleware, pr)** - `c68c3b4` (feat)
3. **Task 3: Write tests for all server modules** - `426add4` (test)

## Files Created/Modified
- `packages/github/package.json` - Workspace manifest with @plannotator/github name and exports map
- `packages/github/tsconfig.json` - TypeScript config mirroring shared package with jsx support
- `packages/github/shared/types.ts` - Consolidated types: PasteACL, PasteMetadata, GitHubUser, AuthResult, PRMetadata, PRComment, GitHubConfig, PRStorageAdapter
- `packages/github/server/handler.ts` - GitHubHandler interface and createGitHubHandler factory routing to all sub-modules
- `packages/github/server/oauth.ts` - OAuth flow: login redirect, callback exchange, token validate/refresh, cookie parsing
- `packages/github/server/middleware.ts` - Token extraction (Bearer/query), GitHub token validation with KV cache, ACL enforcement
- `packages/github/server/pr.ts` - PR creation via GitHub API, comment fetching (review + issue), githubRequest helper
- `packages/github/server/handler.test.ts` - 7 tests: route matching, null pass-through, 503 when unconfigured
- `packages/github/server/oauth.test.ts` - 6 tests: login redirect URL, state parameter, cookie parsing
- `packages/github/server/middleware.test.ts` - 9 tests: token extraction variants, ACL access checks
- `packages/github/server/pr.test.ts` - 4 tests: config injection, default branch fallback, API URL construction

## Decisions Made
- KV parameter typed as `any` instead of `KVNamespace` to avoid Cloudflare Workers dependency in the plugin package. KV is optional and only used for caching.
- `githubRequest` exported from pr.ts as a named export for future direct API usage by handler extensions.
- `parseCookies` exported from oauth.ts since middleware and other modules may need cookie parsing.
- PRStorageAdapter interface introduced to decouple plugin from PasteStore, allowing flexible storage backends (KV, filesystem, or custom adapters).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None - all modules are fully implemented with real logic extracted from paste-service.

## Next Phase Readiness
- @plannotator/github package ready for consumption by paste-service handler refactoring (Plan 02)
- Client-side modules (GitHubProvider.tsx, lineMapper.ts) referenced in exports map but not yet created (planned for Plan 03)
- All 26 tests passing, providing regression safety for Plan 02 refactoring

---
*Phase: 01-plugin-architecture*
*Completed: 2026-04-01*
