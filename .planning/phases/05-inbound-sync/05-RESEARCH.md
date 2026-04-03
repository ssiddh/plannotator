# Phase 5: Inbound Sync - Research

**Researched:** 2026-04-02
**Domain:** GitHub REST API inbound comment sync, React polling hooks, annotation threading
**Confidence:** HIGH

## Summary

Phase 5 implements the "Sync from GitHub" feature: importing PR review comments and issue comments into Plannotator as positioned annotations with author attribution, avatar display, thread grouping, and deduplication. The existing codebase provides substantial infrastructure -- `useGitHubPRSync` hook (157 lines, needs extension), `fetchPRComments()` server function (needs pagination), bidirectional KV mapping (`syncMappings.ts`), and line-to-block mapping (`lineMapper.ts`). The primary work is extending these existing pieces, adding the server-side sync endpoint with pagination and deduplication, building the toolbar sync button with badge, and updating the AnnotationPanel to render threaded GitHub comments.

The GitHub REST API returns review comments with `in_reply_to_id` for flat threading (one level only -- replies to replies are not supported per GitHub docs). The `since` query parameter enables incremental fetching (only comments updated after a given ISO 8601 timestamp), and `per_page` supports up to 100 results per page (default 30). Both review comments and issue comments endpoints support pagination via `Link` header and `page`/`per_page` params. Draft/pending review comments are NOT returned by the review comments listing endpoint (only submitted reviews), which naturally satisfies D-19.

**Primary recommendation:** Extend the existing server-side `fetchPRComments()` with pagination loops and `since` filtering, create a new `/api/pr/{pasteId}/sync/inbound` endpoint that orchestrates fetching + deduplication + KV mapping, then extend the client-side `useGitHubPRSync` hook with Page Visibility API polling, thread tree building, and error retry logic.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: Sync button lives in Toolbar (next to Approve/Deny buttons)
- D-02: Toolbar button shows badge with new comment count
- D-03: Button disabled with tooltip when no PR exists ("Create a PR first to sync comments")
- D-04: Nested annotations (parent with children field) -- extend Annotation type with optional `children: Annotation[]`
- D-05: Hybrid approach - auto-poll every 5 minutes + manual button
- D-06: Polling only when tab visible (Page Visibility API)
- D-07: Inline avatar (24px) next to comment text in annotation panel
- D-08: Merge both - no conflict modal; GitHub comments marked with source: "github-pr" (read-only)
- D-09: Fetch all pages upfront on sync operation
- D-10: Link on author username to open GitHub comment in new tab
- D-11: Absolute timestamp format ('Apr 3, 2:30 PM')
- D-12: Auto-retry 3x with exponential backoff (1s, 2s, 4s)
- D-13: Retry after rate limit reset using X-RateLimit-Reset header
- D-14: Import partial results + auto-retry failed pages
- D-15: Clear state, redirect to OAuth on token expiry
- D-16: Update annotation text on sync when comment edited (detect via updated_at)
- D-17: Remove annotation on next sync when comment deleted on GitHub
- D-18: Import unmappable lines as global annotations
- D-19: Published comments only (default GitHub API behavior)
- D-20: Use bidirectional KV mapping from Phase 3 for deduplication
- D-21: Review comments mapped to lines, issue comments as global

### Claude's Discretion
- Sync button icon choice (refresh icon, sync arrows, cloud download)
- Badge styling specifics (color, size, position)
- Nested annotation indentation depth (16px, 24px, etc.)
- Avatar fallback image/initials if load fails
- Retry delay fine-tuning (1s/2s/4s suggested but adjustable)
- Error toast duration and auto-dismiss behavior
- Global annotation placement in panel (top section, bottom section, or mixed chronologically)
- Timestamp formatting locale (browser default or configurable)

