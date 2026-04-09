# Phase 7: Thread Management & Resolution - Context

**Gathered:** 2026-04-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can view full discussion threads, create summary annotations that capture final decisions, resolve threads on GitHub via GraphQL, and submit PR reviews (approve/request changes) from Plannotator. Summary creation is author-driven (no AI), thread-by-thread for quality. Resolution status syncs bidirectionally, with graceful permission handling. Export summaries as markdown for documentation.

</domain>

<decisions>
## Implementation Decisions

### Summary Annotation Creation Flow

- **D-01:** 'Summarize' button on thread parent annotation
  - Appears when hovering over root comment of a thread
  - Discoverable, contextual trigger
  - Only visible on threads (annotations with children)
  - Clear call-to-action for documenting decisions

- **D-02:** Auto-detect thread from context
  - If triggered from thread parent button, auto-select that thread
  - If triggered from toolbar (alternative path), show modal with thread list
  - Context-aware, minimizes clicks
  - User doesn't manually pick thread when context is obvious

- **D-03:** Summary annotations are editable like regular comments
  - User can click and modify summary text anytime before syncing
  - Allows refinement and iteration on decision capture
  - Edits sync as updated text to GitHub on next outbound sync
  - Consistent with existing annotation editing patterns

- **D-04:** Save locally, sync separately via 'Sync to GitHub' button
  - Summary created as annotation with isSummary flag
  - Visible in annotation panel immediately with 'Summary' badge
  - User reviews locally, then syncs via existing outbound sync flow
  - Matches Phase 5/6 sync workflow (manual trigger)

### Thread Selection UI

- **D-05:** Thread labels use first comment preview
  - Format: First 50 characters of root comment text + "..."
  - Example: "Consider using async/await instead..."
  - Natural, context-rich identification
  - Easy to scan in thread picker dropdowns

- **D-06:** Multiple threads per line group independently under parent
  - Each thread has its own parent annotation and children
  - 'Summarize' button appears on each thread parent separately
  - Threads remain independent even when on same markdown line
  - Prevents conflating unrelated discussions

- **D-07:** Toolbar trigger shows modal with thread list
  - Modal displays all active threads with labels, reply counts, last activity
  - Click to select thread, then summary creation modal opens
  - Good for complex PRs, provides overview of all discussions
  - Alternative path when user not in annotation panel

- **D-08:** Thread jump navigation buttons in annotation panel
  - Add 'Previous Thread' / 'Next Thread' buttons at top of panel
  - Clicking scrolls to and highlights next thread root
  - Helps user review all discussions systematically
  - Useful when many threads exist across long plan

### Resolution Timing & Confirmation

- **D-09:** Thread resolves during outbound sync
  - Summary posts to GitHub as final reply in thread
  - Then GraphQL mutation `resolveReviewThread()` called
  - Happens when user clicks 'Sync to GitHub' button
  - Consistent with existing Phase 5/6 manual sync pattern

- **D-10:** No confirmation dialogs before resolution
  - Sync proceeds without "Are you sure?" prompts
  - Resolution is expected behavior when syncing summaries
  - User can unresolve on GitHub if needed
  - Reduces friction, trusts user intent

- **D-11:** Leave thread open if resolution fails
  - Summary successfully posts as reply to GitHub
  - If GraphQL resolution mutation fails, thread stays open
  - Partial success better than rollback (summary is valuable even without resolution)
  - User can manually resolve on GitHub

- **D-12:** Unresolve only on GitHub
  - Plannotator doesn't provide 'Unresolve Thread' action
  - User can unresolve directly on GitHub if needed
  - Simple, GitHub is source of truth for resolution state
  - Rare use case doesn't warrant UI complexity

### Review Submission Interface

- **D-13:** Review UI lives in ExportModal as 'Review' tab
  - Add third tab to existing ExportModal: 'Create PR', 'GitHub PR', 'Review'
  - Same modal pattern, keeps all GitHub actions in one place
  - User opens modal via toolbar, switches to Review tab
  - Reuses existing modal infrastructure

- **D-14:** Auto-sync all unsynced annotations before review submission
  - When user clicks 'Approve' or 'Request Changes', sync pending annotations first
  - Show progress: "Syncing N annotations..."
  - Then submit review with all feedback included
  - Ensures review includes all current annotations

