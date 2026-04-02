# Phase 4: PR Creation & Export - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Enable users to create GitHub PRs from plans with annotations exported as initial batch review comments. This phase bridges Plannotator's plan review workflow with GitHub's native PR review experience, implementing the export direction of bidirectional sync.

</domain>

<decisions>
## Implementation Decisions

### PR Creation UI Flow

- **D-01:** "Create PR" action lives in dedicated Export modal
  - Extensible UI pattern for future export formats (Notion, Jira, etc.)
  - Export modal accessed via toolbar button or menu
  - Not in Settings (configuration vs action separation)

- **D-02:** One-click PR creation with auto-generated defaults
  - No modal form or configuration prompts during export
  - PR title extracted from plan's first # heading: "Plan Review: {heading}"
  - PR description: summary + link to Plannotator
  - Uses GitHub config defaults (defaultRepo, prBaseBranch)
  - Fast workflow, minimal friction

- **D-03:** Success communicated via toast notification + link
  - Brief success toast with "View PR" link (opens GitHub)
  - Non-intrusive, allows continuing work in Plannotator
  - Toast auto-dismisses after 5-8 seconds
  - Not modal confirmation or persistent banner

- **D-04:** Errors communicated via toast with retry action
  - Error toast shows message + "Retry" button
  - Keeps user in context, easy recovery for transient failures
  - Not modal with full details or persistent banner
  - Retry uses same parameters (no re-configuration)

### Annotation Export Strategy

- **D-05:** Annotations submitted as single batch GitHub review (PR-04)
  - All annotations in one review submission = single notification
  - Requires review state: "COMMENT" (neutral batch)
  - Cleaner for reviewers, matches GitHub's native review workflow
  - Not individual comments (multiple notifications) or hybrid approach

