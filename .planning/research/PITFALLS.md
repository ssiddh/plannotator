# Domain Pitfalls

**Domain:** GitHub PR sync, fork maintenance, bidirectional annotation synchronization
**Researched:** 2026-04-01

## Critical Pitfalls

Mistakes that cause rewrites or major issues.

### Pitfall 1: Line Number Drift Between Plan and PR

**What goes wrong:** Plan markdown in Plannotator and the file committed to the PR branch diverge. Annotations created in Plannotator after PR creation reference line numbers that don't match the committed file. GitHub review comments land on wrong lines.

**Why it happens:** The plan markdown is committed to GitHub at PR creation time. If the user edits annotations or the plan is resubmitted after denial, the local version diverges from what's on the branch. GitHub review comments reference lines in the committed file.

**Consequences:** Comments appear on wrong lines in GitHub. Inbound comments map to wrong blocks in Plannotator. Users lose trust in the sync.

**Prevention:**
1. Store the committed plan markdown hash at PR creation time
2. Before outbound sync, compare current plan with committed version
3. If they differ, warn the user and offer to update the PR branch (force push the new plan)
4. For inbound sync, always use the committed file's line numbers as the canonical reference

**Detection:** Comments consistently appearing off by N lines where N = number of inserted/deleted lines since PR creation.

### Pitfall 2: Modifying Core Files Breaks Upstream Rebase

**What goes wrong:** Adding GitHub imports or conditional logic to files like `packages/server/index.ts` or `packages/editor/App.tsx` creates merge conflicts every time upstream modifies those files.

**Why it happens:** Upstream is actively developed. Any file the fork modifies becomes a conflict candidate. The more files touched, the more manual conflict resolution needed per rebase.

**Consequences:** Rebasing becomes a multi-hour chore. Eventually the fork falls behind upstream and the team stops rebasing. The fork diverges permanently.

**Prevention:**
1. Maximum ONE core file modification: the context provider wrapper in App.tsx
2. All other integration via external annotations API and new files
3. Server-side GitHub handler registered through a single integration point
4. Run a periodic check: `git diff upstream/main --name-only` should show mostly files in `packages/github/` and `apps/paste-service/`

**Detection:** `git diff upstream/main --stat` showing changes in more than 5 upstream files.

### Pitfall 3: Duplicate Comments on Repeated Sync

**What goes wrong:** User clicks "Sync to GitHub" twice. Each sync creates new review comments for the same annotations, resulting in duplicate comments on the PR.

**Why it happens:** No ID mapping between annotations and their GitHub comment counterparts. Each sync treats all annotations as new.

**Consequences:** PR becomes cluttered with duplicates. Users have to manually delete duplicate comments. Trust in sync reliability is destroyed.

**Prevention:**
1. Every synced annotation stores its `githubCommentId`
2. Every imported comment generates a deterministic annotation ID: `github-pr-${commentId}`
3. Before outbound sync, filter out annotations that already have a `githubCommentId`
4. Before inbound sync, filter out comments whose annotation ID already exists
5. Use external annotations' `source: "github-pr"` to clear and re-import (full replacement) rather than incremental add

**Detection:** Seeing duplicate comments on GitHub or duplicate annotations in Plannotator.

### Pitfall 4: GitHub API Rate Limiting During Sync

**What goes wrong:** Sync operations make many sequential API calls (one per comment for outbound, pagination for inbound). Hitting the 5000/hour rate limit causes sync to fail partway through.

**Why it happens:** Each review comment creation is a separate API call. A plan with 50 annotations = 50 API calls for outbound sync. If the user is also using GitHub normally, they share the same rate limit.

**Consequences:** Partial sync -- some comments created, others not. Inconsistent state between Plannotator and GitHub.

**Prevention:**
1. For outbound: use the Reviews API (`POST /repos/{owner}/{repo}/pulls/{pr}/reviews`) which accepts a `comments` array -- batch all comments in a single review submission (one API call instead of N)
2. For inbound: use `per_page=100` to minimize pagination calls
3. Check `X-RateLimit-Remaining` header after API calls; warn user if below threshold
4. Track partial sync state so retry picks up where it left off

**Detection:** 403 responses from GitHub API with `X-RateLimit-Remaining: 0`.

## Moderate Pitfalls

### Pitfall 5: Thread ID Mismatch Between REST and GraphQL

**What goes wrong:** Thread resolution requires GraphQL thread node IDs, but thread info is obtained via REST API (which returns numeric comment IDs, not GraphQL node IDs).