- **D-15:** Optional review body text field
  - Modal includes textarea: "Overall feedback (optional)"
  - Posts as review body on GitHub (high-level summary)
  - Standard PR review pattern (line comments + overall comment)
  - User can provide context beyond line annotations

- **D-16:** Buttons use GitHub terminology
  - Green 'Approve' button and red 'Request Changes' button
  - Matches GitHub PR review UI exactly
  - Clear for users familiar with GitHub workflow
  - Third option: 'Comment' (neutral, no approval state)

### Resolved Thread Visual Treatment

- **D-17:** Resolved badge + muted colors
  - Add 'Resolved' badge to thread parent annotation
  - Dim text to 70% opacity (lighter color)
  - Maintains structure visibility for reference
  - Clear status indicator without hiding content

- **D-18:** Keep threads expanded by default
  - Resolved threads stay expanded like active threads
  - User can manually collapse individual threads if desired
  - Easy to reference past discussions and decisions
  - No automatic hiding of information

- **D-19:** Toggle filter in annotation panel header
  - Add checkbox: "Show resolved threads"
  - Unchecking hides all resolved threads from view
  - Good for focusing on active discussions only
  - Per-session toggle, not persistent setting

- **D-20:** Badge appears on thread parent only
  - 'Resolved' badge shows once on root comment
  - Not repeated on every child annotation
  - Marks thread as resolved unit
  - Clean, avoids visual noise

### Summary Annotation Styling

- **D-21:** Distinct visual styling for summaries
  - Different background color (light blue or yellow tint)
  - Border accent on left side
  - 'Summary' text badge
  - Clearly distinguishable from regular comments

- **D-22:** Show thread context in summary header
  - Display: "Summary of: [first comment preview]" above summary text
  - Tooltip shows full thread preview on hover
  - Clear relationship between summary and thread
  - Helpful when scrolling past resolved threads

- **D-23:** Document/checkmark icon next to 'Summary' badge
  - Use document with checkmark icon (or clipboard icon)
  - Appears next to 'Summary' text badge
  - Quick visual scanning aid
  - Distinguishes summaries from regular comments

- **D-24:** Summaries appear as last child reply in thread
  - Summary is final reply in thread's children array
  - Chronological position: natural conclusion to discussion
  - Maintains simple nested structure
  - Matches GitHub's own thread + resolution pattern

### Resolution Status Sync (Inbound)

- **D-25:** Check resolution status during inbound sync
  - Fetch thread resolved state when user clicks 'Sync from GitHub'
  - Updates alongside new comment import
  - Fits existing Phase 5 sync pattern
  - No extra API calls, batch operation

- **D-26:** Cache resolution status in thread metadata
  - Store `isResolved: boolean` flag on thread parent annotation
  - Updates during each inbound sync
  - Fast local reads between syncs
  - May be stale but user can manually sync for fresh data

- **D-27:** No stale data warnings
  - Trust cached resolution status between syncs
  - No "last synced X minutes ago" indicators
  - User manually syncs if they want fresh state
  - Simple, no UI clutter

- **D-28:** Extend review comments API for resolution status
  - Fetch thread metadata alongside review comments in single call
  - Custom endpoint or enhanced response format
  - Batch operation, efficient
  - May need server-side aggregation of GitHub data

- **D-29:** Show threads resolved by anyone (not just Plannotator)
  - Display 'Resolved' badge for all resolved threads
  - Resolution can happen on GitHub directly
  - Reflects accurate GitHub state
  - Plannotator is viewer of GitHub truth, not exclusive resolver

- **D-30:** Detect and update re-opened threads
  - Next inbound sync detects if resolved thread was re-opened
  - Remove 'Resolved' badge, thread becomes active again
  - Stays synchronized with GitHub state
  - No special notification, just visual update

- **D-31:** Sync resolution status for all threads
  - Check resolution state for every thread, not just those with summaries
  - Complete view of GitHub discussion state
  - User sees full picture regardless of Plannotator usage

- **D-32:** Batch API calls for large PRs
  - Fetch resolution status in batches of 50 threads per call
  - Handles PRs with 100+ threads efficiently
  - Standard pagination pattern
  - Balances API efficiency and response time

