# Technology Stack

**Project:** Plannotator GitHub Integration Plugin
**Researched:** 2026-04-01

## Recommended Stack

### GitHub API Client

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Raw `fetch` (keep current pattern) | N/A | All GitHub REST API calls | The codebase already uses raw `fetch` with a `githubRequest()` helper in `apps/paste-service/github/pr.ts`. Adding Octokit would introduce ~50KB+ of dependency for typed wrappers around the same HTTP calls. The existing pattern works, is well-understood, and keeps the bundle small for the Cloudflare Worker target. |
| `@octokit/graphql` | ^8.0.0 | Thread resolution via GraphQL | **Only needed for thread resolution.** The REST API has no endpoint for resolving review threads -- `resolveReviewThread` is a GraphQL-only mutation. This is a lightweight package (~5KB) that can share the same Bearer token. Install only when implementing thread resolution (Phase 3+). |

**Confidence:** HIGH -- verified against GitHub REST API docs (2022-11-28 version) and GraphQL reference.

**Rationale for NOT using Octokit full SDK:**
- `octokit` v5.0.5 (Oct 2025) dropped Node 18 support, bundles REST + GraphQL + webhooks + auth -- way more than needed
- `@octokit/rest` v22.0.1 adds typed methods but the project already has working raw fetch patterns
- The paste service runs on Cloudflare Workers where bundle size matters
- Adding Octokit would be a refactor of existing working code for marginal benefit (type completion on method names)
- If the team later wants types, `@octokit/types` can be added standalone for interface definitions without the runtime

### GitHub API Endpoints Needed

| Endpoint | Method | Purpose | API Type |
|----------|--------|---------|----------|
| `/repos/{owner}/{repo}/pulls/{pr}/comments` | GET | List review comments (includes `in_reply_to_id` for threading) | REST |
| `/repos/{owner}/{repo}/pulls/{pr}/comments` | POST | Create review comment at specific line | REST |
| `/repos/{owner}/{repo}/pulls/{pr}/comments/{id}/replies` | POST | Reply to a review comment thread | REST |
| `/repos/{owner}/{repo}/pulls/{pr}/reviews` | POST | Submit review (APPROVE/REQUEST_CHANGES/COMMENT) with batch comments | REST |
| `/repos/{owner}/{repo}/issues/{pr}/comments` | GET | List general PR comments (no line numbers) | REST |
| `/repos/{owner}/{repo}/issues/{pr}/comments` | POST | Create general PR comment | REST |
| `resolveReviewThread` | Mutation | Resolve a review thread (summary annotation trigger) | **GraphQL only** |
| `unresolveReviewThread` | Mutation | Unresolve a thread if needed | **GraphQL only** |

**Critical finding:** Thread resolution has NO REST API equivalent. The `in_reply_to_id` field on REST review comments provides flat threading (replies to top-level comments only -- "replies to replies are not supported" per GitHub docs). Thread IDs for GraphQL resolution must be obtained via GraphQL query on `PullRequestReviewThread`.

**Confidence:** HIGH -- verified against official GitHub REST and GraphQL docs.

### Plugin Architecture

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| External Annotations API (existing) | N/A | Primary extension point for injecting GitHub comments as annotations | Already built and battle-tested. The `/api/external-annotations` endpoints (POST, GET, PATCH, DELETE, SSE stream) provide exactly the mechanism needed to inject PR comments into the Plannotator UI without modifying core code. See `packages/server/external-annotations.ts`. |
| Bun server middleware pattern (existing) | N/A | Server-side route registration | The `createExternalAnnotationHandler` pattern returns `Response | null` (null = pass-through). GitHub routes follow this exact pattern. |
| React context + hook composition | N/A | Client-side plugin state | `useGitHubPRSync` already exists as a hook. Wrap it in a React context provider that sits above the existing component tree. The provider injects state without modifying core components. |

**Confidence:** HIGH -- these patterns already exist in the codebase.

**Plugin file structure (recommended):**

```
packages/github/                    # NEW package in monorepo
  ├── server/
  │   ├── github-handler.ts         # HTTP handler (same pattern as external-annotations.ts)
  │   ├── github-api.ts             # Raw fetch wrapper (extracted from paste-service/github/pr.ts)
  │   ├── comment-sync.ts           # Bidirectional comment <-> annotation mapping
  │   └── thread-resolver.ts        # GraphQL thread resolution (Phase 3)
  ├── client/
  │   ├── GitHubProvider.tsx         # React context provider
  │   ├── useGitHubSync.ts          # Refactored from packages/ui/hooks/useGitHubPRSync.ts
  │   ├── useGitHubThreads.ts       # Thread display + summary creation
  │   └── components/               # GitHub-specific UI (sync button, thread panel, etc.)
  ├── shared/
  │   ├── types.ts                  # PRMetadata, PRComment, ThreadInfo, etc.
  │   └── line-mapper.ts            # Markdown line <-> GitHub diff position mapping
  └── index.ts                      # Public API surface
```

**Why a separate `packages/github/` instead of modifying existing packages:**
- Keeps the fork diff minimal -- new files only, no changes to existing ones
- Can be excluded from upstream builds entirely
- Clear dependency direction: `packages/github/` imports from `packages/shared/`, `packages/ui/`, `packages/server/` -- never the reverse
- The monorepo workspace system already supports this pattern

