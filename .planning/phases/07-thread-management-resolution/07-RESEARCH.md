# Phase 7: Thread Management & Resolution - Research

**Researched:** 2026-04-08
**Domain:** GitHub GraphQL API thread resolution, PR review submission, annotation system extension
**Confidence:** HIGH

## Summary

Phase 7 builds on top of the existing annotation system (Phase 5/6) to add summary annotations, thread resolution via GitHub GraphQL, PR review submission from Plannotator, and resolution status display. The core technical challenges are: (1) mapping REST comment IDs to GraphQL thread node IDs for resolution mutations, (2) extending `submitBatchReview()` to accept an event parameter (currently hardcoded to `"COMMENT"`), and (3) extending the Annotation type with `isSummary`, `summarizesThreadId`, and `isResolved` fields without breaking existing serialization.

The existing codebase is well-prepared for this phase. `submitBatchReview()` needs a one-line change to accept an event parameter. `buildThreadTree()` already produces the nested structure needed to identify thread parents. The `ExportModal` tab pattern and `AnnotationPanel` recursive rendering are in place. The main new work is a GraphQL module for thread resolution and the summary/review UI components.

**Primary recommendation:** Start with the data model extension (Annotation type fields), then build GraphQL resolution module, then wire up the UI components (summary creation, review tab, resolved badges, thread navigation).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: 'Summarize' button on thread parent annotation (hover, only on threads with children)
- D-02: Auto-detect thread from context; if from toolbar, show thread picker modal
- D-03: Summary annotations are editable like regular comments
- D-04: Save locally, sync separately via existing outbound sync flow (isSummary flag)
- D-05: Thread labels use first 50 chars of root comment text + "..."
- D-06: Multiple threads per line group independently
- D-07: Toolbar trigger shows modal with thread list
- D-08: Thread jump navigation buttons (Previous/Next Thread) in annotation panel
- D-09: Thread resolves during outbound sync (summary posts as reply, then resolveReviewThread mutation)
- D-10: No confirmation dialogs before resolution
- D-11: Leave thread open if resolution fails (partial success)
- D-12: Unresolve only on GitHub (no Plannotator unresolve action)
- D-13: Review UI as 'Review' tab in ExportModal (third tab)
- D-14: Auto-sync all unsynced annotations before review submission
- D-15: Optional review body text field
- D-16: Buttons use GitHub terminology (Approve, Request Changes, Comment)
- D-17: Resolved badge + muted colors (70% opacity)
- D-18: Keep threads expanded by default
- D-19: Toggle filter "Show resolved threads" in panel header (per-session, not persistent)
- D-20: Badge on thread parent only
- D-21: Distinct visual styling for summaries (yellow tint, left border, badge)
- D-22: Show thread context "Summary of: [preview]" in summary header
- D-23: Document/checkmark icon next to Summary badge
- D-24: Summaries appear as last child in thread
- D-25: Check resolution status during inbound sync
- D-26: Cache isResolved flag on thread parent annotation
- D-27: No stale data warnings
- D-28: Extend review comments API for resolution status
- D-29: Show threads resolved by anyone
- D-30: Detect and update re-opened threads
- D-31: Sync resolution status for all threads
- D-32: Batch API calls for large PRs (50 threads per call)
- D-33: Use inline fetch() with GraphQL query strings (no extra libraries)
- D-34: Leave thread open if GraphQL resolution fails
- D-35: Same rate limit handling as REST
- D-36: Minimal GraphQL mutation: resolveReviewThread(threadId: ID!)
- D-37: Lazy permission check on first resolution attempt
- D-38: Allow summary creation even without resolution permission
- D-39: Specific errors for PR state issues
- D-40: Specific actionable error messages
- D-41: No bulk summarize (one at a time)
- D-42: Summaries always required for resolution
- D-43: Markdown export for all summaries
- D-44: No multi-select UI