### Deferred Ideas (OUT OF SCOPE)
- Real-time sync via webhooks
- Comment reactions (emoji) sync
- Resolved thread status display (Phase 7)
- Outbound sync (Phase 6)
- Thread summary annotations (Phase 7)
- PR review submission from Plannotator (Phase 7)
- Automatic AI-generated thread summaries
- Multi-repo support
- Silent token refresh (refresh_token flow)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SYNC-IN-01 | User can trigger "Sync from GitHub" to import PR comments | Toolbar sync button (D-01), `syncFromGitHub()` stub in GitHubProvider ready for implementation, new server endpoint `/api/pr/{pasteId}/sync/inbound` |
| SYNC-IN-02 | Review comments (line-level) imported as annotations with correct block mapping | `mapLineToBlock()` in lineMapper.ts provides binary search mapping; `fetchPRComments()` already extracts `comment.line`; D-21 specifies review comments map to lines |
| SYNC-IN-03 | Issue comments (general) imported as global annotations | `fetchPRComments()` already fetches issue comments separately with `comment_type: "issue"`; D-21 specifies these become `blockId: "global"` |
| SYNC-IN-04 | Comments from all pages fetched (handle 30+ comments) | GitHub API supports `per_page` up to 100 and `Link` header pagination; D-09 specifies fetch all pages upfront |
| SYNC-IN-05 | Comment replies grouped by thread in Plannotator UI | `in_reply_to_id` field on review comments enables flat thread tree building; D-04 specifies `children: Annotation[]` extension |
| SYNC-IN-06 | Thread display shows all replies in chronological order | Comments sorted by `created_at` within each thread; GitHub REST API returns comments chronologically by default |
| SYNC-IN-07 | GitHub user avatars displayed in annotation panel | `comment.user.avatar_url` already extracted in `fetchPRComments()`; stored in `annotation.images[0]`; D-07 specifies 24px inline avatar |
| SYNC-IN-08 | Annotation source field tracks GitHub origin | Existing hook already sets `source: "github-pr"` on converted annotations; AnnotationPanel already renders GitHub PR badge for this source |
| SYNC-IN-09 | Duplicate comments prevented (skip already-imported comment IDs) | `getAnnotationId(pasteId, commentId, kv)` from syncMappings.ts provides O(1) lookup; D-20 specifies this pattern |
</phase_requirements>

## Standard Stack

### Core (Already in Codebase)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Raw `fetch` with `githubRequest()` | N/A | GitHub API calls | Existing pattern in `packages/github/server/pr.ts`; no Octokit needed |
| React hooks + context | 18.x | Client-side state and polling | `useGitHubPRSync` hook and `GitHubProvider` context already exist |
| Cloudflare Workers KV (typed as `any`) | N/A | Bidirectional mapping, sync state | `syncMappings.ts` and `syncState.ts` already use this |

### Supporting (No New Dependencies)

| Library | Purpose | When to Use |
|---------|---------|-------------|
| Page Visibility API (browser native) | Pause/resume polling when tab hidden/visible | D-05/D-06: auto-poll only when tab is visible |
| `Intl.DateTimeFormat` (browser native) | Absolute timestamp formatting | D-11: 'Apr 3, 2:30 PM' format |

**No new npm packages required.** All functionality builds on existing codebase patterns and browser APIs.

## Architecture Patterns

### Data Flow

```
1. User clicks "Sync from GitHub" (or auto-poll fires)
           |
2. Client: POST /api/pr/{pasteId}/sync/inbound
           |
3. Server: Validate token (existing middleware)
           |
4. Server: Fetch all pages of review comments + issue comments from GitHub API
   (per_page=100, follow Link header pagination, use `since` for incremental)
           |
5. Server: For each comment:
   a. Check KV mapping (getAnnotationId) -- skip if already imported
   b. Check updated_at for existing comments -- update text if edited (D-16)
   c. Detect deleted comments (present in KV but absent from API response) (D-17)
           |
6. Server: Return { newAnnotations[], updatedAnnotations[], deletedAnnotationIds[], syncState }
           |
7. Client: Build thread tree from flat comments (group by in_reply_to_id)
           |
8. Client: Merge into annotation state, update badge count, show toast
```

### Server Endpoint Design

New route: `GET /api/pr/{pasteId}/sync/inbound`

**Why GET not POST:** This is a read-from-GitHub operation. The server fetches, deduplicates, and returns data. State mutation (KV writes) is a side effect of the sync.