### GraphQL Implementation

- **D-33:** Use inline fetch() with GraphQL query strings
  - No extra GraphQL client libraries (apollo, graphql-request)
  - Standard fetch() with POST to GitHub GraphQL endpoint
  - Same auth pattern as REST (Bearer token)
  - Lightweight, no bundle size increase

- **D-34:** Leave thread open if GraphQL resolution fails
  - Summary successfully syncs as reply
  - Resolution mutation failure means thread stays active
  - User can manually resolve on GitHub
  - Consistent with D-11 (graceful degradation)

- **D-35:** Use same rate limit handling as REST
  - Check `X-RateLimit-*` headers from GitHub response
  - Wait for reset time, then auto-retry
  - Show toast: "Rate limit hit. Retrying at [time]"
  - Consistent with Phase 4/5 patterns (D-18/D-13)

- **D-36:** Minimal GraphQL mutation structure
  - Single mutation: `resolveReviewThread(threadId: ID!)`
  - Returns success boolean and optional error message
  - Focused on one action, simple error handling
  - No batch resolution in single mutation (keep it simple)

### Permission Errors

- **D-37:** Lazy permission check on first resolution attempt
  - Don't query permissions upfront
  - Attempt resolution when user syncs first summary
  - Cache permission state if denied (avoid repeated failures)
  - Show error toast with clear explanation

- **D-38:** Allow summary creation even without resolution permission
  - User can create summary annotations locally
  - Summaries sync to GitHub as replies (no special permission needed)
  - Thread won't auto-resolve if user lacks permission
  - Toast: "Summary posted; you don't have permission to resolve threads"

- **D-39:** Specific errors for PR state issues
  - Toast: "PR is closed - can't sync annotations" (clear reason)
  - Toast: "PR is merged - comments not allowed"
  - Summary stays local, user understands limitation
  - Don't attempt sync to closed/merged PRs

- **D-40:** Specific actionable error messages
  - Tailor message to error type:
    - "You need write access to resolve threads"
    - "PR author must resolve this thread"
    - "Organization policy prevents thread resolution"
  - Helps user understand next steps
  - Better than generic "403 Forbidden" errors

### Bulk Operations

- **D-41:** No bulk summarize (one at a time)
  - Each summary is unique, thoughtful decision capture
  - User writes summaries individually for quality
  - No templates or batch creation
  - Aligns with project philosophy (author-written, no AI)

- **D-42:** Summaries always required for resolution
  - Thread resolution always needs summary annotation
  - Ensures decisions are documented
  - No 'Resolve without summary' action
  - Matches core value: decisions properly documented

- **D-43:** Markdown export for all summaries
  - Add 'Export Summaries' button in annotation panel or toolbar
  - Generates markdown document with all thread summaries
  - Format: thread preview + summary text per section
  - Useful for reports, meeting notes, PR description updates

- **D-44:** No multi-select UI
  - Based on D-41/D-42, no bulk operations for creation/resolution
  - No checkboxes on threads
  - Export is read-only operation, doesn't need selection
  - Simpler UI, one clear path

### Claude's Discretion

- Summary button icon (edit, plus, document, message bubble)
- Thread jump button icons and placement (top/bottom of panel)
- Modal layout for thread picker (list view, card view, tree view)
- Summary background color choice (light blue, yellow, green tint)
- Resolution badge color and shape (pill, rounded rectangle, circle)
- Document/checkmark icon specifics (from icon library or custom SVG)
- Export markdown formatting (headers, bullets, sections)
- Toast duration and auto-dismiss timing
- Thread preview truncation length (50 chars suggested but adjustable)
- Muted color opacity for resolved threads (70% suggested)
- Batch size for resolution status API calls (50 suggested)
- GraphQL error retry logic (same as REST or custom)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §Thread Management & Resolution — THREAD-01 through THREAD-07 define what must be TRUE