**Prevention:** When implementing thread resolution, make a GraphQL query to get `PullRequestReviewThread` objects with their node IDs. Cache the mapping between REST comment IDs and GraphQL thread IDs. Don't try to construct GraphQL IDs from REST IDs -- they use different ID spaces.

### Pitfall 6: Overloading Annotation Type Fields for GitHub Metadata

**What goes wrong:** The current `useGitHubPRSync.ts` stores avatar URLs in the `images` array and zeros out `startMeta`/`endMeta`. If core Plannotator code validates or processes these fields (e.g., for highlight restoration), it breaks.

**Prevention:** Use the external annotations API which supports arbitrary fields via its `StorableAnnotation` type. Define GitHub-specific metadata in `packages/github/shared/types.ts` as proper typed extensions, not as hacks on existing fields.

### Pitfall 7: paste-service and Plannotator Server Running Different Code

**What goes wrong:** GitHub routes split between the paste service (OAuth, PR creation) and Plannotator server (sync). Changes to auth middleware in one place don't propagate to the other. Token validation logic diverges.

**Prevention:** Keep auth logic in paste-service where it already lives. The Plannotator server's GitHub handler receives pre-validated tokens passed from the client (which already authenticated with paste-service). Don't duplicate auth validation. If server-side token validation is needed, import the shared function from paste-service.

### Pitfall 8: Flat Threading Limitation in REST API

**What goes wrong:** The REST API only supports flat threading -- `in_reply_to_id` creates one level of nesting (comment -> replies). Replies to replies are not supported. If someone on GitHub replies to a reply, the REST API returns it as a reply to the root, losing the nested structure.

**Prevention:** Accept the flat threading model. Display threads as: root comment + all replies (in chronological order). Don't try to reconstruct nested reply trees. This matches GitHub's own PR UI which also uses flat threading.

## Minor Pitfalls

### Pitfall 9: PR Branch Naming Collision

**What goes wrong:** The current code creates branches named `plan/${pasteId}`. If a plan is shared multiple times, the branch already exists and the code force-pushes to it.

**Prevention:** Acceptable for single-repo usage. Document that re-exporting overwrites the PR branch. Consider adding a timestamp or version suffix if this becomes an issue.

### Pitfall 10: CORS on Cross-Origin Requests

**What goes wrong:** The paste service (on Workers) and Plannotator server (on localhost random port) are different origins. Cross-origin requests for sync operations may be blocked.

**Prevention:** The paste service already has CORS handling. For new sync endpoints on the Plannotator server, add appropriate CORS headers. The client code already handles this for existing paste service calls.

### Pitfall 11: GitHub API Version Deprecation

**What goes wrong:** The code uses `Accept: application/vnd.github.v3+json`. GitHub has been migrating to date-based API versions (e.g., `2022-11-28`). Eventually v3 header may be deprecated.

**Prevention:** Pin to a specific API version via `X-GitHub-Api-Version: 2022-11-28` header. This is more forward-compatible than the v3 accept header. Update when GitHub announces deprecation of the pinned version.

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Plugin package setup | Circular dependency between packages/github and packages/ui | Strict dependency direction: github imports from ui, never reverse. No barrel exports that pull in github from ui. |
| Code refactoring | Breaking existing PR creation flow | Keep paste-service PR routes working as-is. Extract shared logic (github-api.ts) but don't change the paste-service handler's behavior. |
| Inbound sync | Line mapping accuracy | Start with "global comment" fallback for any comment that can't be mapped to a specific block. Improve mapping iteratively. |
| Outbound sync | Rate limiting on large plans | Use Reviews API for batch comment creation instead of individual comment API calls. |
| Thread display | REST API flat threading | Accept flat threading. Don't over-engineer nested display. |
| Thread resolution | REST vs GraphQL ID mismatch | Query GraphQL for thread node IDs. Don't assume REST IDs work in GraphQL mutations. |
| Fork maintenance | bun.lock conflicts | Regenerate bun.lock after rebase resolution rather than trying to manually merge it. Add to `.gitattributes` as binary merge. |

## Sources

- GitHub REST API docs: `in_reply_to_id` -- "Replies to replies are not supported" (flat threading)
- GitHub REST API docs: Rate limiting -- 5000 requests/hour for authenticated users
- GitHub REST API docs: Reviews endpoint supports batch `comments` array
- GitHub GraphQL docs: `resolveReviewThread` requires GraphQL node ID, not REST numeric ID
- Existing codebase: `useGitHubPRSync.ts` (demonstrates Pitfall 3 and 6 in current code)
- Existing codebase: `apps/paste-service/github/pr.ts` (demonstrates Pitfall 9 in branch naming)