### Claude's Discretion
- Summary button icon (edit, plus, document, message bubble)
- Thread jump button icons and placement (top/bottom of panel)
- Modal layout for thread picker (list view, card view, tree view)
- Summary background color choice (light blue, yellow, green tint)
- Resolution badge color and shape
- Document/checkmark icon specifics
- Export markdown formatting
- Toast duration and auto-dismiss timing
- Thread preview truncation length (50 chars suggested)
- Muted color opacity for resolved threads (70% suggested)
- Batch size for resolution status API calls (50 suggested)
- GraphQL error retry logic

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| THREAD-01 | Author can create summary annotation for a discussion thread | Extend Annotation type with isSummary + summarizesThreadId fields; summary creation modal component; save as child of thread parent |
| THREAD-02 | Summary annotation UI allows selecting which thread to summarize | Thread picker modal listing threads (annotations with children); auto-detect when triggered from thread parent button |
| THREAD-03 | Summary annotations synced to GitHub as final reply in thread | Extend outbound sync to detect isSummary annotations and post as thread reply via existing reply endpoint |
| THREAD-04 | Thread resolved on GitHub when summary annotation synced (GraphQL mutation) | New graphql.ts module with resolveReviewThread mutation; requires mapping REST comment ID to GraphQL thread node_id |
| THREAD-05 | User can submit PR review (approve/request changes) from Plannotator | Extend submitBatchReview to accept event parameter; new Review tab in ExportModal |
| THREAD-06 | Review submission includes all outbound annotations as review comments | Auto-sync unsynced annotations before review submission (D-14); reuse existing outbound sync flow |
| THREAD-07 | Resolved thread status displayed in Plannotator UI | Fetch resolution status via GraphQL during inbound sync; isResolved flag on thread parent; resolved badge + opacity styling |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Bun runtime | (project default) | Server runtime, test framework | Already used throughout project |
| GitHub GraphQL API | v4 (current) | Thread resolution, resolution status queries | Only way to resolve threads and query resolution status |
| GitHub REST API | v3 | Review submission, comment posting | Already used for all PR operations |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| bun:test | (bundled) | Unit testing | All server-side logic tests |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Inline fetch() for GraphQL | graphql-request, @octokit/graphql | D-33 explicitly forbids extra libraries; fetch() is lightweight and sufficient |
| GraphQL for review submission | REST API (current) | REST is simpler and already working; GraphQL not needed here |

**Installation:**
No new packages required. All work uses existing dependencies.

## Architecture Patterns

### Recommended Project Structure
```
packages/github/
  server/
    graphql.ts          # NEW: GraphQL mutation/query functions
    outboundSync.ts     # EXTEND: handle isSummary annotations + resolution
    inboundSync.ts      # EXTEND: fetch thread resolution status
    export.ts           # EXTEND: submitBatchReview event parameter
    handler.ts          # EXTEND: new endpoints for review submission + resolution status
  shared/
    types.ts            # EXTEND: Annotation extension types, GraphQL response types
  client/
    threadTree.ts       # EXTEND: resolution status propagation
packages/ui/
  types.ts              # EXTEND: isSummary, summarizesThreadId, isResolved fields
  components/
    AnnotationPanel.tsx  # EXTEND: summarize button, resolved badge, thread nav, filter
    ExportModal.tsx      # EXTEND: Review tab
    SummaryModal.tsx     # NEW: summary creation + thread picker modal
    ThreadNav.tsx        # NEW: thread jump navigation buttons
  hooks/
    useSummary.ts        # NEW: summary creation logic
    useReview.ts         # NEW: review submission logic
    useThreadNav.ts      # NEW: thread navigation state
  utils/
    summaryExport.ts     # NEW: markdown export for summaries
```

### Pattern 1: GraphQL via fetch() (D-33)
**What:** Use standard fetch() with GraphQL query strings, no client libraries
**When to use:** All GitHub GraphQL operations (resolution, status queries)
**Example:**
```typescript
// Source: CONTEXT.md D-33, GitHub GraphQL API docs
async function graphqlRequest<T>(
  query: string,
  variables: Record<string, unknown>,
  token: string
): Promise<T> {
  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Plannotator-Paste-Service',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    // Rate limit handling (D-35)
    const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining');
    const rateLimitReset = response.headers.get('X-RateLimit-Reset');
    if (response.status === 403 && rateLimitRemaining === '0') {
      throw new Error(`rate_limited:${rateLimitReset}`);
    }
    throw new Error(`GitHub GraphQL error ${response.status}: ${await response.text()}`);
  }

  const result = await response.json();
  if (result.errors) {
    throw new Error(`GraphQL error: ${result.errors[0].message}`);
  }
  return result.data as T;
}
```

### Pattern 2: Summary as Regular Annotation with Flags
**What:** Summary annotations are standard Annotation objects with isSummary flag
**When to use:** Summary creation, storage, rendering
**Example:**
```typescript
// Extend existing Annotation type (packages/ui/types.ts)
interface Annotation {
  // ...existing fields
  isSummary?: boolean;           // Marks as thread summary
  summarizesThreadId?: string;   // References thread parent annotation ID
  isResolved?: boolean;          // Thread resolution status (from GitHub)
}
```