**Response shape:**
```typescript
interface InboundSyncResponse {
  annotations: PRCommentAnnotation[]; // New/updated annotations ready for client
  deletedIds: string[];               // Annotation IDs to remove (D-17)
  stats: {
    total: number;      // Total GitHub comments found
    new: number;        // Newly imported
    updated: number;    // Edited comments updated (D-16)
    deleted: number;    // Deleted from GitHub (D-17)
    skipped: number;    // Already imported, unchanged
  };
  syncTimestamp: number;  // Server timestamp for next incremental sync
}

interface PRCommentAnnotation {
  id: string;            // Stable annotation ID (from KV or newly generated)
  githubCommentId: string;
  blockId: string;       // From mapLineToBlock or "global"
  type: "COMMENT" | "GLOBAL_COMMENT";
  text: string;          // Comment body
  originalText: string;  // "[Line N]" or "[General comment]"
  author: string;        // GitHub username
  avatarUrl: string;     // GitHub avatar URL
  githubCommentUrl: string; // html_url for D-10
  createdAt: string;     // ISO 8601
  updatedAt: string;     // ISO 8601 for edit detection
  inReplyToId: string | null; // For thread building
  commentType: "review" | "issue";
}
```

### Thread Tree Building (Client-Side)

Thread building happens client-side after receiving flat annotations from the server. This keeps the server response simple and cacheable.

```typescript
function buildThreadTree(annotations: PRCommentAnnotation[]): Annotation[] {
  const map = new Map<string, Annotation>();
  const roots: Annotation[] = [];

  // First pass: convert all to Annotation objects
  for (const ann of annotations) {
    map.set(ann.githubCommentId, toAnnotation(ann));
  }

  // Second pass: link children to parents
  for (const ann of annotations) {
    const annotation = map.get(ann.githubCommentId)!;
    if (ann.inReplyToId) {
      const parent = map.get(ann.inReplyToId);
      if (parent) {
        parent.children = parent.children || [];
        parent.children.push(annotation);
      } else {
        roots.push(annotation); // Orphaned reply, treat as root
      }
    } else {
      roots.push(annotation);
    }
  }

  // Sort children chronologically within each thread (D-06)
  for (const root of roots) {
    if (root.children) {
      root.children.sort((a, b) => a.createdA - b.createdA);
    }
  }

  return roots;
}
```

**Critical constraint from REQUIREMENTS.md:** "Nested thread replies beyond 1 level" is explicitly out of scope. GitHub REST API only supports flat threading (`in_reply_to_id` but no nested replies). The thread tree will always be max 2 levels deep (root + direct replies). UI-SPEC D-04 specifies max depth of 3 levels with deeper replies clamped, but in practice this won't be needed for the REST API's flat threading model.

### Pagination Loop Pattern

```typescript
async function fetchAllPRComments(
  owner: string,
  repo: string,
  prNumber: number,
  token: string,
  since?: string  // ISO 8601 for incremental sync
): Promise<{ comments: any[]; failedPages: number[] }> {
  const allComments: any[] = [];
  const failedPages: number[] = [];
  let page = 1;

  while (true) {
    let url = `${GITHUB_API}/repos/${owner}/${repo}/pulls/${prNumber}/comments?per_page=100&page=${page}`;
    if (since) url += `&since=${since}`;

    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
        },
      });

      if (response.status === 401) {
        throw new TokenExpiredError(); // D-15
      }
      if (response.status === 403) {
        const resetTime = response.headers.get("X-RateLimit-Reset");
        throw new RateLimitError(resetTime); // D-13
      }
      if (!response.ok) {
        failedPages.push(page); // D-14: partial failure
        page++;
        continue;
      }

      const comments = await response.json();
      allComments.push(...comments);

      // Check Link header for next page
      const linkHeader = response.headers.get("Link");
      if (!linkHeader || !linkHeader.includes('rel="next"')) {
        break;
      }
      page++;
    } catch (err) {
      if (err instanceof TokenExpiredError || err instanceof RateLimitError) {
        throw err; // Propagate auth/rate errors
      }
      failedPages.push(page); // D-14: network error, record failed page
      // Try to continue to next page
      page++;
      // Safety: if we've failed 3 consecutive pages, stop
      if (failedPages.length >= 3) break;
    }
  }

  return { comments: allComments, failedPages };
}
```

### Annotation Type Extension

```typescript
// packages/ui/types.ts -- extend Annotation interface
export interface Annotation {
  // ... existing fields ...
  children?: Annotation[];        // NEW: nested thread replies (D-04)
  githubCommentUrl?: string;      // NEW: link to GitHub comment (D-10)
}
```

### PRComment Type Extension