- **D-06:** DELETION annotations converted to suggestion blocks (PR-05)
  - Format: \`\`\`suggestion\n\n\`\`\` (empty suggestion = deletion)
  - GitHub renders "Apply suggestion" button
  - Native UX, actionable by PR author
  - Not strikethrough comments or replacement text logic

- **D-07:** Annotations with images trigger warning and skip image references
  - Show warning: "Annotations with images can't sync to GitHub"
  - Post comment body without image references (text only)
  - Prevents broken links, simple implementation
  - Not Gist upload (deferred) or external URL references

- **D-08:** Multiple annotations on same line = separate PR comments
  - Each annotation becomes its own comment on that line
  - GitHub groups them as a thread automatically
  - Preserves distinct annotation IDs for bidirectional sync
  - Not combined comment or hierarchical replies

### PR Metadata Storage

- **D-09:** PR metadata persisted in server-side KV store
  - Key pattern: `sync:{pasteId}:pr`
  - Consistent with Phase 3 sync infrastructure (syncMappings, syncState)
  - Survives page reloads, works cross-device
  - Not embedded in paste metadata or client localStorage

- **D-10:** PR metadata includes plan hash for drift detection
  - Store SHA-256 of full plan markdown at PR creation time
  - Enables drift warning on sync (Phase 3 D-08, SYNC-OUT-04/05)
  - Uses PRMetadataWithSync type from Phase 3
  - Minimal overhead, high value for sync safety

- **D-11:** PR metadata TTL matches paste TTL (Phase 3 D-06 pattern)
  - Expires when paste expires (30 days default or custom)
  - Consistent lifecycle, no orphaned metadata
  - Not permanent or short TTL (7 days)

- **D-12:** UI fetches PR metadata on load via API
  - GitHubProvider calls `/api/pr/{pasteId}/metadata` on mount
  - Auto-populates `prMetadata` state if PR exists
  - Standard React pattern, eager loading
  - Not lazy on user action or embedded in share payload

### Line Positioning & Drift

- **D-13:** Annotations mapped to PR lines via block.startLine directly (Phase 3 D-07)
  - Annotation's blockId → block lookup → block.startLine from parser
  - Simple, already exists, no offset calculation needed
  - All annotations on same block go to same line (GitHub groups as thread)
  - Not character offset calculation or diff context mapping

- **D-14:** Multi-line block annotations appear at block start
  - All annotations on multi-line blocks (code, lists, paragraphs) appear at first line
  - Simple, consistent, matches block.startLine pattern
  - GitHub groups them as a thread
  - Not annotation start offset or block end

- **D-15:** Drift detected by comparing plan hash, warns in UI (Phase 3 D-09)
  - Compare current plan markdown hash to stored PRMetadata.planHash
  - Show warning banner if hashes differ: "Plan changed since PR creation — line numbers may be incorrect"
  - User can proceed or cancel PR creation
  - Not blocking PR creation or auto-recreating PR

- **D-16:** Drift triggered by any content change (full hash comparison)
  - SHA-256 of entire plan markdown
  - Even typo fixes trigger warning
  - Safe but may be noisy for minor edits
  - Not structural changes only or line count changes

### Error Handling & Recovery

- **D-17:** Partial failures rollback automatically
  - If PR creation fails partway (branch created, PR API fails), delete created branch
  - Clean slate for retry, no orphaned branches
  - Requires cleanup logic but safest UX
  - Not leaving incomplete state or saving partial progress

- **D-18:** Rate limit errors (429) retry with exponential backoff
  - Check `X-RateLimit-Reset` header from GitHub API
  - Auto-retry after wait period with backoff (1s, 2s, 4s)
  - User sees "Retrying..." indicator in toast
  - Not fail immediately or queue for later

- **D-19:** Auth failures clear state and prompt re-auth (Phase 2 pattern)
  - If token invalid/expired during PR creation, remove token cookie + localStorage
  - Redirect to OAuth login with return_to URL (Phase 2 D-08)
  - User re-authenticates, then retries export
  - Not silent refresh attempt or manual re-auth from error state

- **D-20:** Network errors auto-retry 3x with exponential backoff
  - Timeouts, DNS failures: retry 3 times (1s, 2s, 4s delays)
  - User sees "Retrying..." indicator
  - Handles flaky networks without user action
  - Not fail immediately or offline queue

### Markdown File Structure

- **D-21:** Plan committed to `plans/{pasteId}.md` path (current pr.ts pattern)
  - Organized in plans/ directory, unique by paste ID
  - Clean separation from code
  - Not nested under docs/ or user-configurable path

- **D-22:** PR description contains summary + link to Plannotator
  - Extract brief summary from plan heading
  - Include link to share.plannotator.ai for full context
  - Keeps PR description concise (GitHub's 65k char limit avoided)
  - Not full plan markdown in body or metadata only

- **D-23:** PR branch named `plan/{pasteId}` (current pr.ts pattern)
  - Clear namespace, unique identifier
  - Example: `plan/a3f9d2b8c1e4`
  - Not plannotator/ prefix or user-defined prefix

- **D-24:** Commit message auto-generated from plan heading
  - Extract first # heading as commit title
  - Add trailer: "Generated via Plannotator"
  - Descriptive and attributed
  - Not generic template or user-editable

### Claude's Discretion

- Toast notification duration (5-8 seconds auto-dismiss)
- Retry backoff timing specifics (1s, 2s, 4s suggested)
- Warning banner styling and placement in UI
- Export modal design (icon, wording, layout)
- Error message wording for different failure types

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §PR Creation & Export — PR-01 through PR-06 define what must be TRUE
- `.planning/REQUIREMENTS.md` §Data Model & Sync State — DATA-01 through DATA-05 (Phase 3 validated)

### Phase Context
- `.planning/phases/01-plugin-architecture/01-CONTEXT.md` — Plugin structure, middleware patterns, integration points
- `.planning/phases/02-authentication-access-control/02-CONTEXT.md` — Auth flow, token validation, error handling
- `.planning/phases/03-data-model-sync-infrastructure/03-CONTEXT.md` — Stable IDs, sync mappings, plan hash, conflict detection

### Existing Implementation
- `packages/github/server/pr.ts` — Existing exportToPR() function (creates branch, commit, PR)
- `packages/github/server/middleware.ts` — extractToken(), validateGitHubToken() for auth
- `packages/github/server/syncMappings.ts` — KV operations for bidirectional mapping (Phase 3)
- `packages/github/server/syncState.ts` — getSyncState(), setSyncState() for last sync timestamp (Phase 3)
- `packages/github/shared/types.ts` — PRMetadata, PRMetadataWithSync, GitHubConfig types
- `packages/github/client/GitHubProvider.tsx` — React context with createPR() stub
- `packages/github/client/lineMapper.ts` — mapLineToBlock() for reverse mapping

### UI Patterns
- `packages/ui/components/Toolbar.tsx` — Existing toolbar buttons (Approve, Deny, Settings)
- `packages/ui/components/Settings.tsx` — Settings modal with tabs
- `packages/ui/utils/parser.ts` — parseMarkdownToBlocks() generates Block objects with startLine
- `packages/ui/types.ts` — Annotation, Block types

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **PR creation logic**: `packages/github/server/pr.ts` (252 lines)
  - `exportToPR()` — Creates branch, blob, tree, commit, PR via GitHub API
  - Existing pattern: `plan/{pasteId}` branch, `plans/{pasteId}.md` path
  - Already extracts title from first # heading
  - Returns PRMetadata object
  - Needs extension for: annotations export, plan hash storage, rollback logic

- **GitHub API helper**: `githubRequest()` in pr.ts
  - Parses endpoint format: "GET /repos/owner/repo/path"
  - Handles authentication headers, error responses
  - Reusable for annotation export API calls

- **Phase 3 infrastructure**: Sync mappings, sync state, stable IDs all ready
  - `generateStableId()` — SHA-256 stable annotation IDs (Phase 3)
  - `setMapping()`, `getCommentId()` — Bidirectional KV mapping (Phase 3)
  - `setSyncState()`, `getSyncState()` — Last sync timestamp tracking (Phase 3)
  - All infrastructure ready, just needs annotation export usage

- **GitHubProvider**: `packages/github/client/GitHubProvider.tsx` (104 lines)
  - `createPR()` stub currently logs warning
  - Context exposes `prMetadata` state (currently null)
  - Validation logic on mount checks token and fetches user
  - Needs: createPR implementation, prMetadata hydration from API

- **Line mapping**: `packages/github/client/lineMapper.ts` and `packages/ui/utils/lineMapper.ts`
  - `mapLineToBlock(lineNumber, blocks)` — Binary search for reverse mapping
  - Not needed for export (use block.startLine directly per D-13)
  - Required for inbound sync (Phase 5)

### Established Patterns

- **Modal patterns**: Settings.tsx shows tab-based modal pattern
  - Export modal should follow similar structure
  - Could reuse Modal wrapper component if exists

- **Toast notifications**: Check if toast library exists in packages/ui
  - If not, add lightweight toast implementation or use browser native notifications
  - Toast with action button (View PR, Retry) requires stateful toast queue

- **Error handling**: Phase 2 established patterns
  - Auth failures redirect to OAuth flow with return_to URL
  - Network errors show user-friendly messages
  - Token validation checks before API calls

- **KV operations**: Phase 3 established patterns
  - Key namespacing: `sync:{pasteId}:*`
  - TTL inheritance from paste expiry
  - Bidirectional pair storage for O(1) lookups

### Integration Points

- **Export modal trigger**: Toolbar or new top-level button
  - Toolbar.tsx has existing button pattern
  - Modal state managed via React useState
  - GitHubProvider accessed via useGitHub() hook

- **Server endpoint**: New `/api/pr/{pasteId}/create` route
  - Compose in paste-service handler via GitHub plugin middleware
  - Needs: token validation, annotation fetching, batch review submission
  - Returns: PRMetadata or error

- **PR metadata endpoint**: New `/api/pr/{pasteId}/metadata` route
  - GitHubProvider fetches on mount
  - Returns PRMetadata | null
  - Populates prMetadata state in context

- **Annotation source**: useAnnotationHighlighter hook in packages/ui
  - Provides current annotations array
  - Export reads annotations, filters by type, maps to GitHub format

### Code to Create

- `packages/github/server/export.ts` — PR creation + annotation export logic
  - `exportPlanWithAnnotations(pasteId, annotations, planMarkdown, token, config, kv)`
  - Calls exportToPR(), then submitBatchReview()
  - Stores PRMetadataWithSync to KV
  - Rollback logic on failure

- `packages/github/client/useGitHubExport.ts` — Export hook for UI
  - Wraps GitHubProvider.createPR() action
  - Manages loading state, error state, retry logic
  - Returns: { exportToPR, isExporting, error, retry }

- `packages/github/client/components/ExportModal.tsx` — Export UI
  - Modal with "Export to GitHub PR" option
  - Shows current annotations count
  - Triggers useGitHubExport().exportToPR()
  - Displays toast on success/error

</code_context>

<specifics>
## Specific Ideas

- Export modal should show:
  - "Export to GitHub PR" option with GitHub icon
  - Current annotations count: "{N} annotations will be exported as review comments"
  - Drift warning if plan changed: "⚠️ Plan changed since last sync — line numbers may be incorrect"
  - "Export" button (primary action)

- Batch review API format (GitHub REST):
  ```
  POST /repos/{owner}/{repo}/pulls/{pr_number}/reviews
  {
    "body": "Plan review exported from Plannotator",
    "event": "COMMENT",
    "comments": [
      { "path": "plans/{pasteId}.md", "line": 15, "body": "annotation text" },
      { "path": "plans/{pasteId}.md", "line": 15, "body": "```suggestion\n\n```" }
    ]
  }
  ```

- DELETION annotation suggestion block format:
  - Body: "\`\`\`suggestion\n\n\`\`\`" (three backticks, newline, newline, three backticks)
  - GitHub renders as "Apply suggestion" with empty change
  - Comment text above suggestion: use annotation originalText for context

- Rollback logic on PR creation failure:
  - Track created resources in array: `[{ type: "branch", ref: "refs/heads/plan/xyz" }]`
  - On error, iterate array in reverse, delete each resource
  - Branch delete: `DELETE /repos/{owner}/{repo}/git/refs/heads/{branch}`

- Toast notification library options:
  - Use existing toast if available (check packages/ui/components/)
  - If not, add `react-hot-toast` or similar lightweight library
  - Toast API: `toast.success("PR created", { action: { label: "View", onClick: () => window.open(url) } })`

- PR metadata API response format:
  ```json
  {
    "repo": "owner/repo",
    "pr_number": 123,
    "pr_url": "https://github.com/owner/repo/pull/123",
    "created_at": "2026-04-02T10:30:00Z",
    "planHash": "a3f9d2b8c1e4..."
  }
  ```

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-pr-creation-export*
*Context gathered: 2026-04-02*