### Pattern 3: submitBatchReview Event Extension
**What:** Add optional event parameter to submitBatchReview (currently hardcoded to "COMMENT")
**When to use:** Review tab submission with APPROVE/REQUEST_CHANGES/COMMENT
**Example:**
```typescript
// CRITICAL: submitBatchReview currently hardcodes event: "COMMENT"
// Must add event parameter while preserving backward compatibility
export async function submitBatchReview(
  owner: string,
  repo: string,
  prNumber: number,
  token: string,
  comments: ReviewComment[],
  reviewBody?: string,
  event?: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT'  // NEW parameter
): Promise<any> {
  const body: Record<string, any> = {
    body: reviewBody || 'Plan review exported from Plannotator',
    event: event || 'COMMENT',  // Use parameter, default to COMMENT
  };
  // ... rest unchanged
}
```

### Anti-Patterns to Avoid
- **Modifying existing outbound sync classification for summaries:** Summary annotations should be identified and handled as a special case within the existing outbound sync flow, not requiring a separate endpoint
- **Fetching resolution status via REST API:** The REST API does not expose thread resolution status; must use GraphQL
- **Storing GraphQL thread IDs in annotation objects:** Thread IDs should be fetched on-demand from the comment's node_id, not persisted in the annotation

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| GraphQL client | Full GraphQL client | Inline fetch() with query strings | D-33: no extra libraries, simple mutations/queries |
| Thread ID mapping | Custom thread-to-nodeId cache | Query GitHub REST comment node_id field | REST comments include node_id; map to thread via GraphQL |
| Review event submission | Separate review endpoint | Extend existing submitBatchReview | Already handles batch comments; just needs event parameter |
| Resolution status storage | Separate resolution tracking system | isResolved field on Annotation type | Piggybacks on existing annotation state management |

**Key insight:** The REST API review comments include a `node_id` field. But to get the thread node_id (not the comment node_id), a GraphQL query is needed. The approach is: use GraphQL to query reviewThreads for a PR, which gives thread IDs and their isResolved status in one batch call.

## Common Pitfalls

### Pitfall 1: REST comment node_id vs GraphQL thread ID mismatch
**What goes wrong:** The REST API returns a `node_id` per comment, but `resolveReviewThread` requires the thread's node_id, not the comment's node_id. These are different GraphQL types.
**Why it happens:** Each review comment has its own node_id (PullRequestReviewComment), but threads have a separate node_id (PullRequestReviewThread). You cannot resolve a thread using a comment's node_id.
**How to avoid:** Use a GraphQL query to fetch reviewThreads for the PR. Each thread contains its comments. Match threads to local annotations by correlating comment content/IDs. Cache the thread node_ids during the mapping phase.
**Warning signs:** GraphQL returns "Could not resolve to a node" errors when passing a comment node_id to resolveReviewThread.

### Pitfall 2: submitBatchReview event parameter breaks callers
**What goes wrong:** Adding the event parameter changes the function signature, and existing callers (Phase 4 exportPlanWithAnnotations, Phase 6 outboundSync) don't pass it.
**Why it happens:** TypeScript requires all positional arguments before optional ones.
**How to avoid:** Add event as the LAST optional parameter with default value 'COMMENT'. All existing call sites pass 5 or 6 arguments and won't be affected.
**Warning signs:** Type errors in existing code after modification.

### Pitfall 3: Resolution mutation fails silently for non-maintainers
**What goes wrong:** Users without write access attempt to resolve threads. The mutation fails with 403.
**Why it happens:** Thread resolution requires write access to the repository. Not all PR reviewers have this.
**How to avoid:** Per D-37, use lazy permission check. On first 403, cache "no-resolution-permission" state. Per D-38, summary still posts as reply even when resolution fails. Show specific toast message per D-40.
**Warning signs:** Generic error handling that doesn't distinguish permission errors from other failures.

### Pitfall 4: GraphQL rate limiting differs from REST
**What goes wrong:** GraphQL uses a point-based rate limit (5000 points/hour) not a request-based one. Complex queries cost more points.
**Why it happens:** A single GraphQL query fetching 100 threads with comments costs many more points than a simple mutation.
**How to avoid:** Per D-32, batch in groups of 50 threads. Use `first: 50` pagination in GraphQL queries. Monitor `X-RateLimit-Remaining` header (GraphQL also returns rate limit info in response extensions). Per D-35, use same retry pattern as REST.
**Warning signs:** 403 responses with rate limit headers after only a few requests.