```typescript
// packages/github/shared/types.ts -- extend PRComment interface
export interface PRComment {
  // ... existing fields ...
  updated_at: string;           // NEW: for edit detection (D-16)
  in_reply_to_id?: string;      // NEW: for threading (SYNC-IN-05)
}
```

### Files to Modify/Create

| File | Action | Purpose |
|------|--------|---------|
| `packages/ui/types.ts` | Modify | Add `children?` and `githubCommentUrl?` to Annotation |
| `packages/github/shared/types.ts` | Modify | Add `updated_at`, `in_reply_to_id` to PRComment |
| `packages/github/server/pr.ts` | Modify | Add pagination to `fetchPRComments()`, extract `in_reply_to_id` and `updated_at` |
| `packages/github/server/handler.ts` | Modify | Add `/api/pr/{pasteId}/sync/inbound` route |
| `packages/github/server/inboundSync.ts` | Create | Orchestration logic: fetch + deduplicate + KV mapping + deletion detection |
| `packages/github/client/useGitHubPRSync.ts` | Modify | Page Visibility polling, thread tree building, retry logic, badge count |
| `packages/github/client/GitHubProvider.tsx` | Modify | Implement `syncFromGitHub()` action (currently a stub) |
| `packages/ui/components/ToolbarButtons.tsx` | Modify | Add `SyncButton` export |
| `packages/ui/components/AnnotationPanel.tsx` | Modify | Recursive thread rendering, avatar display, GitHub username links, read-only indicator |
| `packages/editor/App.tsx` | Modify | Wire SyncButton into toolbar, pass sync state |

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Pagination link parsing | Custom regex on Link header | Simple `includes('rel="next"')` check | GitHub Link headers are predictable; full RFC 5988 parsing is overkill |
| Date formatting | Custom date formatting function | `Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })` | Browser-native, locale-aware, handles all edge cases |
| Exponential backoff | Custom retry loop | Simple `setTimeout` chain with factor-of-2 delays | Only 3 retries needed (D-12), not worth a library |
| Thread tree building | Server-side tree construction | Client-side `Map` + two-pass algorithm | Keep server response flat/simple; tree building is trivial with `in_reply_to_id` |

**Key insight:** This phase requires no new npm dependencies. All building blocks exist in the codebase or browser APIs.

## Common Pitfalls

### Pitfall 1: GitHub API Returns Pending Review Comments
**What goes wrong:** Draft/pending review comments appearing in sync results before the reviewer intended.
**Why it happens:** Misunderstanding of which endpoint returns what.
**How to avoid:** The `GET /repos/{owner}/{repo}/pulls/{pr}/comments` endpoint only returns comments from submitted reviews. Pending review comments are NOT included. D-19 is satisfied by default API behavior -- no filtering needed.
**Warning signs:** If comments appear that shouldn't be visible yet, you're likely using a different endpoint.
**Confidence:** HIGH -- verified against GitHub REST API docs.

### Pitfall 2: `in_reply_to_id` Is Only for Review Comments
**What goes wrong:** Attempting to build thread trees from issue comments.
**Why it happens:** Issue comments (`/issues/{pr}/comments`) do NOT have `in_reply_to_id`. Only review comments (`/pulls/{pr}/comments`) support threading.
**How to avoid:** Thread tree building should only apply to review comments. Issue comments are always root-level global annotations.
**Warning signs:** Null/undefined `in_reply_to_id` on all issue comments.

### Pitfall 3: Rate Limit Headers on 403 Responses
**What goes wrong:** Treating all 403s as auth failures when they might be rate limits.
**Why it happens:** GitHub returns 403 for both "forbidden" and "rate limit exceeded".
**How to avoid:** Check `X-RateLimit-Remaining` header. If it's `0`, the 403 is a rate limit. Also check for `X-RateLimit-Reset` (Unix timestamp for when the limit resets).
**Warning signs:** Sudden 403s after many successful requests.

### Pitfall 4: Review Comment `line` vs `original_line`
**What goes wrong:** Mapping to wrong block because the comment used `original_line` (from the original diff) instead of `line` (from the current file).
**Why it happens:** GitHub tracks both the original diff position and the current position. After force-pushes, `line` may differ from `original_line`.
**How to avoid:** Use `comment.line` first (current position), fall back to `comment.original_line` if `line` is null. The existing `fetchPRComments()` already does: `line: comment.line || comment.original_line`. This is correct.
**Warning signs:** Annotations appearing on wrong blocks after PR updates.

