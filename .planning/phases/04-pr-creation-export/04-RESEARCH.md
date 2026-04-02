# Phase 4: PR Creation & Export - Research

**Researched:** 2026-04-02
**Domain:** GitHub REST API (Pull Request Reviews), React UI integration, annotation-to-comment mapping
**Confidence:** HIGH

## Summary

Phase 4 extends the existing `exportToPR()` function (which creates branch, commit, and PR) with annotation export as batch review comments and PR metadata persistence. The codebase already has ~80% of the server infrastructure: `packages/github/server/pr.ts` handles PR creation via GitHub's Git Data API, `packages/github/server/handler.ts` routes `/api/pr/create`, and Phase 3 delivered sync mappings + stable IDs + sync state tracking. The primary new work is (1) a `submitBatchReview()` function using `POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews`, (2) a "GitHub PR" tab in the existing `ExportModal.tsx`, and (3) rollback logic for partial failures.

The GitHub Pull Request Reviews API supports batch comment submission via the `comments` array in a single POST, which produces exactly one notification. The `line` parameter (preferred over deprecated `position`) references the line in the diff blob, and for new files added in a PR, `side: "RIGHT"` with the actual file line number maps directly since all lines are additions. This aligns perfectly with the `block.startLine` approach from D-13.

**Primary recommendation:** Extend `handler.ts` to accept annotations in the `/api/pr/create` request body, call existing `exportToPR()` then new `submitBatchReview()`, store `PRMetadataWithSync` (with plan hash) to KV, and add a "GitHub PR" tab to `ExportModal.tsx` following the existing tab pattern.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** "Create PR" action lives in dedicated Export modal (extensible UI pattern for future export formats)
- **D-02:** One-click PR creation with auto-generated defaults (no modal form or configuration prompts)
- **D-03:** Success communicated via toast notification + link (auto-dismiss 5-8 seconds)
- **D-04:** Errors communicated via toast with retry action
- **D-05:** Annotations submitted as single batch GitHub review (PR-04, event: "COMMENT")
- **D-06:** DELETION annotations converted to suggestion blocks (empty suggestion = deletion)
- **D-07:** Annotations with images trigger warning and skip image references (text only)
- **D-08:** Multiple annotations on same line = separate PR comments
- **D-09:** PR metadata persisted in server-side KV store (key: `sync:{pasteId}:pr`)
- **D-10:** PR metadata includes plan hash (SHA-256) for drift detection
- **D-11:** PR metadata TTL matches paste TTL (30 days default)
- **D-12:** UI fetches PR metadata on load via API
- **D-13:** Annotations mapped to PR lines via block.startLine directly
- **D-14:** Multi-line block annotations appear at block start
- **D-15:** Drift detected by comparing plan hash, warns in UI (non-blocking)
- **D-16:** Drift triggered by any content change (full hash comparison)
- **D-17:** Partial failures rollback automatically (delete created branch)
- **D-18:** Rate limit errors (429) retry with exponential backoff
- **D-19:** Auth failures clear state and prompt re-auth (Phase 2 pattern)
- **D-20:** Network errors auto-retry 3x with exponential backoff
- **D-21:** Plan committed to `plans/{pasteId}.md` path
- **D-22:** PR description contains summary + link to Plannotator
- **D-23:** PR branch named `plan/{pasteId}`
- **D-24:** Commit message auto-generated from plan heading

### Claude's Discretion
- Toast notification duration (5-8 seconds auto-dismiss)
- Retry backoff timing specifics (1s, 2s, 4s suggested)
- Warning banner styling and placement in UI
- Export modal design (icon, wording, layout)
- Error message wording for different failure types

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PR-01 | Existing PR creation functionality preserved | Existing `exportToPR()` in pr.ts unchanged; handler.ts `/api/pr/create` route already works |
| PR-02 | Annotations exported as initial PR review comments | New `submitBatchReview()` using `POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews` with `comments` array |
| PR-03 | Annotations mapped to markdown line numbers for line-level comments | `block.startLine` from parser.ts provides direct line numbers; `line` + `side: "RIGHT"` for new-file diffs |
| PR-04 | Batch review submission (single GitHub notification) | GitHub Reviews API `comments` array + `event: "COMMENT"` = one notification |
| PR-05 | DELETION annotations exported as GitHub suggestion blocks | Format: `` ```suggestion\n\n``` `` (empty suggestion = deletion) |
| PR-06 | PR metadata stored and linked to paste ID | KV key `sync:{pasteId}:pr` with `PRMetadataWithSync` type (includes planHash) |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Bun runtime | 1.3.x | Server runtime | Already used throughout project |
| React | 18.x | UI components | Already in project |
| GitHub REST API v3 | 2022-11-28 | PR creation, batch reviews | Standard REST API; existing `githubRequest()` helper |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Web Crypto API | built-in | SHA-256 plan hash | Already used in `stableId.ts`; same pattern for plan hash |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| REST batch review | GraphQL `addPullRequestReview` | GraphQL supports threaded replies but REST is sufficient and matches existing pattern |
| Custom toast | react-hot-toast | Project already has inline toast pattern in App.tsx; no new dependency needed |

