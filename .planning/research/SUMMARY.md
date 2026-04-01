# Project Research Summary

**Project:** Plannotator GitHub Integration Plugin
**Domain:** Bidirectional GitHub PR sync for a plan review tool (maintained fork)
**Researched:** 2026-04-01
**Confidence:** HIGH

## Executive Summary

This project adds deep GitHub PR integration to Plannotator, a plan review UI for Claude Code. The core challenge is building bidirectional sync between Plannotator annotations and GitHub PR review comments while maintaining a fork that can cleanly rebase on upstream. The codebase already has significant infrastructure for this -- OAuth authentication, PR creation, a polling-based sync hook (`useGitHubPRSync`), and critically, an external annotations API designed as a plugin extension point. The recommended approach is to build a new `packages/github/` workspace package that uses the external annotations API as its primary integration surface, minimizing modifications to upstream files.

The strongest technical recommendation from research is to keep ALL GitHub code in a single new monorepo package (`packages/github/`) with a strict dependency direction: github imports from core packages, never the reverse. The only upstream file modification should be a React context provider wrapper in `App.tsx`. This isolation strategy is not just a nice-to-have -- it is the critical enabler for long-term fork viability. Every additional upstream file touched multiplies rebase cost.

The key risks are (1) line number drift between the plan markdown in Plannotator and the committed file on the PR branch, which causes comments to land on wrong lines, and (2) duplicate comment creation on repeated syncs without proper ID tracking. Both are solvable with known patterns (hash-based drift detection and bidirectional ID mapping), but they must be designed in from Phase 1, not bolted on later.

## Key Findings

### Recommended Stack

No new dependencies are needed for Phases 1-2. The codebase already uses raw `fetch` with a `githubRequest()` helper, and this pattern should be continued rather than introducing Octokit. The external annotations API (`/api/external-annotations`) provides the complete CRUD + SSE infrastructure needed for injecting GitHub comments into the UI.

**Core technologies:**
- **Raw `fetch` + helper**: GitHub REST API calls -- already established pattern, keeps bundle small for Cloudflare Workers
- **External Annotations API**: Plugin extension point for injecting/reading annotations -- already built and battle-tested
- **`@octokit/graphql` (Phase 5 only)**: Thread resolution via GraphQL -- REST API has NO endpoint for resolving review threads
- **React Context + hook composition**: Client-side plugin state -- avoids prop drilling, single integration point in App.tsx

### Expected Features

**Must have (table stakes):**
- Create PR from plan (exists, needs extraction to plugin package)
- Sync GitHub comments into Plannotator (inbound, with line positioning)
- Sync Plannotator annotations to GitHub (outbound, as review comments)
- Comment author and avatar display
- Line-level comment positioning (highest complexity table-stakes item)
- Authentication gating (already implemented)

**Should have (differentiators):**
- Thread display with all replies inline
- Manual sync buttons (user controls timing, no polling)
- Submit PR review directly from Plannotator (approve/request changes)
- Annotation-to-comment ID tracking for deduplication

**Defer (v2+):**
- Summary annotations that resolve GitHub threads (requires GraphQL + thread ID mapping)
- Webhook-based real-time sync (contradicts manual sync design)
- Multi-repo support, GitLab/Bitbucket support
- Editing GitHub comments from Plannotator (conflict resolution nightmare)

### Architecture Approach

The architecture follows a clean plugin model: a new `packages/github/` workspace with `server/`, `client/`, and `shared/` directories. The server side uses the handler factory pattern (returning `Response | null` for chaining) to register `/api/github/*` routes. The client side uses a React context provider (`GitHubProvider`) as the single upstream integration point. Inbound sync flows through the external annotations API with `source: "github-pr"`, which automatically triggers SSE updates to the UI. Outbound sync maps annotation positions back to line numbers via a bidirectional line mapper.

**Major components:**
1. **`github-handler.ts`** -- HTTP route handler for sync endpoints, follows existing factory pattern
2. **`comment-sync.ts`** -- Bidirectional mapping engine: GitHub comments to/from annotations with ID tracking
3. **`line-mapper.ts`** -- Bidirectional line mapping: markdown lines to block IDs and back
4. **`GitHubProvider.tsx`** -- React context providing PR metadata, sync status, thread data
5. **`github-api.ts`** -- Extracted fetch wrapper, shared between paste-service and plugin