### Pitfall 5: KV Eventual Consistency
**What goes wrong:** Race condition where two rapid syncs create duplicate annotations because KV hasn't propagated the first sync's mappings.
**Why it happens:** Cloudflare Workers KV has eventual consistency (writes may take up to 60 seconds to propagate globally).
**How to avoid:** The sync button should be disabled during an active sync operation. The client should maintain a local Set of known comment IDs as a secondary dedup guard. Also, the server should use `getAnnotationId()` check but also track newly-created mappings within the same sync operation.
**Warning signs:** Duplicate annotations appearing after rapid manual sync clicks.

### Pitfall 6: GitHub Comment Body Contains Markdown
**What goes wrong:** GitHub comment bodies are raw Markdown but Plannotator annotation `text` is displayed as plain text.
**Why it happens:** The `comment.body` field from GitHub API is raw Markdown (headings, code blocks, links, etc.).
**How to avoid:** Store the raw Markdown in `annotation.text`. The AnnotationPanel renders with `whitespace-pre-wrap` which handles basic formatting. For a richer display, the threaded annotation rendering could use a lightweight markdown renderer, but this is a discretionary enhancement, not a requirement.
**Warning signs:** Markdown syntax visible as raw text in annotation cards.

### Pitfall 7: Avatar URL Expiry
**What goes wrong:** GitHub avatar URLs are served from `avatars.githubusercontent.com` which includes no cache-busting. If a user changes their avatar, the old URL may still be cached.
**Why it happens:** Browser caching of the avatar image.
**How to avoid:** This is a minor issue. The avatar URL from the API is always current. The browser will eventually refresh it. No action needed.

## Code Examples

### Sync Button Component (UI-SPEC compliant)

```tsx
// packages/ui/components/ToolbarButtons.tsx -- new export
interface SyncButtonProps {
  onClick: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  newCount?: number;
  title?: string;
  disabledTitle?: string;
}

export const SyncButton: React.FC<SyncButtonProps> = ({
  onClick,
  disabled = false,
  isLoading = false,
  newCount = 0,
  title = "Sync from GitHub",
  disabledTitle = "Create a PR first to sync comments",
}) => (
  <button
    onClick={onClick}
    disabled={disabled || isLoading}
    className={`relative p-1.5 md:px-2.5 md:py-1 rounded-md text-xs font-semibold transition-all ${
      disabled
        ? "opacity-50 cursor-not-allowed bg-muted text-muted-foreground"
        : "bg-accent/15 text-accent hover:bg-accent/25 border border-accent/30"
    }`}
    title={disabled ? disabledTitle : title}
  >
    {/* Sync icon - 16x16 circular arrows */}
    <svg
      className={`w-4 h-4 md:hidden ${isLoading ? "animate-spin" : ""}`}
      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    </svg>
    <span className="hidden md:inline">
      {isLoading ? "Syncing..." : "Sync"}
    </span>
    {/* Badge */}
    {newCount > 0 && !isLoading && (
      <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center w-4 h-4 rounded-full bg-accent text-accent-foreground text-[10px] font-mono font-semibold">
        {newCount > 9 ? "9+" : newCount}
      </span>
    )}
  </button>
);
```

### Page Visibility Polling Hook Pattern

```typescript
// Inside useGitHubPRSync - visibility-aware polling
useEffect(() => {
  if (!enabled || !prMetadata || !token) return;

  let intervalId: ReturnType<typeof setInterval> | null = null;

  const startPolling = () => {
    if (intervalId) clearInterval(intervalId);
    intervalId = setInterval(fetchComments, pollInterval);
  };

  const stopPolling = () => {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };

  const handleVisibilityChange = () => {
    if (document.hidden) {
      stopPolling();
    } else {
      fetchComments(); // Immediate sync on tab focus
      startPolling();
    }
  };

  // Start if tab is visible
  if (!document.hidden) {
    startPolling();
  }

  document.addEventListener("visibilitychange", handleVisibilityChange);

  return () => {
    stopPolling();
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  };
}, [enabled, prMetadata, token, pollInterval, fetchComments]);
```

### Absolute Timestamp Formatting (D-11)

```typescript
function formatAbsoluteTimestamp(isoString: string): string {
  const date = new Date(isoString);
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
  // Output: "Apr 3, 2:30 PM" (locale-dependent)
}
```