**Installation:**
No new packages needed. All dependencies are already in the project.

## Architecture Patterns

### Recommended Project Structure
```
packages/github/
  server/
    pr.ts              # EXISTING - exportToPR(), githubRequest()
    export.ts          # NEW - exportPlanWithAnnotations(), submitBatchReview()
    handler.ts         # MODIFY - extend /api/pr/create, add /api/pr/{pasteId}/metadata
    syncMappings.ts    # EXISTING - setMapping() for annotation-comment ID pairs
    syncState.ts       # EXISTING - setSyncState() for outbound sync
  client/
    GitHubProvider.tsx # MODIFY - implement createPR(), hydrate prMetadata
    useGitHubExport.ts # NEW - export hook with loading/error/retry state
  shared/
    types.ts           # EXISTING - PRMetadataWithSync already defined
    planHash.ts        # NEW - generatePlanHash() utility
packages/ui/
  components/
    ExportModal.tsx    # MODIFY - add "GitHub PR" tab
  utils/
    callback.ts        # MODIFY - extend ToastPayload with optional action
packages/editor/
  App.tsx              # MODIFY - pass toast action support, wire GitHub PR tab
```

### Pattern 1: Batch Review Submission
**What:** Submit all annotations as a single GitHub review with comment array
**When to use:** PR creation with annotations (D-05)
**Example:**
```typescript
// POST /repos/{owner}/{repo}/pulls/{pr_number}/reviews
async function submitBatchReview(
  owner: string,
  repo: string,
  prNumber: number,
  token: string,
  comments: Array<{ path: string; line: number; side: string; body: string }>
): Promise<void> {
  await githubRequest(
    `POST /repos/${owner}/${repo}/pulls/${prNumber}/reviews`,
    token,
    {
      body: "Plan review exported from Plannotator",
      event: "COMMENT",
      comments: comments.map(c => ({
        path: c.path,
        line: c.line,
        side: c.side,
        body: c.body,
      })),
    }
  );
}
```