### Pitfall 5: Summary annotations synced as regular comments instead of thread replies
**What goes wrong:** The outbound sync flow posts summaries as new batch review comments on lines, not as replies to the thread's root comment.
**Why it happens:** Summary annotations have blockId and line mapping like regular annotations. The default outbound sync path creates new batch comments.
**How to avoid:** In outbound sync, check `isSummary` flag BEFORE classification. Summary annotations should be routed to the thread reply path (POST /comments/{id}/replies) using the thread parent's GitHub comment ID, not the batch review path.
**Warning signs:** Summaries appear as standalone comments on GitHub instead of as replies in the thread.

### Pitfall 6: Inbound sync doesn't fetch resolution status without GraphQL
**What goes wrong:** The current inbound sync only uses REST API (fetchPRComments). REST does not return thread resolution status.
**Why it happens:** Thread resolution is only available via GraphQL API.
**How to avoid:** During inbound sync (D-25), make an additional GraphQL query to fetch reviewThreads with isResolved status. Merge this data with the REST-fetched comments on the server side before returning to the client.
**Warning signs:** isResolved is always undefined/false after inbound sync.

## Code Examples

### GraphQL: Fetch thread resolution status (batch)
```typescript
// Source: GitHub GraphQL API docs, D-28/D-31/D-32
const REVIEW_THREADS_QUERY = `
  query ReviewThreads($owner: String!, $repo: String!, $prNumber: Int!, $cursor: String) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $prNumber) {
        reviewThreads(first: 50, after: $cursor) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            id
            isResolved
            comments(first: 1) {
              nodes {
                databaseId
              }
            }
          }
        }
      }
    }
  }
`;
```

### GraphQL: Resolve thread mutation
```typescript
// Source: GitHub GraphQL API mutations reference, D-36
const RESOLVE_THREAD_MUTATION = `
  mutation ResolveReviewThread($threadId: ID!) {
    resolveReviewThread(input: { threadId: $threadId }) {
      thread {
        isResolved
      }
    }
  }
`;
```

### Mapping REST comment IDs to GraphQL thread IDs
```typescript
// The GraphQL reviewThreads query returns thread nodes with their first comment's
// databaseId. The REST API uses the same databaseId (the numeric ID part after
// stripping "review_" prefix). This enables mapping:
//
// REST comment ID: "review_12345" -> databaseId: 12345
// GraphQL thread.comments.nodes[0].databaseId: 12345 -> thread.id: "PRT_kwDOA..."
//
// Build a Map<number, { threadNodeId: string, isResolved: boolean }>
// keyed by the first comment's databaseId.
```

### Summary annotation outbound sync flow
```typescript
// In outbound sync, BEFORE classification:
// 1. Separate summary annotations from regular annotations
// 2. For each summary:
//    a. Look up parent annotation's GitHub comment ID from KV
//    b. Post as reply: POST /repos/{owner}/{repo}/pulls/{pr}/comments/{parentId}/replies
//    c. After successful reply, query thread node_id via GraphQL
//    d. Call resolveReviewThread mutation
//    e. If mutation fails, log warning but don't throw (D-11/D-34)
```