### Retry with Exponential Backoff (D-12)

```typescript
async function fetchWithRetry(
  fn: () => Promise<Response>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fn();
      if (response.ok) return response;

      // Rate limit -- don't retry, propagate
      if (response.status === 403) {
        const remaining = response.headers.get("X-RateLimit-Remaining");
        if (remaining === "0") {
          throw new RateLimitError(response.headers.get("X-RateLimit-Reset"));
        }
      }

      // Token expired -- don't retry, propagate
      if (response.status === 401) {
        throw new TokenExpiredError();
      }

      lastError = new Error(`HTTP ${response.status}`);
    } catch (err) {
      if (err instanceof RateLimitError || err instanceof TokenExpiredError) {
        throw err;
      }
      lastError = err instanceof Error ? err : new Error(String(err));
    }

    if (attempt < maxRetries - 1) {
      await new Promise(r => setTimeout(r, baseDelay * Math.pow(2, attempt)));
    }
  }
  throw lastError || new Error("Max retries exceeded");
}
```

## API Reference

### GitHub REST API Endpoints Used

| Endpoint | Method | Purpose | Pagination |
|----------|--------|---------|------------|
| `/repos/{owner}/{repo}/pulls/{pr}/comments` | GET | List review comments (line-level, with `in_reply_to_id`) | `page`, `per_page` (max 100), `Link` header |
| `/repos/{owner}/{repo}/issues/{pr}/comments` | GET | List issue comments (general, no threading) | `page`, `per_page` (max 100), `Link` header |

### Review Comments Response Fields (Used)

| Field | Type | Usage |
|-------|------|-------|
| `id` | number | Unique comment ID (prefixed as `review_{id}` in PRComment) |
| `user.login` | string | Author username |
| `user.avatar_url` | string | Author avatar |
| `body` | string | Comment text (Markdown) |
| `html_url` | string | Link to comment on GitHub (D-10) |
| `line` | number/null | Current file line number |
| `original_line` | number/null | Original diff line number (fallback) |
| `created_at` | string | ISO 8601 creation timestamp |
| `updated_at` | string | ISO 8601 last update (for edit detection, D-16) |
| `in_reply_to_id` | number/null | Parent comment ID for threading |
| `path` | string | File path in PR |

### Issue Comments Response Fields (Used)

| Field | Type | Usage |
|-------|------|-------|
| `id` | number | Unique comment ID (prefixed as `issue_{id}` in PRComment) |
| `user.login` | string | Author username |
| `user.avatar_url` | string | Author avatar |
| `body` | string | Comment text (Markdown) |
| `html_url` | string | Link to comment on GitHub |
| `created_at` | string | ISO 8601 creation timestamp |
| `updated_at` | string | ISO 8601 last update |

### Rate Limit Headers

| Header | Value | Usage |
|--------|-------|-------|
| `X-RateLimit-Remaining` | number | If `0`, the request was rate limited |
| `X-RateLimit-Reset` | Unix timestamp | When the rate limit resets (D-13) |
| `X-RateLimit-Limit` | number | Total allowed requests per hour (5000 for authenticated) |

### Incremental Sync via `since` Parameter

Both endpoints accept `since` (ISO 8601 timestamp) to fetch only comments updated after that time. Use `syncState.lastSyncTimestamp` (converted to ISO 8601) for incremental fetches. This significantly reduces API calls and response size on subsequent syncs.

**Important caveat:** The `since` parameter returns comments *updated* after the timestamp, not *created*. This means edited old comments will appear in incremental results, which is correct behavior for D-16 (edit detection).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Bun test (built-in) |
| Config file | none (Bun test uses defaults) |
| Quick run command | `bun test packages/github/` |
| Full suite command | `bun test` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SYNC-IN-01 | Sync button triggers import | integration | Manual: click sync button, verify annotations appear | N/A (UI) |
| SYNC-IN-02 | Review comments map to correct blocks | unit | `bun test packages/github/client/lineMapper.test.ts` | Likely exists from Phase 3 |
| SYNC-IN-03 | Issue comments become global annotations | unit | `bun test packages/github/server/inboundSync.test.ts` | Wave 0 |
| SYNC-IN-04 | Pagination handles 30+ comments | unit | `bun test packages/github/server/inboundSync.test.ts` | Wave 0 |
| SYNC-IN-05 | Thread tree building groups replies | unit | `bun test packages/github/client/threadTree.test.ts` | Wave 0 |
| SYNC-IN-06 | Thread replies in chronological order | unit | `bun test packages/github/client/threadTree.test.ts` | Wave 0 |
| SYNC-IN-07 | Avatars displayed | integration | Manual: verify avatar rendering | N/A (UI) |
| SYNC-IN-08 | Source field set to "github-pr" | unit | `bun test packages/github/server/inboundSync.test.ts` | Wave 0 |
| SYNC-IN-09 | Deduplication via KV mapping | unit | `bun test packages/github/server/inboundSync.test.ts` | Wave 0 |