### Pattern 2: Annotation-to-Comment Mapping
**What:** Convert Plannotator annotations to GitHub review comment format
**When to use:** Before submitting batch review
**Example:**
```typescript
function mapAnnotationToComment(
  annotation: Annotation,
  blocks: Block[],
  filePath: string
): { path: string; line: number; side: string; body: string } {
  const block = blocks.find(b => b.id === annotation.blockId);
  const line = block?.startLine ?? 1;

  let body: string;
  if (annotation.type === "DELETION") {
    // D-06: suggestion block with empty body = deletion
    body = `${annotation.originalText}\n\n\`\`\`suggestion\n\n\`\`\``;
  } else if (annotation.type === "COMMENT") {
    body = annotation.text || "";
  } else {
    // GLOBAL_COMMENT - these go as review body, not line comments
    body = annotation.text || "";
  }

  return { path: filePath, line, side: "RIGHT", body };
}
```

### Pattern 3: Rollback on Partial Failure
**What:** Track created resources and clean up on failure (D-17)
**When to use:** During PR creation flow
**Example:**
```typescript
const createdResources: Array<{ type: string; ref: string }> = [];
try {
  // Create branch...
  createdResources.push({ type: "branch", ref: `refs/heads/${branchName}` });
  // Create PR...
  // Submit review...
} catch (error) {
  // Rollback in reverse order
  for (const resource of createdResources.reverse()) {
    if (resource.type === "branch") {
      await githubRequest(
        `DELETE /repos/${owner}/${repo}/git/${resource.ref}`,
        token
      ).catch(() => {}); // Best-effort cleanup
    }
  }
  throw error;
}
```

### Pattern 4: Plan Hash for Drift Detection
**What:** SHA-256 hash of full plan markdown stored with PR metadata (D-10, D-16)
**When to use:** At PR creation time and on UI load for drift comparison
**Example:**
```typescript
async function generatePlanHash(planMarkdown: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(planMarkdown);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}
```

### Anti-Patterns to Avoid
- **Individual comment POSTs:** Do NOT post annotations one at a time -- this creates N notifications instead of 1. Use the batch reviews API always.
- **Using deprecated `position` parameter:** Use `line` + `side` instead. `position` counts from diff hunk header and is being phased out.
- **Storing PR metadata in paste data:** Keep sync metadata in KV with `sync:` prefix per Phase 3 pattern, not embedded in paste blob.
- **Blocking on drift warning:** Per D-15, drift is a warning only. Do not prevent export when plan hash differs.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SHA-256 hashing | Custom hash function | `crypto.subtle.digest("SHA-256", ...)` | Already used in `stableId.ts`; Web Crypto is standard and available in Bun |
| Toast notifications | New toast component/library | Existing `noteSaveToast` pattern in App.tsx | Project already has inline toast; extend with `action` field per UI-SPEC |
| Modal tabs | New modal component | Existing `ExportModal.tsx` tab pattern | Add "GitHub PR" as fourth tab in existing 3-tab modal |
| GitHub API auth | New auth flow | Existing `extractToken()` + `validateGitHubToken()` from middleware.ts | Phase 2 already built this |
| Exponential backoff | Custom retry logic | Simple loop with `await new Promise(r => setTimeout(r, delay))` | Only 3 retries needed; keep it simple |

**Key insight:** The existing codebase provides nearly all infrastructure. The new work is composition: wiring `exportToPR()` + new `submitBatchReview()` + existing KV operations together, and adding a UI tab.

## Common Pitfalls

### Pitfall 1: GitHub Review Comments on New Files Require `side: "RIGHT"`
**What goes wrong:** Comments on newly added files fail with 422 if `side` is not specified.
**Why it happens:** For new files in a PR, all lines are "additions" (right side of diff). GitHub requires explicit `side: "RIGHT"` for files that only exist on one side.
**How to avoid:** Always pass `side: "RIGHT"` for comments on `plans/{pasteId}.md` since this file is always newly created.
**Warning signs:** 422 Validation Failed from GitHub API.

### Pitfall 2: Empty Comments Array Causes 422
**What goes wrong:** Submitting a review with `comments: []` when there are no annotations to export causes GitHub API error.
**Why it happens:** GitHub validates the comments array is non-empty when provided.
**How to avoid:** If no line-level annotations exist, either omit the `comments` field or skip the review submission entirely. GLOBAL_COMMENT annotations should go in the review `body` instead.
**Warning signs:** "Validation Failed" error with empty annotations.

### Pitfall 3: Suggestion Blocks Must Be on Lines That Exist in the Diff
**What goes wrong:** DELETION suggestion on a line not present in the diff returns 422.
**Why it happens:** Suggestion blocks can only target lines that are visible in the PR diff. For a new file, all lines are visible, so this should not be an issue for this phase.
**How to avoid:** Since the plan markdown IS the new file content, all `block.startLine` values correspond to actual lines in the diff. This pitfall matters more for Phase 6 (outbound sync on modified files).
**Warning signs:** "Validation Failed" or "line out of range" errors.

### Pitfall 4: Branch Delete Requires `git/refs/heads/` Not `git/ref/heads/`
**What goes wrong:** Rollback cleanup fails silently because branch deletion uses wrong endpoint.
**Why it happens:** The GET endpoint is `/git/ref/heads/{branch}` (singular), but DELETE uses `/git/refs/heads/{branch}` (plural).
**How to avoid:** Use `DELETE /repos/{owner}/{repo}/git/refs/heads/{branchName}` for rollback.
**Warning signs:** 404 on branch deletion during rollback (swallowed by catch-all).

### Pitfall 5: Rate Limiting on Review Creation
**What goes wrong:** "Creating content too quickly" secondary rate limit triggers 403 or 429.
**Why it happens:** GitHub's secondary rate limits apply to content creation endpoints. Batch reviews with many comments can trigger this.
**How to avoid:** Check `X-RateLimit-Remaining` header; if approaching zero, delay. Also check for `Retry-After` header on 429 responses. The exponential backoff from D-18 handles this.
**Warning signs:** 429 response with `Retry-After` header, or 403 with rate limit message.

### Pitfall 6: `line` Parameter Uses 1-Based Indexing
**What goes wrong:** Off-by-one errors if `block.startLine` is 0-based.
**Why it happens:** GitHub's `line` parameter is 1-based (first line = 1).
**How to avoid:** Verify that `parseMarkdownToBlocks()` produces 1-based `startLine` values. Based on code inspection, `startLine` in the parser is 1-based (counts from line 1 of the markdown). No adjustment needed.
**Warning signs:** Comments appearing on wrong lines.

## Code Examples

### Extending Handler for Annotations Export
```typescript
// In handler.ts - extend /api/pr/create body type
interface CreatePRBody {
  pasteId: string;
  planMarkdown: string;
  defaultRepo?: string;
  annotations?: Array<{
    id: string;
    blockId: string;
    type: "DELETION" | "COMMENT" | "GLOBAL_COMMENT";
    text?: string;
    originalText: string;
    images?: Array<{ path: string; name: string }>;
  }>;
  blocks?: Array<{
    id: string;
    startLine: number;
  }>;
}
```

### PR Metadata Storage with Plan Hash
```typescript
// Store PRMetadataWithSync to KV (D-09, D-10, D-11)
const planHash = await generatePlanHash(body.planMarkdown);
const metadataWithSync: PRMetadataWithSync = {
  ...prMetadata,
  planHash,
};
await kv.put(
  `sync:${body.pasteId}:pr`,
  JSON.stringify(metadataWithSync),
  { expirationTtl: 30 * 24 * 60 * 60 } // 30 days per D-11
);
```

### DELETION to Suggestion Block Conversion
```typescript
// D-06: Convert DELETION annotation to GitHub suggestion format
function formatDeletionAsSuggestion(annotation: Annotation): string {
  // Show the original selected text as context, then empty suggestion = delete
  return `> ${annotation.originalText}\n\n\`\`\`suggestion\n\n\`\`\``;
}
```

### Toast with Action Button
```typescript
// Extend existing ToastPayload pattern (from UI-SPEC)
type ToastPayload = {
  type: 'success' | 'error';
  message: string;
  action?: { label: string; onClick: () => void };
} | null;