### Critical Pitfalls

1. **Line number drift between plan and PR** -- Store committed plan hash at PR creation. Compare before outbound sync. Warn user if diverged and offer branch update.
2. **Duplicate comments on repeated sync** -- Track bidirectional IDs: annotations store `githubCommentId`, imported comments get deterministic `github-pr-${commentId}` annotation IDs. Filter before every sync.
3. **Core file modifications breaking upstream rebase** -- Maximum ONE core file change (App.tsx context wrapper). All else via external annotations API and new files. Monitor with `git diff upstream/main --name-only`.
4. **GitHub API rate limiting during batch sync** -- Use Reviews API (`POST .../reviews` with `comments` array) for batch outbound sync instead of individual comment creation calls.
5. **REST vs GraphQL thread ID mismatch** -- REST numeric IDs and GraphQL node IDs are different ID spaces. Must query GraphQL for thread node IDs when implementing thread resolution. Do not attempt to construct one from the other.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Plugin Foundation and Code Extraction
**Rationale:** Everything depends on the plugin package structure existing. Extracting existing scattered code is the lowest-risk starting point and establishes the fork isolation pattern from day one.
**Delivers:** `packages/github/` workspace package with extracted `github-api.ts`, refactored types, and the `GitHubProvider` context wrapper in App.tsx.
**Addresses:** Plugin architecture foundation, authentication gating (already works, just needs integration point)
**Avoids:** Core file modification pitfall (establish the pattern of new-files-only from day one)

### Phase 2: Inbound Sync (GitHub to Plannotator)
**Rationale:** Inbound sync is lower risk than outbound because it does not create data on GitHub. It exercises the external annotations API integration and proves the line mapping works. Users get immediate value by seeing PR comments in their review UI.
**Delivers:** "Sync from GitHub" button that imports PR comments as positioned annotations with author/avatar display.
**Uses:** External annotations API (batch POST), `line-mapper.ts`, `comment-sync.ts`
**Implements:** Handler factory pattern, ID-based deduplication (inbound side)
**Avoids:** Rate limiting pitfall (inbound uses paginated GET, manageable)

### Phase 3: Outbound Sync (Plannotator to GitHub)
**Rationale:** Depends on line mapper being proven in Phase 2. Outbound is higher risk because it creates review comments on GitHub -- mistakes are visible and harder to undo. The Reviews API batch endpoint should be used from the start.
**Delivers:** "Sync to GitHub" button that exports annotations as PR review comments with correct line positioning.
**Uses:** Reviews API (batch creation), bidirectional line mapper, ID tracking
**Implements:** Outbound `comment-sync.ts`, drift detection (committed plan hash comparison)
**Avoids:** Duplicate comment pitfall (ID tracking), rate limiting pitfall (batch API), line drift pitfall (hash check + user warning)

### Phase 4: Thread Display and PR Review Submission
**Rationale:** Threads depend on synced comments existing (Phase 2). PR review submission is a natural extension of outbound sync (Phase 3). These can be built in parallel or sequentially.
**Delivers:** Inline thread display in annotation panel (grouped by `in_reply_to_id`), ability to submit approve/request-changes/comment reviews from Plannotator UI.
**Avoids:** Flat threading pitfall (accept REST API's single-level nesting, don't over-engineer)

### Phase 5: Thread Resolution via GraphQL
**Rationale:** Most complex feature, requires new dependency (`@octokit/graphql`). Depends on thread display (Phase 4) being solid. Defer until bidirectional sync is proven and stable.
**Delivers:** Summary annotations that auto-resolve GitHub threads. Author writes summary, clicks resolve, thread closes on GitHub.
**Uses:** `@octokit/graphql`, thread node ID mapping
**Avoids:** REST/GraphQL ID mismatch pitfall (query GraphQL for node IDs, cache mapping)

### Phase Ordering Rationale

