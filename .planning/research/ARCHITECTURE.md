# Architecture Patterns

**Domain:** Plugin architecture for GitHub PR integration in a maintained fork
**Researched:** 2026-04-01

## Recommended Architecture

### High-Level Structure

```
                    Plannotator Core (upstream, unmodified)
                    ┌────────────────────────────────────┐
                    │  packages/server/                   │
                    │    external-annotations.ts  <───────┼──── Extension point
                    │    index.ts (plan server)           │
                    │  packages/ui/                       │
                    │    hooks/, components/, utils/       │
                    │  packages/editor/                   │
                    │    App.tsx                           │
                    │  apps/paste-service/                │
                    │    core/, stores/, targets/          │
                    └────────────────────────────────────┘
                                    │
                         imports from (never reverse)
                                    │
                    ┌────────────────────────────────────┐
                    │  packages/github/ (NEW, fork-only) │
                    │                                    │
                    │  server/                            │
                    │    github-handler.ts                │
                    │    github-api.ts                    │
                    │    comment-sync.ts                  │
                    │    thread-resolver.ts               │
                    │                                    │
                    │  client/                            │
                    │    GitHubProvider.tsx                │
                    │    useGitHubSync.ts                 │
                    │    useGitHubThreads.ts              │
                    │    components/                      │
                    │                                    │
                    │  shared/                            │
                    │    types.ts                         │
                    │    line-mapper.ts                   │
                    └────────────────────────────────────┘
```

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `packages/github/server/github-handler.ts` | HTTP route handler for `/api/github/*` endpoints (sync, PR status) | Plannotator server (registered as middleware), GitHub REST API |
| `packages/github/server/github-api.ts` | Raw fetch wrapper for GitHub API calls, extracted from `paste-service/github/pr.ts` | GitHub REST API, GitHub GraphQL API |
| `packages/github/server/comment-sync.ts` | Bidirectional mapping: GitHub PR comments <-> Plannotator annotations | `github-api.ts`, `line-mapper.ts`, external annotations store |
| `packages/github/server/thread-resolver.ts` | GraphQL mutations for resolving/unresolving review threads | GitHub GraphQL API via `@octokit/graphql` |
| `packages/github/client/GitHubProvider.tsx` | React context providing GitHub state (PR metadata, sync status, thread data) to child components | Plannotator server API, child components via context |
| `packages/github/client/useGitHubSync.ts` | Hook for sync operations (replaces `useGitHubPRSync`) | `GitHubProvider` context, paste service API |
| `packages/github/client/useGitHubThreads.ts` | Hook for thread display + summary annotation creation | `GitHubProvider` context, annotation state |
| `packages/github/shared/line-mapper.ts` | Bidirectional line mapping: markdown line numbers <-> block IDs + offsets | `packages/ui/utils/parser.ts` (block data) |
| `apps/paste-service/` | Existing OAuth, PR creation, ACL enforcement (remains here, not moved) | GitHub API, KV/filesystem storage |

### Data Flow

**Sync from GitHub (inbound):**
```
User clicks "Sync from GitHub"
  -> client/useGitHubSync.ts calls POST /api/github/sync-from
  -> server/github-handler.ts delegates to comment-sync.ts
  -> comment-sync.ts calls github-api.ts to fetch PR comments
  -> comment-sync.ts maps comments to annotations (via line-mapper.ts)
  -> comment-sync.ts posts to /api/external-annotations (existing API)
  -> External annotations SSE stream notifies UI
  -> Plannotator core renders annotations (no core changes needed)
```

**Sync to GitHub (outbound):**
```
User clicks "Sync to GitHub"
  -> client/useGitHubSync.ts calls POST /api/github/sync-to
  -> server/github-handler.ts reads current annotations
  -> comment-sync.ts filters for annotations without githubCommentId
  -> comment-sync.ts maps annotation positions to line numbers (via line-mapper.ts)
  -> github-api.ts creates review comments on GitHub
  -> comment-sync.ts stores githubCommentId mapping
  -> Response confirms N comments synced
```

**Thread resolution (summary annotation):**
```
User creates summary annotation on a thread group
  -> Summary annotation flagged with { isSummary: true, threadRootId: "..." }
  -> On next "Sync to GitHub":
     -> comment-sync.ts posts summary as reply to thread root
     -> thread-resolver.ts calls resolveReviewThread GraphQL mutation
     -> Thread appears resolved on GitHub
```

## Patterns to Follow

### Pattern 1: External Annotations as Plugin Extension Point

**What:** Use the existing `/api/external-annotations` API to inject GitHub comments into the Plannotator UI. This is the primary mechanism for inbound sync.

**When:** Every time GitHub comments need to appear in Plannotator.

**Why:** The external annotations system already handles SSE broadcasting, snapshot polling, CRUD operations, and source-based filtering. GitHub comments are just another `source` value.

**Example:**
```typescript
// In comment-sync.ts -- posting GitHub comments as external annotations
async function syncFromGitHub(prComments: PRComment[], serverBaseUrl: string) {
  const annotations = prComments.map(comment => ({
    source: "github-pr",
    blockId: mapLineToBlock(comment.line, blocks),
    type: "COMMENT",
    text: comment.body,
    originalText: comment.line ? `[Line ${comment.line}]` : "[General comment]",
    author: comment.author.username,
    // Store GitHub metadata for bidirectional tracking
    metadata: {
      githubCommentId: comment.id,
      githubUrl: comment.github_url,
      avatarUrl: comment.author.avatar,
      inReplyToId: comment.in_reply_to_id,
    }
  }));

  // Use batch API -- single POST for all comments
  await fetch(`${serverBaseUrl}/api/external-annotations`, {
    method: "POST",
    body: JSON.stringify({ annotations }),
  });
}
```