### Sampling Rate

- **Per task commit:** `bun test packages/github/`
- **Per wave merge:** `bun test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `packages/github/server/inboundSync.test.ts` -- covers SYNC-IN-03, SYNC-IN-04, SYNC-IN-08, SYNC-IN-09
- [ ] `packages/github/client/threadTree.test.ts` -- covers SYNC-IN-05, SYNC-IN-06
- [ ] Mock KV implementation for testing deduplication logic

## Open Questions

1. **Toast notification system**
   - What we know: Phase 4 established a toast pattern using `ToastPayload` from `packages/ui/utils/callback.ts`. The `useGitHubPRExport` hook receives a `setToast` callback prop.
   - What's unclear: Whether a global toast context exists or if toast state is passed through props from App.tsx.
   - Recommendation: Follow the same pattern as `useGitHubPRExport` -- accept `setToast` as a parameter to the sync hook.

2. **Server-side vs client-side deduplication**
   - What we know: KV mappings are server-side. The sync endpoint can do deduplication. But the client also needs to know which annotations are new vs existing.
   - What's unclear: Should the server return only new/changed annotations (server does all dedup), or return all annotations and let the client merge?
   - Recommendation: Server does deduplication and returns categorized results (new, updated, deleted). Client just applies the diff. This is more efficient and keeps the client simple.

3. **How `blocks` are passed to the server for line mapping**
   - What we know: `mapLineToBlock()` is currently a client-side function that requires the parsed `Block[]` array.
   - What's unclear: The server doesn't have the parsed blocks. Either blocks need to be sent in the request, or line mapping happens client-side.
   - Recommendation: Do line mapping client-side. The server returns raw `line` numbers with each comment, and the client uses `mapLineToBlock()` to assign `blockId`. This avoids sending blocks to the server and reuses the existing client-side mapper.

## Sources

### Primary (HIGH confidence)
- `packages/github/client/useGitHubPRSync.ts` -- existing sync hook (157 lines)
- `packages/github/server/pr.ts` -- `fetchPRComments()`, `githubRequest()` 
- `packages/github/server/syncMappings.ts` -- bidirectional KV mapping functions
- `packages/github/server/syncState.ts` -- sync state tracking
- `packages/github/client/lineMapper.ts` -- line-to-block binary search
- `packages/github/client/GitHubProvider.tsx` -- context with `syncFromGitHub()` stub
- `packages/github/server/handler.ts` -- route handler composition pattern
- `packages/ui/components/ToolbarButtons.tsx` -- FeedbackButton/ApproveButton patterns
- `packages/ui/components/AnnotationPanel.tsx` -- annotation card rendering
- `packages/ui/types.ts` -- Annotation interface
- `packages/github/shared/types.ts` -- PRComment, PRMetadata types
- GitHub REST API docs: Pull Request Comments (verified 2026-04-02)
- GitHub REST API docs: Issue Comments (verified 2026-04-02)

### Secondary (MEDIUM confidence)
- `.planning/research/STACK.md` -- original stack research confirming raw fetch pattern
- `.planning/research/PITFALLS.md` -- `in_reply_to_id` flat threading limitation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries/patterns already exist in codebase, no new dependencies
- Architecture: HIGH -- data flow follows established patterns (handler.ts composition, hook + context, existing API endpoints)
- Pitfalls: HIGH -- GitHub API behavior verified against official docs; KV eventual consistency is well-documented
- API reference: HIGH -- endpoints and fields verified against current GitHub REST API documentation

**Research date:** 2026-04-02
**Valid until:** 2026-05-02 (stable -- GitHub REST API v3 is mature, codebase patterns are established)