### Fork Management

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `git rebase` (standard git) | N/A | Upstream sync strategy | Rebase fork commits on top of upstream main. Keeps history linear and conflicts localized. |
| `.gitattributes` merge strategy | N/A | Conflict avoidance for config files | Mark `package.json`, `bun.lock` as merge=union or add custom merge drivers for workspace arrays. |
| Workspace-level isolation | N/A | Structural conflict avoidance | All GitHub code in `packages/github/` and minimal changes to root `package.json` (just adding the workspace). New files never conflict with upstream changes. |

**Confidence:** HIGH for the isolation strategy. MEDIUM for the `.gitattributes` approach (depends on upstream's change patterns).

**Fork sync workflow:**
1. `git fetch upstream && git rebase upstream/main` on feature branches
2. Conflicts only possible in: root `package.json` (workspace array), `bun.lock`, and any files where we modified upstream code
3. Minimize category 3 by using the external annotations API and new packages instead of patching existing files

### Line Mapping

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Custom line mapper (extend existing `mapLineToBlock`) | N/A | Map GitHub diff positions to plan markdown lines to block IDs | The existing `lineMapper.ts` in `packages/ui/utils/` already maps line numbers to blocks. GitHub review comments use `line` (final file line number) and `original_line` fields. Needs extension for reverse direction (block + offset -> line number) for outbound sync. |

**Confidence:** MEDIUM -- the line mapping is the hardest algorithmic problem. GitHub diff positions are relative to the file, but annotations are relative to rendered DOM blocks. Need to account for: (1) the plan markdown as committed may differ from what the user sees in Plannotator, (2) multi-line annotations need `start_line` + `line` range.

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@octokit/graphql` | ^8.0.0 | GraphQL queries for thread resolution | Phase 3 only -- when implementing summary annotations that resolve threads |
| `@octokit/types` | ^15.0.0 | TypeScript type definitions for GitHub API responses | Optional -- add if team wants autocomplete on API response shapes without runtime cost |

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| GitHub API client | Raw `fetch` + helper | `octokit` v5 / `@octokit/rest` v22 | Unnecessary dependency. Adds bundle size for typed wrappers the codebase does not need. Current `githubRequest()` pattern works. |
| GitHub API client | Raw `fetch` + helper | `gh` CLI via `child_process` | CLI lacks fine-grained control over review comments, threads, line positions. PROJECT.md already notes API preferred for sync. |
| Plugin architecture | External annotations API + new package | Core file modifications | Violates the fork constraint. Every modified upstream file is a potential merge conflict. |
| Plugin architecture | Monorepo package (`packages/github/`) | Separate npm package | Over-engineering. The plugin is fork-specific and will never be published independently. |
| Plugin architecture | Monorepo package | git submodule | Submodules add complexity. A workspace package is simpler and already the established pattern. |
| Thread resolution | `@octokit/graphql` | REST API workaround | Thread resolution literally does not exist in the REST API. GraphQL is the only option. |
| Fork sync | Rebase strategy | Merge strategy | Merge creates noisy history with merge commits. Rebase keeps fork commits cleanly on top. |
| Fork sync | New package isolation | Patch files | Patch files are fragile and require regeneration when upstream changes. New files avoid the problem entirely. |

## Installation

```bash
# Phase 1-2: No new dependencies needed
# The raw fetch pattern requires zero additional packages

# Phase 3 (thread resolution): Add GraphQL client
bun add @octokit/graphql

# Optional: Type definitions for GitHub API responses
bun add -D @octokit/types
```

## What NOT to Use

| Technology | Why Not |
|------------|---------|
| `octokit` (full SDK) | 50KB+ bundle, includes webhook handling and auth strategies not needed. Dropped Node 18 in v5. |
| `@octokit/rest` | Typed REST methods are nice but the codebase already has raw fetch patterns that work. Refactoring for marginal gain. |
| `@octokit/webhooks` | Project explicitly uses manual sync (user clicks button), not webhooks. |
| GitHub Apps auth | Project uses OAuth user tokens. App installation tokens require separate auth flow and server-side key management. |
| GraphQL for everything | REST API is simpler for CRUD on comments. Use GraphQL only where REST has no equivalent (thread resolution). |

## Sources

- GitHub REST API docs: Pull Request Review Comments -- https://docs.github.com/en/rest/pulls/comments (verified 2026-04-01, apiVersion 2022-11-28)
- GitHub REST API docs: Pull Request Reviews -- https://docs.github.com/en/rest/pulls/reviews (verified 2026-04-01)
- GitHub GraphQL: resolveReviewThread mutation -- https://docs.github.com/en/graphql/reference/mutations#resolvereviewthread (verified 2026-04-01)
- GitHub REST: `in_reply_to_id` threading -- "Replies to replies are not supported" (flat threading only)
- Octokit.js releases: v5.0.5 (Oct 2025) -- https://github.com/octokit/octokit.js/releases
- @octokit/rest: v22.0.1 (Oct 2025) -- https://github.com/octokit/rest.js
- @octokit/graphql: https://github.com/octokit/graphql.js
- Existing codebase: `apps/paste-service/github/pr.ts`, `packages/server/external-annotations.ts`, `packages/ui/hooks/useGitHubPRSync.ts`