### Pattern 2: Handler Factory Pattern (Server-Side)

**What:** Create GitHub route handlers using the same factory pattern as `createExternalAnnotationHandler`.

**When:** Adding any new server-side endpoints.

**Why:** Consistent with codebase conventions. Returns `Response | null` so the handler can be chained with other handlers in the server's request routing.

**Example:**
```typescript
// In github-handler.ts
export interface GitHubHandler {
  handle: (req: Request, url: URL) => Promise<Response | null>;
}

export function createGitHubHandler(config: GitHubConfig): GitHubHandler {
  return {
    async handle(req, url) {
      if (url.pathname === "/api/github/sync-from" && req.method === "POST") {
        // ... sync logic
        return Response.json({ synced: count });
      }
      if (url.pathname === "/api/github/sync-to" && req.method === "POST") {
        // ... sync logic
        return Response.json({ synced: count });
      }
      return null; // Not handled, pass through
    }
  };
}
```

### Pattern 3: React Context for Plugin State

**What:** Wrap GitHub-specific state in a React context provider that mounts above the existing App component tree.

**When:** The client needs GitHub PR state (metadata, sync status, thread data).

**Why:** Avoids prop drilling through core components. Core components don't need to know about GitHub -- only GitHub-specific components consume the context.

**Integration point:** The editor's `App.tsx` needs ONE change -- wrapping with `<GitHubProvider>`. This is the only core file modification needed on the client side.

### Pattern 4: ID-Based Deduplication

**What:** Track which annotations have been synced to/from GitHub using stable IDs.

**When:** Every sync operation.

**Why:** Without ID tracking, repeated syncs create duplicate comments. Each annotation stores its `githubCommentId` (if synced to GitHub) and each imported comment has a deterministic annotation ID (`github-pr-${commentId}`).

## Anti-Patterns to Avoid

### Anti-Pattern 1: Modifying Core Package Files

**What:** Adding GitHub-specific code directly to `packages/ui/`, `packages/server/`, or `packages/editor/`.

**Why bad:** Every modification to an upstream file creates a potential merge conflict when rebasing on upstream. The more files touched, the more rebases cost.

**Instead:** Add new files in `packages/github/`. Import from core packages. Export hooks/components that core can optionally use. The only core modification should be the context provider wrapper in App.tsx.

### Anti-Pattern 2: Storing GitHub State in Annotation Fields

**What:** Overloading existing `Annotation` type fields (like `images` or `startMeta`) with GitHub metadata.

**Why bad:** The current `useGitHubPRSync.ts` already does this -- it stores avatar URLs in the `images` array and zeros out `startMeta`/`endMeta`. This is fragile, confuses the type system, and breaks if core code validates these fields.

**Instead:** Use the external annotations API's `metadata` field or extend the storable annotation type in `packages/github/shared/types.ts` with properly typed GitHub fields. The external annotation store supports arbitrary fields beyond the base `StorableAnnotation` shape.

### Anti-Pattern 3: Polling for Sync Status

**What:** Using `setInterval` to continuously poll GitHub for new comments.

**Why bad:** The current `useGitHubPRSync` polls every 5 seconds. This wastes API rate limit, creates unnecessary network traffic, and the manual sync design decision explicitly rejected automatic sync.

**Instead:** Sync only when the user clicks a button. Show a "last synced" timestamp so the user knows the freshness of the data.

### Anti-Pattern 4: Bifurcating the paste-service handler

**What:** Adding more GitHub-specific routes to `apps/paste-service/core/handler.ts`.

**Why bad:** The handler is already 560+ lines with OAuth, PR creation, presence, and paste routes all mixed together. Adding sync endpoints here makes it unmaintainable and increases merge conflict surface.

**Instead:** Keep existing paste-service routes for OAuth and PR creation (they work, don't refactor what isn't broken). Add new sync routes in `packages/github/server/github-handler.ts` which gets registered in the Plannotator server (not the paste service).

## Scalability Considerations

| Concern | At 1 PR | At 10 PRs | At 100+ comments |
|---------|---------|-----------|-------------------|
| GitHub API rate limits | No concern (5000/hr for authenticated) | No concern | May need pagination. REST comments endpoint is paginated at 30/page by default, set `per_page=100`. |
| Annotation rendering | No concern | N/A (one PR at a time) | May slow annotation panel. Consider virtual list or collapsible threads. |
| Line mapping accuracy | High accuracy | N/A | Still per-comment, no scaling issue. But if plan is modified after PR creation, ALL mappings may be stale. |
| Sync timing | Instant | N/A | May take 2-3 seconds for 100+ comments due to sequential API calls. Show progress indicator. |

## Sources

- Existing codebase: `packages/server/external-annotations.ts` (handler pattern, SSE broadcasting)
- Existing codebase: `packages/ui/hooks/useGitHubPRSync.ts` (current implementation, anti-patterns to fix)
- Existing codebase: `apps/paste-service/core/handler.ts` (current route structure, OAuth flow)
- GitHub REST API: PR comments threading via `in_reply_to_id`
- GitHub GraphQL: `resolveReviewThread`, `PullRequestReviewThread` objects