- Phases 1-3 follow a strict dependency chain: package structure -> inbound sync -> outbound sync. Each phase validates the next phase's assumptions.
- Phase 2 before Phase 3 because inbound is read-only on GitHub (safer to iterate on) and proves the line mapping algorithm before it is used to create comments.
- Phase 4 is semi-independent -- thread display only needs Phase 2, while PR review submission needs Phase 3. Thread display could start during Phase 3 development.
- Phase 5 is deliberately last because it introduces a new dependency, a new API paradigm (GraphQL), and a new ID mapping challenge. It is also the least critical for MVP.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (Inbound Sync):** Line mapping algorithm is the hardest problem. The mapping between GitHub diff positions (file line numbers) and Plannotator block IDs + character offsets is non-trivial. Research should validate with real PR comment data.
- **Phase 3 (Outbound Sync):** Reviews API batch comment format needs validation. The `comments` array in the reviews endpoint has specific requirements for `path`, `position`, `line`, `side` fields that need testing against actual PRs.
- **Phase 5 (Thread Resolution):** GraphQL thread node ID acquisition and caching strategy needs research. The relationship between REST comment IDs, GraphQL comment node IDs, and GraphQL thread node IDs is not fully documented.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Plugin Foundation):** Well-established monorepo package patterns. The codebase already has multiple packages to follow as templates.
- **Phase 4 (Thread Display):** Flat threading from `in_reply_to_id` is straightforward grouping logic. PR review submission is a single well-documented REST endpoint.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Verified against official GitHub API docs (REST + GraphQL). No new dependencies needed for MVP phases. |
| Features | HIGH | Feature list derived from existing codebase capabilities and project requirements. Clear dependency chain. |
| Architecture | HIGH | All recommended patterns already exist in the codebase (handler factory, external annotations, context providers). |
| Pitfalls | HIGH | Critical pitfalls identified from existing code anti-patterns and API documentation limitations. |

**Overall confidence:** HIGH

### Gaps to Address

- **Line mapping accuracy:** The bidirectional line mapper is the least-proven component. The existing `mapLineToBlock` function works for one direction but has not been validated for the reverse (block + offset -> file line number). Needs prototype validation in Phase 2 with real PR data.
- **Plan drift handling UX:** Research identifies the drift problem and the hash-based detection, but the user experience for "plan has changed since PR creation" needs design work. Should the user be forced to update the branch, or can they sync with a warning?
- **Auth token flow between paste-service and Plannotator server:** The paste-service owns OAuth. The Plannotator server's GitHub handler needs tokens. The exact mechanism (client passes token, server-to-server call, shared store) needs finalization during Phase 1.
- **Flat threading display design:** The UI for displaying flat threads (root comment + chronological replies) in the annotation panel needs mockup. Current annotation panel shows individual annotations, not grouped threads.
- **REST `node_id` field:** GitHub REST responses include `node_id` on most objects. If PR review comments include `node_id` usable in GraphQL mutations directly, thread resolution in Phase 5 simplifies significantly. Verify during Phase 5 planning.
- **Multi-line annotations:** GitHub supports `start_line` + `line` for multi-line review comments. Annotation-to-line mapping for multi-line selections needs design during Phase 3.

## Sources

### Primary (HIGH confidence)
- GitHub REST API docs: Pull Request Review Comments -- https://docs.github.com/en/rest/pulls/comments
- GitHub REST API docs: Pull Request Reviews -- https://docs.github.com/en/rest/pulls/reviews
- GitHub GraphQL: resolveReviewThread mutation -- https://docs.github.com/en/graphql/reference/mutations#resolvereviewthread
- Existing codebase: `packages/server/external-annotations.ts`, `packages/ui/hooks/useGitHubPRSync.ts`, `apps/paste-service/github/pr.ts`

### Secondary (MEDIUM confidence)
- Fork maintenance strategies based on git rebase best practices and `.gitattributes` merge drivers
- Rate limiting mitigation via Reviews API batch endpoint (documented but untested for this use case)
- Octokit.js releases and package sizes -- https://github.com/octokit/octokit.js/releases

### Tertiary (LOW confidence)
- Line mapping reverse direction (block -> line number) -- needs prototype validation
- `@octokit/graphql` integration patterns for thread resolution -- deferred to Phase 5

---
*Research completed: 2026-04-01*
*Ready for roadmap: yes*