### Phase Context
- `.planning/phases/01-plugin-architecture/01-CONTEXT.md` — Plugin structure, handler composition, React context patterns
- `.planning/phases/02-authentication-access-control/02-CONTEXT.md` — Auth flow, token validation, error handling, OAuth patterns
- `.planning/phases/03-data-model-sync-infrastructure/03-CONTEXT.md` — Stable IDs, bidirectional mapping, sync state tracking
- `.planning/phases/04-pr-creation-export/04-CONTEXT.md` — Batch review submission, ExportModal patterns, toast notifications
- `.planning/phases/05-inbound-sync/05-CONTEXT.md` — Thread nesting (children field), sync button patterns, toolbar placement, annotation panel threading
- `.planning/phases/06-outbound-sync/06-CONTEXT.md` — Outbound sync workflow, edit detection, drift warnings, batch review patterns

### Existing Implementation
- `packages/github/server/export.ts` — submitBatchReview() supports APPROVE/REQUEST_CHANGES events (not just COMMENT)
- `packages/github/client/threadTree.ts` — buildThreadTree() creates nested annotation structures with children field
- `packages/ui/components/AnnotationPanel.tsx` — Thread rendering with recursive nesting and indentation
- `packages/ui/components/ExportModal.tsx` — Two-tab modal (Create PR, GitHub PR) — extend with Review tab
- `packages/ui/components/ToolbarButtons.tsx` — Sync button patterns from Phase 5/6
- `packages/ui/types.ts` — Annotation type with children, githubCommentUrl fields already established
- `packages/github/shared/types.ts` — PRMetadata, SyncState types
- `packages/github/server/pr.ts` — githubRequest() helper for REST API calls
- `packages/github/server/syncMappings.ts` — Bidirectional KV mapping for annotation IDs
- `packages/github/server/syncState.ts` — Sync timestamp tracking

### GitHub API Documentation
- GitHub GraphQL API for thread resolution: https://docs.github.com/en/graphql/reference/mutations#resolvereviewthread
- Review submission API: https://docs.github.com/en/rest/pulls/reviews#create-a-review-for-a-pull-request
- Review thread structure: https://docs.github.com/en/rest/pulls/comments#list-review-comments-on-a-pull-request

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **submitBatchReview()**: `packages/github/server/export.ts` (Phase 4)
  - Already supports `event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT"`
  - Ready for PR review submission, just needs UI wiring
  - Can include optional review body text
  - Single GitHub API call, minimal latency

- **buildThreadTree()**: `packages/github/client/threadTree.ts` (Phase 5)
  - Converts flat comments to nested Annotation[] with children field
  - Handles thread hierarchy, chronological sorting
  - Clamps depth to 3 levels (MAX_THREAD_DEPTH)
  - Ready for thread identification and traversal

- **Annotation.children field**: `packages/ui/types.ts` (Phase 5)
  - Already defined and used for thread nesting
  - AnnotationPanel renders recursively
  - Can extend with isSummary flag and threadId reference

- **ExportModal**: `packages/ui/components/ExportModal.tsx` (Phase 4)
  - Tab-based modal (currently: 'Create PR', 'GitHub PR')
  - Can add third 'Review' tab with approve/request changes UI
  - Reuses existing modal infrastructure and styling

- **SyncButton**: `packages/ui/components/ToolbarButtons.tsx` (Phase 5/6)
  - Toolbar button pattern with badge, disabled state, tooltip
  - Can replicate for thread navigation buttons
  - Established sync workflow (manual trigger via button)

- **githubRequest()**: `packages/github/server/pr.ts`
  - Generic GitHub API request helper
  - Supports both REST and GraphQL endpoints
  - Auth token handling, error responses
  - Can use for GraphQL mutations

### Established Patterns

- **Thread nesting**: Phase 5 established recursive rendering in AnnotationPanel
  - Indentation with margin-left
  - Children sorted chronologically
  - Visual thread lines connecting parent to children
  - Ready for additional thread-specific UI (summarize button, badges)

- **Toolbar actions**: Phase 5/6 established sync button patterns
  - Always visible, disabled when no PR
  - Badge shows count, tooltip explains disabled state
  - onClick triggers server action via hook
  - Can add thread navigation buttons with same pattern

- **Modal workflows**: Phase 4 established ExportModal pattern
  - Tab switching for different actions
  - Form fields with validation
  - Success/error toasts on completion
  - Can extend with Review tab for PR submission