### Review tab submission flow
```typescript
// 1. User clicks Approve/Request Changes/Comment in Review tab
// 2. Sync all unsynced annotations via performOutboundSync (D-14)
// 3. Call submitBatchReview with event parameter and optional body text
// 4. Note: submitBatchReview with empty comments[] and just body+event
//    submits a review with no line comments (just the approval/rejection)
// 5. Show success toast (D-16 terminology)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| REST-only PR interaction | REST + GraphQL hybrid | Phase 7 (new) | GraphQL needed only for thread resolution/status |
| Hardcoded COMMENT event | Parameterized review event | Phase 7 (new) | Enables APPROVE/REQUEST_CHANGES from Plannotator |

**Deprecated/outdated:**
- None relevant. GitHub GraphQL v4 is stable and current.

## Open Questions

1. **How to efficiently get thread node_id for resolution after posting summary reply**
   - What we know: REST reply endpoint returns the new comment but not the thread node_id. We need the thread node_id for the resolveReviewThread mutation.
   - What's unclear: Whether we can get the thread node_id from the reply response, or need a separate GraphQL query.
   - Recommendation: After posting the summary reply via REST, use GraphQL to look up the thread by its root comment's databaseId (which we already know). Cache this mapping per sync session to avoid repeated lookups. Alternatively, pre-fetch all thread mappings during outbound sync initialization (one GraphQL call).

2. **REST review comment `node_id` vs thread `node_id`**
   - What we know: REST comments have a `node_id` field. The resolveReviewThread mutation needs a PullRequestReviewThread node_id.
   - What's unclear: Whether there's a GraphQL path from comment node_id to its parent thread.
   - Recommendation: Use the batch GraphQL query approach (fetch all reviewThreads with first comment databaseId) to build the mapping. This is one call per sync, handles all threads, and avoids per-comment lookups.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | bun:test (bundled with Bun) |
| Config file | none (bun:test works out of the box) |
| Quick run command | `bun test packages/github/server/graphql.test.ts` |
| Full suite command | `bun test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| THREAD-01 | Summary annotation creation with isSummary flag | unit | `bun test packages/github/server/outboundSync.test.ts -t "summary"` | Extends existing |
| THREAD-02 | Thread picker identifies threads (annotations with children) | unit | `bun test packages/ui/components/AnnotationPanel.test.tsx` | Extends existing |
| THREAD-03 | Summary synced as thread reply (not batch comment) | unit | `bun test packages/github/server/outboundSync.test.ts -t "summary reply"` | Extends existing |
| THREAD-04 | GraphQL resolveReviewThread mutation | unit | `bun test packages/github/server/graphql.test.ts` | Wave 0 |
| THREAD-05 | submitBatchReview accepts event parameter | unit | `bun test packages/github/server/export.test.ts -t "event"` | Extends existing |
| THREAD-06 | Review submission auto-syncs annotations first | unit | `bun test packages/github/server/handler.test.ts -t "review"` | Extends existing |
| THREAD-07 | Resolution status fetched via GraphQL, stored as isResolved | unit | `bun test packages/github/server/graphql.test.ts -t "resolution status"` | Wave 0 |

### Sampling Rate
- **Per task commit:** `bun test packages/github/server/graphql.test.ts && bun test packages/github/server/outboundSync.test.ts && bun test packages/github/server/export.test.ts`
- **Per wave merge:** `bun test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/github/server/graphql.test.ts` -- covers THREAD-04, THREAD-07 (GraphQL functions)
- [ ] Extend `packages/github/server/outboundSync.test.ts` -- covers THREAD-01, THREAD-03 (summary sync flow)
- [ ] Extend `packages/github/server/export.test.ts` -- covers THREAD-05 (event parameter)

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `packages/github/server/export.ts` -- submitBatchReview hardcodes `event: "COMMENT"`, must be extended
- Codebase analysis: `packages/github/server/outboundSync.ts` -- existing classify+sync pattern to extend for summaries
- Codebase analysis: `packages/github/client/threadTree.ts` -- buildThreadTree already creates nested structures
- Codebase analysis: `packages/ui/types.ts` -- Annotation type with children field, ready for extension
- Codebase analysis: `packages/ui/components/ExportModal.tsx` -- Tab type includes 'github-pr', pattern for adding 'review'
- Codebase analysis: `packages/ui/components/AnnotationPanel.tsx` -- Recursive thread rendering at line 593-612
- GitHub GraphQL API docs: resolveReviewThread and unresolveReviewThread mutations confirmed
- GitHub REST API docs: Review comments include node_id but NOT thread resolution status

### Secondary (MEDIUM confidence)
- GitHub GraphQL: reviewThreads connection on PullRequest with isResolved field and comments subfield -- confirmed via docs fetch
- GitHub GraphQL: PullRequestReviewComment has databaseId field that matches REST numeric ID -- standard GraphQL pattern

### Tertiary (LOW confidence)
- GraphQL rate limit point costs for reviewThreads queries -- exact cost depends on query complexity; needs runtime validation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, extending existing patterns
- Architecture: HIGH -- clear extension points identified in existing code
- Pitfalls: HIGH -- verified via codebase analysis (e.g., hardcoded event in submitBatchReview)
- GraphQL specifics: MEDIUM -- mutation signatures confirmed, but thread-to-comment mapping pattern needs runtime validation

**Research date:** 2026-04-08
**Valid until:** 2026-05-08 (30 days -- GitHub GraphQL API is stable)