// Usage in export flow
setNoteSaveToast({
  type: 'success',
  message: 'PR created successfully',
  action: { label: 'View PR', onClick: () => window.open(prUrl, '_blank') },
});
setTimeout(() => setNoteSaveToast(null), 6000);
```

### useGitHubExport Hook
```typescript
function useGitHubExport(pasteId: string, annotations: Annotation[], blocks: Block[]) {
  const { token } = useGitHub();
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exportToPR = async (retryCount = 0): Promise<PRMetadataWithSync | null> => {
    setIsExporting(true);
    setError(null);
    try {
      const res = await fetch('/api/pr/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          pasteId,
          planMarkdown: /* from context */,
          annotations: annotations.map(a => ({
            id: a.id, blockId: a.blockId, type: a.type,
            text: a.text, originalText: a.originalText,
            images: a.images,
          })),
          blocks: blocks.map(b => ({ id: b.id, startLine: b.startLine })),
        }),
      });
      if (!res.ok) {
        if (res.status === 429 && retryCount < 3) {
          const delay = Math.pow(2, retryCount) * 1000;
          await new Promise(r => setTimeout(r, delay));
          return exportToPR(retryCount + 1);
        }
        throw new Error(await res.text());
      }
      return res.json();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
      return null;
    } finally {
      setIsExporting(false);
    }
  };

  return { exportToPR, isExporting, error };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `position` parameter (diff-relative) | `line` + `side` parameter (file-relative) | 2022 | Use `line` for clarity; `position` is deprecated |
| Individual comment POSTs | Batch review submission | Always available | Single notification vs N notifications |
| PR body contains full plan | PR body has summary + link | Phase 4 decision | Avoids 65k char limit, cleaner PR |