- **Error handling**: Phases 4/5/6 established patterns
  - Network errors: 3x retry with exponential backoff (1s, 2s, 4s)
  - Rate limits: wait for reset, then auto-retry
  - Auth failures: clear token, redirect to OAuth
  - Permission errors: show specific actionable message

- **Bidirectional sync**: Phase 3/5/6 established KV mapping pattern
  - setMapping() after posting to GitHub
  - getAnnotationId() for deduplication
  - setSyncState() after successful sync
  - Ready for resolution state tracking

### Integration Points

- **Summarize button**: Add to `packages/ui/components/AnnotationPanel.tsx`
  - Render on thread parent annotations (those with children)
  - Show on hover or always visible
  - onClick opens summary creation modal or inline input
  - Wire to summary creation action in GitHubProvider

- **Summary creation modal**: New component or extend existing modal
  - Text area for summary content
  - Show thread context (first comment preview)
  - 'Create Summary' button → saves as annotation with isSummary flag
  - Preview summary before saving

- **Review tab**: Extend `packages/ui/components/ExportModal.tsx`
  - Add third tab: 'Review'
  - Form with: review body textarea, 'Approve' / 'Request Changes' / 'Comment' buttons
  - Auto-sync annotations first, then submit review
  - Show pending annotation count before sync

- **Thread navigation**: Add buttons to `packages/ui/components/AnnotationPanel.tsx`
  - 'Previous Thread' / 'Next Thread' at top of panel
  - Find next thread parent annotation in sorted list
  - Scroll to annotation, highlight briefly
  - Disable when no more threads in direction

- **Resolution status**: Extend inbound sync
  - Fetch resolution state via GitHub API during sync
  - Store isResolved flag on thread parent annotations
  - Update AnnotationPanel rendering to show 'Resolved' badge
  - Add filter checkbox to panel header

- **GraphQL mutation**: New function in `packages/github/server/handler.ts` or separate module
  - `resolveThread(threadId, token)` → POST to GraphQL endpoint
  - Mutation: resolveReviewThread(input: { threadId })
  - Error handling: same as REST (retry, rate limit)
  - Called after summary syncs successfully

- **Markdown export**: New action in annotation panel or toolbar
  - 'Export Summaries' button
  - Collect all annotations with isSummary flag
  - Generate markdown with thread context + summary text
  - Trigger download or copy to clipboard

### Code to Create/Extend

- **Summary annotation flag**: Extend Annotation type
  ```typescript
  interface Annotation {
    // ...existing fields
    isSummary?: boolean;          // Marks annotation as thread summary
    summarizesThreadId?: string;  // References thread parent annotation ID
  }
  ```

- **Resolution status field**: Extend Annotation type
  ```typescript
  interface Annotation {
    // ...existing fields
    isResolved?: boolean;         // Thread resolution status (from GitHub)
    resolvedAt?: number;          // Timestamp of resolution
  }
  ```

- **Summary creation modal**: New component or inline form
  - Textarea for summary text
  - Thread context display
  - Create/Cancel buttons
  - Validation (non-empty summary)

- **Review tab component**: Extend ExportModal
  - Review body textarea (optional)
  - Three button group: Approve, Request Changes, Comment
  - Pending annotation count badge
  - Loading state during sync + submit

- **Thread filter**: Add to AnnotationPanel header
  - Checkbox: "Show resolved threads"
  - Filter annotations where isResolved === true
  - Persist state in local component state (not global)

- **GraphQL client function**: New module `packages/github/server/graphql.ts`
  - `resolveReviewThread(threadId, token)` using fetch()
  - Query string construction
  - Error parsing and mapping to user-friendly messages
  - Rate limit handling

- **Markdown export function**: Client-side or server-side
  - `exportSummariesAsMarkdown(annotations)` → string
  - Format: `## Thread: [preview]\n\n**Summary:** [text]\n\n---`
  - Include resolved status, author, timestamp
  - Trigger browser download with filename

</code_context>

<specifics>
## Specific Ideas

- **Summarize button placement**:
  ```tsx
  {annotation.children && annotation.children.length > 0 && (
    <button onClick={() => handleSummarize(annotation.id)} className="summarize-btn">
      <DocumentIcon /> Summarize
    </button>
  )}
  ```

- **Thread label format**:
  ```typescript
  function getThreadLabel(thread: Annotation): string {
    const preview = thread.originalText.slice(0, 50);
    return preview.length < thread.originalText.length ? preview + "..." : preview;
  }
  ```

- **Summary annotation creation**:
  ```typescript
  function createSummaryAnnotation(threadParentId: string, summaryText: string): Annotation {
    return {
      id: generateStableId(/* ... */),
      blockId: threadParent.blockId,
      type: AnnotationType.COMMENT,
      text: summaryText,
      originalText: summaryText,
      isSummary: true,
      summarizesThreadId: threadParentId,
      createdA: Date.now(),
      // ... other fields
    };
  }
  ```

- **GraphQL resolution mutation**:
  ```typescript
  async function resolveThread(threadId: string, token: string): Promise<boolean> {
    const query = `
      mutation ResolveReviewThread($threadId: ID!) {
        resolveReviewThread(input: { threadId: $threadId }) {
          thread {
            isResolved
          }
        }
      }
    `;
    
    const response = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables: { threadId } }),
    });
    
    const result = await response.json();
    return result.data?.resolveReviewThread?.thread?.isResolved ?? false;
  }
  ```

- **Review submission flow**:
  ```typescript
  async function submitReview(
    event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT',
    body: string,
    annotations: Annotation[]
  ): Promise<void> {
    // 1. Sync pending annotations
    const unsyncedAnnotations = annotations.filter(a => !hasMapping(a.id));
    if (unsyncedAnnotations.length > 0) {
      await syncToGitHub(unsyncedAnnotations);
    }
    
    // 2. Submit review
    await submitBatchReview(owner, repo, prNumber, token, [], body, event);
    
    // 3. Show success toast
    showToast(`Review submitted: ${event}`, 'success');
  }
  ```

- **Resolved thread visual styling** (CSS):
  ```css
  .annotation.resolved {
    opacity: 0.7;
  }
  
  .annotation.resolved .resolved-badge {
    background: #28a745;
    color: white;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 10px;
    font-weight: bold;
  }
  ```

- **Summary annotation styling** (CSS):
  ```css
  .annotation.summary {
    background: #fff3cd; /* Light yellow */
    border-left: 4px solid #ffc107; /* Yellow accent */
    padding-left: 12px;
  }
  
  .annotation.summary .summary-badge {
    background: #ffc107;
    color: #212529;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 10px;
    font-weight: bold;
    margin-right: 4px;
  }
  
  .annotation.summary .summary-icon {
    width: 14px;
    height: 14px;
    margin-right: 4px;
  }
  ```

- **Thread picker modal structure**:
  ```tsx
  <Modal title="Select Thread to Summarize">
    {threads.map(thread => (
      <ThreadOption key={thread.id}>
        <ThreadPreview>{getThreadLabel(thread)}</ThreadPreview>
        <ThreadMeta>
          {thread.children.length} replies • Last: {formatTimestamp(thread.updatedAt)}
        </ThreadMeta>
        <SelectButton onClick={() => selectThread(thread.id)}>Summarize</SelectButton>
      </ThreadOption>
    ))}
  </Modal>
  ```

- **Markdown export format**:
  ```markdown
  # PR Review Summaries
  
  **PR:** #{prNumber} - {prTitle}
  **Generated:** {timestamp}
  
  ---
  
  ## Thread 1
  
  **Discussion:** Consider using async/await instead of callbacks...
  
  **Summary:** Agreed to refactor to async/await. Will be done in next commit.
  
  **Status:** Resolved
  **Resolved by:** @username on Apr 8, 3:45 PM
  
  ---
  
  ## Thread 2
  
  ...
  ```

- **Permission error handling**:
  ```typescript
  try {
    await resolveThread(threadId, token);
  } catch (error) {
    if (error.status === 403) {
      const message = error.message.includes('push access')
        ? 'You need write access to resolve threads'
        : 'You don't have permission to resolve this thread';
      showToast(message, 'error');
    }
  }
  ```

</specifics>

<deferred>
## Deferred Ideas

None - discussion stayed within phase scope.

</deferred>

---

*Phase: 07-thread-management-resolution*
*Context gathered: 2026-04-08*