**Deprecated/outdated:**
- `position` parameter in review comments: Use `line` + `side` instead (GitHub docs mark `position` as "closing down")

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | bun:test (built-in) |
| Config file | none (Bun's built-in test runner) |
| Quick run command | `bun test packages/github/` |
| Full suite command | `bun test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PR-01 | Existing PR creation preserved | unit | `bun test packages/github/server/pr.test.ts -x` | Yes |
| PR-02 | Annotations exported as review comments | unit | `bun test packages/github/server/export.test.ts -x` | No -- Wave 0 |
| PR-03 | Annotations mapped to line numbers | unit | `bun test packages/github/server/export.test.ts -x` | No -- Wave 0 |
| PR-04 | Batch review (single notification) | unit | `bun test packages/github/server/export.test.ts -x` | No -- Wave 0 |
| PR-05 | DELETION as suggestion blocks | unit | `bun test packages/github/server/export.test.ts -x` | No -- Wave 0 |
| PR-06 | PR metadata stored with paste ID | unit | `bun test packages/github/server/handler.test.ts -x` | Yes (extend) |

### Sampling Rate
- **Per task commit:** `bun test packages/github/`
- **Per wave merge:** `bun test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/github/server/export.test.ts` -- covers PR-02, PR-03, PR-04, PR-05 (batch review, annotation mapping, suggestion blocks)
- [ ] Extend `packages/github/server/handler.test.ts` -- covers PR-06 (metadata storage via extended /api/pr/create)
- [ ] `packages/github/shared/planHash.test.ts` -- covers plan hash generation for drift detection

## Open Questions

1. **GLOBAL_COMMENT annotations placement**
   - What we know: GLOBAL_COMMENT has no blockId/startLine. It cannot be a line-level comment.
   - What's unclear: Should GLOBAL_COMMENTs go in the review `body` field, or be skipped entirely?
   - Recommendation: Include GLOBAL_COMMENTs in the review `body` (concatenated). This is natural since GitHub reviews have a top-level body plus line-level comments.

2. **Annotation startLine validation**
   - What we know: `parseMarkdownToBlocks()` generates 1-based `startLine` values.
   - What's unclear: Whether the committed file's line numbers exactly match the parser's `startLine` values when the plan markdown has trailing whitespace or BOM.
   - Recommendation: Test with a few real plans. The parser reads the same markdown that gets committed, so they should match exactly.

3. **Existing PR on same paste ID**
   - What we know: `exportToPR()` handles existing branch by force-updating the ref (line 108-117 in pr.ts).
   - What's unclear: Should we check for existing PR metadata before creating a new one? D-15 implies awareness of existing PRs.
   - Recommendation: Check KV for existing `sync:{pasteId}:pr` on export. If exists, warn about overwrite. The handler should still allow re-export (update branch + new review).

## Project Constraints (from CLAUDE.md)

- **Bun runtime required** -- all server code runs on Bun, tests use `bun:test`
- **Build order matters** -- UI changes require `bun run build:hook` (and `build:opencode` if applicable)
- **Plugin architecture** -- GitHub code lives in `packages/github/`, minimal upstream changes
- **Two server runtimes** -- Bun server (`packages/server/`) and Pi server (`apps/pi-extension/server/`). The GitHub handler is only in the Bun runtime path (paste-service), so Pi server does NOT need updating for this phase.
- **No new dependencies** -- All needed infrastructure exists (Web Crypto, React, existing GitHub API helper)
- **Test locally** -- `claude --plugin-dir ./apps/hook` for plugin testing
- **Cookie-based settings** -- Settings use cookies not localStorage (random ports per session)

## Sources

### Primary (HIGH confidence)
- `packages/github/server/pr.ts` -- Existing exportToPR() implementation, githubRequest() helper
- `packages/github/server/handler.ts` -- Existing route structure and auth pattern
- `packages/github/shared/types.ts` -- PRMetadata, PRMetadataWithSync, GitHubConfig types
- `packages/github/server/syncMappings.ts` -- Phase 3 KV mapping operations
- `packages/github/client/GitHubProvider.tsx` -- Provider with createPR() stub
- `packages/ui/components/ExportModal.tsx` -- Existing 3-tab modal (Share, Annotations, Notes)
- `packages/editor/App.tsx` -- Existing toast pattern (noteSaveToast)
- GitHub REST API docs: Pull request reviews endpoint (POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews)

### Secondary (MEDIUM confidence)
- GitHub REST API docs: `line` vs `position` parameter distinction (docs confirm `position` is "closing down")
- GitHub suggestion block format (`` ```suggestion `` fence) -- well-established but not verified from primary docs in this session
- `side: "RIGHT"` requirement for new files -- confirmed in GitHub docs for PR comments

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries/APIs already in use
- Architecture: HIGH -- extending existing patterns with well-defined integration points
- Pitfalls: HIGH -- based on direct code inspection and GitHub API documentation
- GitHub API specifics: HIGH -- verified against official docs

**Research date:** 2026-04-02
**Valid until:** 2026-05-02 (30 days -- stable APIs, stable codebase)
