# Phase 7: Thread Management & Resolution - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-08
**Phase:** 07-thread-management-resolution
**Areas discussed:** Summary Annotation Creation Flow, Thread Selection UI, Resolution Timing & Confirmation, Review Submission Interface, Resolved Thread Visual Treatment, Summary Annotation Styling, Resolution Status Sync, GraphQL Implementation, Permission Errors, Bulk Operations

---

## Summary Annotation Creation Flow

### How should users start creating a summary annotation for a thread?

| Option | Description | Selected |
|--------|-------------|----------|
| Button on thread parent | Add 'Summarize' button/icon that appears when hovering over the parent annotation in a thread. Discoverable, contextual, requires existing GitHub discussion. | ✓ |
| Toolbar action | Add 'Create Summary' button to toolbar next to sync buttons. Always visible, but requires separate thread selection step. | |
| Right-click menu on thread | Context menu on any annotation in thread with 'Summarize this thread' option. Hidden until discovered, flexible context. | |

**User's choice:** Button on thread parent (Recommended)

### Once triggered, how does the user specify which thread to summarize?

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-detect from context | If triggered from thread parent, auto-select that thread. If from toolbar, show dropdown of active threads. Context-aware, fewer clicks. | ✓ |
| Always show thread picker | Modal with list of all threads, showing preview of each (first comment + reply count). Explicit choice, good for complex PRs with many threads. | |
| Use currently selected annotation | Summarize the thread containing the currently highlighted annotation. Fast but requires selecting an annotation first. | |

**User's choice:** Auto-detect from context (Recommended)

### Should summary annotations be editable after creation?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, editable like comments | User can click and edit summary text anytime before syncing. Flexible, allows refinement. Edits sync as updated text to GitHub. | ✓ |
| No, immutable once created | Summary is final when created. User must delete and recreate to change. Simpler state management, clearer intent. | |
| Editable until first sync | Can edit locally until synced to GitHub, then locked. Prevents divergence between Plannotator and GitHub after resolution. | |

**User's choice:** Yes, editable like comments (Recommended)

### What happens immediately after user writes the summary text?

| Option | Description | Selected |
|--------|-------------|----------|
| Save locally, sync separately | Summary saved as annotation, visible in panel with 'Summary' badge. User syncs to GitHub later via 'Sync to GitHub' button. Matches existing sync workflow. | ✓ |
| Immediate sync to GitHub | Summary posts to GitHub and resolves thread immediately on creation. Faster but no local review, requires active network. | |
| Confirmation dialog first | Show preview dialog: 'This will resolve the thread on GitHub. Continue?' before saving. Extra safety but adds friction. | |

**User's choice:** Save locally, sync separately (Recommended)

---

## Thread Selection UI

### How should threads be identified/labeled in the UI?

| Option | Description | Selected |
|--------|-------------|----------|
| First comment preview | Thread labeled by first 50 chars of root comment: 'Consider using async/await instead...'. Natural, context-rich, easy to scan in dropdowns. | ✓ |
| Author + timestamp | Label format: '@username on Apr 8, 2:30 PM'. Clear who started it, good for author-centric workflows. | |
| Line reference + preview | Format: 'Line 42: Consider using async/await...'. Combines location with content, helpful when multiple threads exist. | |

**User's choice:** First comment preview (Recommended)

### What if multiple threads exist on the same line/annotation?

| Option | Description | Selected |
|--------|-------------|----------|
| Group under parent | All threads on same line nest under the line annotation. 'Summarize' button on each thread parent, not the line. Keeps threads independent. | ✓ |
| Merge into single thread | Treat all comments on same line as one big thread. Single summarize action covers all. Simpler but may conflate unrelated discussions. | |
| Show thread picker modal | If multiple threads on line, show picker: 'Which thread do you want to summarize?' Lists all threads on that line. Explicit choice but extra click. | |

**User's choice:** Group under parent (Recommended)

### When summary is triggered from toolbar (no thread context), how does the picker work?

| Option | Description | Selected |
|--------|-------------|----------|
| Modal with thread list | Show modal listing all active threads with: thread label, reply count, last activity. Click to select. Good for complex PRs, clear overview. | ✓ |
| Dropdown menu inline | Dropdown attached to toolbar button showing thread labels. Select thread, then modal opens for summary text. More compact but limited preview. | |
| Skip toolbar trigger | Remove toolbar option entirely - only allow 'Summarize' from thread parent buttons. Simpler, one clear path, but less discoverable. | |

**User's choice:** Modal with thread list (Recommended)

### Should there be quick navigation between threads in the annotation panel?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, thread jump buttons | Add 'Previous Thread' / 'Next Thread' buttons at top of annotation panel. Clicking scrolls to and highlights next thread. Good for reviewing all discussions. | ✓ |
| Thread filter toggle | Add filter: 'Show only threads' that collapses non-threaded annotations. Focuses view on discussions. No navigation, just filtering. | |
| No special navigation | Threads appear in regular annotation order (chronological or by line). User scrolls manually. Simpler, less UI clutter. | |

**User's choice:** Yes, thread jump buttons (Recommended)

---

## Resolution Timing & Confirmation

### When does the thread actually resolve on GitHub?

| Option | Description | Selected |
|--------|-------------|----------|
| During outbound sync | Summary syncs to GitHub as final reply, then GraphQL mutation resolves thread. Happens when user clicks 'Sync to GitHub'. Matches existing sync workflow. | ✓ |
| Immediate on summary creation | Creating summary triggers immediate sync and resolution, no waiting. Faster but requires network, bypasses review step. | |
| Manual resolve action | Summary syncs as reply, but thread stays open until user explicitly clicks 'Resolve Thread' button. Maximum control but extra step. | |

**User's choice:** During outbound sync (Recommended)

### Should there be confirmation before resolving a thread?

| Option | Description | Selected |
|--------|-------------|----------|
| No confirmation | Sync proceeds without dialog. Resolution is expected behavior when syncing summary annotations. Can undo on GitHub if needed. | ✓ |
| Confirm on first summary only | First time user syncs a summary, show: 'Summary annotations will resolve threads on GitHub. Continue?' One-time education. | |
| Always confirm each thread | Before each thread resolves, show: 'Resolve thread: [preview]?' User approves individually. Safest but most friction. | |

**User's choice:** No confirmation (Recommended)

### What if sync succeeds but resolution fails (GitHub API error)?

| Option | Description | Selected |
|--------|-------------|----------|
| Leave thread open | Summary posts successfully as reply, but resolution fails silently. User can manually resolve on GitHub. Partial success better than rollback. | ✓ |
| Rollback the summary | Delete the summary comment from GitHub if resolution fails. All-or-nothing. Prevents incomplete state but more complex. | |
| Show error, keep local | Keep summary in Plannotator but mark as unsynced. Toast: 'Summary posted but thread not resolved.' User retries sync later. | |

**User's choice:** Leave thread open (Recommended)

### Can users undo a thread resolution?

| Option | Description | Selected |
|--------|-------------|----------|
| Unresolve on GitHub only | User can unresolve thread directly on GitHub if needed. Plannotator doesn't provide unresolve action. Simple, GitHub is source of truth for resolution. | ✓ |
| Unresolve button in Plannotator | Add 'Unresolve Thread' action that calls GitHub GraphQL to reopen. Convenient but adds complexity for rare use case. | |
| Delete summary to unresolve | Deleting summary annotation unresolves thread on next sync. Clear causality but may not match user intent (what if they just want to rewrite summary?). | |

**User's choice:** Unresolve on GitHub only (Recommended)

---

## Review Submission Interface

### Where should the PR review submission interface live?

| Option | Description | Selected |
|--------|-------------|----------|
| ExportModal as 'Review' tab | Add third tab to ExportModal: 'GitHub PR' (existing), 'Review'. Same modal pattern, keeps GitHub actions together. User opens modal, switches to Review tab. | ✓ |
| New toolbar buttons | Add 'Approve PR' and 'Request Changes' buttons to toolbar next to sync buttons. Always visible, fast access, but toolbar gets crowded. | |
| In annotation panel | Add review submission section at top/bottom of annotation panel. Contextual with annotations, but may be missed if panel closed. | |

**User's choice:** ExportModal as 'Review' tab (Recommended)

### Should submitting a review automatically sync all unsynced annotations?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, auto-sync first | Before submitting review, sync all pending annotations to GitHub. Review includes all current feedback. User sees: 'Syncing N annotations...' then review submits. | ✓ |
| No, require manual sync | User must click 'Sync to GitHub' before review submission. Review submission is separate action. More explicit, but easy to forget annotations. | |
| Ask user each time | If unsynced annotations exist, show: 'Sync N annotations with review? Yes/No'. User decides per review. Flexible but adds decision fatigue. | |

**User's choice:** Yes, auto-sync first (Recommended)

### Should users be able to add a review summary comment (separate from line annotations)?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, optional text field | Review modal has textarea: 'Overall feedback (optional)'. Posts as review body on GitHub. Standard PR review pattern, good for high-level comments. | ✓ |
| Yes, required text field | User must write overall feedback before submitting. Ensures thoughtful review, but may annoy for simple approvals. | |
| No, annotations only | Review submission just sends APPROVE/REQUEST_CHANGES event, no body text. Simpler, but misses GitHub convention of review summaries. | |

**User's choice:** Yes, optional text field (Recommended)

### What should the review action buttons say?

| Option | Description | Selected |
|--------|-------------|----------|
| GitHub terminology | Buttons: 'Approve' (green) and 'Request Changes' (red). Matches GitHub UI exactly, clear for GitHub users. | ✓ |
| Plannotator terminology | Buttons: 'Looks Good' and 'Needs Work'. Friendlier, less formal, matches Plannotator's existing approve/deny. | |
| Explicit PR language | Buttons: 'Approve PR' and 'Request PR Changes'. Longer but crystal clear this affects the PR, not the plan. | |

**User's choice:** GitHub terminology (Recommended)

---

## Resolved Thread Visual Treatment

### How should resolved threads look different from active threads?

| Option | Description | Selected |
|--------|-------------|----------|
| Badge + muted colors | Add 'Resolved' badge to thread parent, dim text to 70% opacity, keep structure visible. Clear status, maintains readability for reference. | ✓ |
| Strikethrough text | Strikethrough on all thread annotations like completed tasks. Strong visual signal, but may look messy with long threads. | |
| Just the badge | Add 'Resolved' badge but no color/opacity changes. Minimal, thread looks identical to active except for badge. Subtle. | |

**User's choice:** Badge + muted colors (Recommended)

### Should resolved threads collapse by default?

| Option | Description | Selected |
|--------|-------------|----------|
| No, keep expanded | Resolved threads stay expanded like active threads. User can manually collapse if desired. Easy to reference past discussions. | ✓ |
| Yes, auto-collapse | Resolved threads collapse automatically, showing only parent + 'Resolved' badge. Click to expand. Cleaner UI, focuses on active work. | |
| Collapse after N days | Threads auto-collapse 7 days after resolution. Recent resolutions stay expanded. Time-based relevance. | |

**User's choice:** No, keep expanded (Recommended)

### Should there be a filter to hide/show resolved threads?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, toggle in panel | Add checkbox in annotation panel header: 'Show resolved threads'. Unchecking hides all resolved. Good for focus on active discussions. | ✓ |
| No filter needed | All threads always visible, resolved or not. Simpler, full context always available. Rely on visual treatment (badge/muted) to distinguish. | |
| Filter in settings | Add setting in Settings modal: 'Hide resolved threads'. Global preference, not per-session toggle. Persistent but less flexible. | |

**User's choice:** Yes, toggle in panel (Recommended)

### Where should the 'Resolved' badge appear?

| Option | Description | Selected |
|--------|-------------|----------|
| On thread parent only | Badge appears once on the root comment that started the thread. Marks thread as resolved unit. Clean, not repetitive. | ✓ |
| On every annotation in thread | All thread members show 'Resolved' badge. Very clear status but visually noisy. | |
| On summary annotation | Badge only appears on the summary annotation that resolved the thread. Shows cause-and-effect relationship. | |

**User's choice:** On thread parent only (Recommended)

---

## Summary Annotation Styling

### Should summary annotations look different from regular comments?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, distinct styling | Different background color (e.g., light yellow/blue), 'Summary' badge, maybe border accent. Clearly distinguishable, highlights decisions. | ✓ |
| Subtle badge only | Same styling as regular comments but with 'Summary' badge. Minimal difference, blends with thread. | |
| No visual difference | Summaries look identical to comments. Only distinguishable by content. Simplest but may be hard to find. | |

**User's choice:** Yes, distinct styling (Recommended)

### Should summaries show which thread they're summarizing?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, show thread context | Summary displays: 'Summary of: [first comment preview]' as header or tooltip. Clear relationship, helpful when scrolling past. | ✓ |
| No, infer from position | Summary appears as last reply in thread. Position implies relationship. Simpler, less text clutter. | |
| Link to thread parent | Summary has clickable link: 'Jump to thread start'. User can navigate to beginning. Interactive but adds complexity. | |

**User's choice:** Yes, show thread context (Recommended)

### Should summary annotations have a special icon?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, document/check icon | Add icon next to 'Summary' badge (document with checkmark, or clipboard). Visual distinction, quicker scanning. | ✓ |
| Yes, but only when resolved | Show icon (checkmark) only after thread resolves. Icon = resolution indicator. Dual purpose badge. | |
| No icon, badge enough | Just text badge 'Summary', no icon. Simpler, less visual noise. | |

**User's choice:** Yes, document/check icon (Recommended)

### Where should summaries appear in the thread structure?

| Option | Description | Selected |
|--------|-------------|----------|
| As last child reply | Summary is final reply in thread's children array. Chronological, natural conclusion to discussion. | ✓ |
| Separate summary section | Thread has: [Parent] → [Replies] → [Summary section]. Visually separate, but breaks simple nesting. | |
| Pinned to top of thread | Summary appears first (above all replies) when thread has one. Immediate visibility, but unusual reading order. | |

**User's choice:** As last child reply (Recommended)

---

## Resolution Status Sync (Inbound)

### When should Plannotator check if threads were resolved on GitHub?

| Option | Description | Selected |
|--------|-------------|----------|
| During inbound sync | Fetch resolution status when user clicks 'Sync from GitHub'. Updates thread state along with new comments. Fits existing sync pattern. | ✓ |
| On page load | Check resolution status when plan loads. Always fresh but adds API call overhead on every load. | |
| Never (GitHub pushes only) | Plannotator never checks GitHub for resolution state. Only knows about threads it resolved itself. Simpler but incomplete view. | |

**User's choice:** During inbound sync (Recommended)

### Should resolution status be cached locally?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, in thread metadata | Store `isResolved: boolean` flag on each thread annotation. Updates during sync. Fast local reads, may be stale between syncs. | ✓ |
| No, fetch on demand | Query GitHub API when user expands/views thread. Always current but slow, many API calls. | |
| Cache with TTL | Cache resolution status for 5 minutes. Refresh if stale. Balance freshness and API efficiency. | |

**User's choice:** Yes, in thread metadata (Recommended)

### Should users see a warning when resolution status might be stale?

| Option | Description | Selected |
|--------|-------------|----------|
| No warning | Trust cached status. User can manually sync if they want fresh data. Simple, no UI clutter. | ✓ |
| Show last sync time | Display: 'Threads synced 10 minutes ago' in panel header. User decides if they need refresh. Informational. | |
| Stale indicator on threads | After N minutes, show '?' icon on thread badges. User knows data may be outdated. Per-thread granularity. | |

**User's choice:** No warning (Recommended)

### How should Plannotator fetch resolution status from GitHub?

| Option | Description | Selected |
|--------|-------------|----------|
| Extend review comments API | Fetch thread metadata alongside review comments during inbound sync. Single API call, batch operation. May need custom endpoint. | ✓ |
| Separate GraphQL query | After fetching comments, run GraphQL query for all thread resolution states. Two-phase sync but uses official GitHub fields. | |
| REST API per thread | Query /pulls/{pr}/reviews/{review_id}/comments/{comment_id} for each thread. Simple but many API calls, slow. | |

**User's choice:** Extend review comments API (Recommended)

### What if someone resolves a thread directly on GitHub (not via Plannotator summary)?

| Option | Description | Selected |
|--------|-------------|----------|
| Show as resolved | Display thread with 'Resolved' badge even without summary annotation. Reflects GitHub state accurately. Resolution can happen anywhere. | ✓ |
| Show different badge | Use 'Resolved on GitHub' badge to distinguish from Plannotator summaries. Makes origin clear but more complex. | |
| Ignore external resolutions | Only show threads as resolved if Plannotator created the summary. Simpler but incomplete view. | |

**User's choice:** Show as resolved (Recommended)

### What if a resolved thread is re-opened on GitHub?

| Option | Description | Selected |
|--------|-------------|----------|
| Update on sync | Next inbound sync detects re-opened status, removes 'Resolved' badge. Thread becomes active again. Stays synchronized. | ✓ |
| Keep resolved locally | Plannotator doesn't track re-opening. Thread stays resolved in UI even if GitHub re-opened it. Simpler but can diverge. | |
| Notify user of change | Toast: 'Thread X was re-opened on GitHub' during sync. User can review. More awareness but noisier. | |

**User's choice:** Update on sync (Recommended)

### Should resolution status sync for threads without summary annotations?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, all threads | Sync resolution status for every thread regardless of summary existence. Complete GitHub state view. | ✓ |
| No, summaries only | Only track resolution for threads with Plannotator summaries. Simpler, focuses on user's work. | |
| Optional setting | User can toggle 'Show external resolutions' in settings. Flexibility but adds configuration. | |

**User's choice:** Yes, all threads (Recommended)

### How should resolution sync handle PRs with 100+ threads?

| Option | Description | Selected |
|--------|-------------|----------|
| Batch API calls | Fetch resolution status in batches of 50 threads per API call. Efficient, handles large PRs well. | ✓ |
| Lazy load on scroll | Only fetch resolution status for visible threads. Load more as user scrolls. Faster initial load but complex. | |
| Limit to first 50 | Only sync resolution for first 50 threads. Show warning: 'Large PR, some resolution status not synced'. Simple but incomplete. | |

**User's choice:** Batch API calls (Recommended)

---

## GraphQL Implementation

### How should GraphQL be integrated into the GitHub plugin?

| Option | Description | Selected |
|--------|-------------|----------|
| Inline fetch with schema | Use standard fetch() with GraphQL query strings. No extra dependencies. Simple, lightweight, same auth pattern as REST. | ✓ |
| Dedicated GraphQL client | Add graphql-request or apollo-client library. Typed queries, better error handling, but adds dependency and bundle size. | |
| GitHub SDK (Octokit) | Use @octokit/graphql package. Official GitHub client, but another dependency. More features than needed. | |

**User's choice:** Inline fetch with schema (Recommended)

### What if GraphQL resolution fails?

| Option | Description | Selected |
|--------|-------------|----------|
| Leave thread open | Summary syncs successfully as reply, but resolution fails. Thread stays active. User can manually resolve on GitHub. Matches previous decision. | ✓ |
| Retry with backoff | Auto-retry GraphQL mutation 3x with exponential backoff. Handles transient failures. Eventually shows error if all retries fail. | |
| Fall back to REST | Try REST API equivalent if GraphQL fails. Maximum compatibility but REST doesn't support thread resolution (would need alternative approach). | |

**User's choice:** Leave thread open (Recommended)

### How should GraphQL rate limits be handled?

| Option | Description | Selected |
|--------|-------------|----------|
| Same as REST | Use same rate limit handling pattern from Phase 4/5: check headers, wait for reset, retry. Consistent error handling. | ✓ |
| GraphQL-specific limits | GitHub GraphQL has separate rate limiting (point system). Track points, show remaining quota. More complex but more accurate. | |
| No special handling | Treat GraphQL errors like other API errors. Simpler but may not provide best user experience for rate limits. | |

**User's choice:** Same as REST (Recommended)

### How should the resolution mutation be structured?

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal mutation | Single GraphQL mutation: resolveReviewThread(threadId). Returns success/error. Simple, focused on one action. | ✓ |
| Batch mutation | Resolve multiple threads in one GraphQL call. More efficient for bulk operations but more complex error handling. | |
| Mutation with metadata | Mutation includes resolvedBy, resolvedAt metadata. Richer audit trail but GitHub may not support custom fields. | |

**User's choice:** Minimal mutation (Recommended)

---

## Permission Errors

### How should Plannotator detect if user can resolve threads?

| Option | Description | Selected |
|--------|-------------|----------|
| Check on first action | Attempt resolution when user syncs first summary. If denied, cache permission state and show error. Lazy check, no upfront API call. | ✓ |
| Check at PR load | Query GitHub permissions when plan loads. Pre-validate before user creates summaries. Extra API call but early feedback. | |
| No pre-check | Always allow summary creation. Show error only if resolution fails during sync. Simplest but user discovers limitations late. | |

**User's choice:** Check on first action (Recommended)

### What should happen to the UI when user lacks resolution permission?

| Option | Description | Selected |
|--------|-------------|----------|
| Disable resolve, allow summary | User can still create summary annotations (post as replies on GitHub), but thread won't auto-resolve. Toast: 'Summary posted; you don't have permission to resolve threads'. | ✓ |
| Disable summarize button | Hide or disable 'Summarize' button entirely. User can't create summaries if they can't resolve. Prevents confusion but limits functionality. | |
| Show warning badge | Summarize button shows '!' warning badge. User can proceed but knows resolution may fail. Informed choice. | |

**User's choice:** Disable resolve, allow summary (Recommended)

### What if PR is closed or merged when user tries to sync summary?

| Option | Description | Selected |
|--------|-------------|----------|
| Show specific error | Toast: 'PR is closed - can't sync annotations'. Clear reason. User understands limitation. Summary stays local. | ✓ |
| Allow sync anyway | GitHub API may still accept comments on closed PRs. Try sync, handle error if rejected. Permissive approach. | |
| Check PR state first | Verify PR is open before syncing. If closed, disable sync button. Proactive but adds API call. | |

**User's choice:** Show specific error (Recommended)

### How should permission errors be communicated?

| Option | Description | Selected |
|--------|-------------|----------|
| Specific actionable messages | Tailor message to error: 'You need write access to resolve threads' or 'PR author must resolve this thread'. Helps user understand next steps. | ✓ |
| Generic error with link | Show: 'Permission denied. [View on GitHub]' button. User clicks through to GitHub to see full context. | |
| Technical error details | Display full GitHub API error: '403 Forbidden: resolveReviewThread requires push access'. Complete info but not user-friendly. | |

**User's choice:** Specific actionable messages (Recommended)

---

## Bulk Operations

### Should users be able to create summaries for multiple threads at once?

| Option | Description | Selected |
|--------|-------------|----------|
| No, one at a time | Each summary is unique decision. User writes summaries individually. Quality over speed, thoughtful resolutions. | ✓ |
| Yes, with template | Select multiple threads, apply summary template: 'Addressed in commit XYZ'. Fast for simple resolutions, but may be generic. | |
| Yes, with individual forms | Multi-thread picker, then modal with text field per thread. Batch UI but unique summaries. Complex interface. | |

**User's choice:** No, one at a time (Recommended)

### Should users be able to resolve threads without summaries (bulk acknowledge)?

| Option | Description | Selected |
|--------|-------------|----------|
| No, summaries required | Thread resolution always needs summary annotation. Ensures decisions are documented. Matches project philosophy (no AI summaries, author-written). | ✓ |
| Yes, simple acknowledge | Add 'Resolve without summary' action. Creates empty summary or just resolves. Fast but loses documentation. | |
| Yes, with template comment | Bulk resolve posts templated comment: 'Acknowledged' to each thread. Documents action but still generic. | |

**User's choice:** No, summaries required (Recommended)

### Should users be able to export all summaries as a document?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, markdown export | Add 'Export Summaries' button that generates markdown doc with all thread summaries. Good for reports, meeting notes, PR description updates. | ✓ |
| Yes, copy to clipboard | Copy all summaries as plain text to clipboard. Quick share, but loses formatting and thread context. | |
| No export needed | Summaries live on GitHub and in Plannotator. No separate export. Simplest, rely on existing systems. | |

**User's choice:** Yes, markdown export (Recommended)

### If bulk operations are supported, how should multi-selection work?

| Option | Description | Selected |
|--------|-------------|----------|
| Not applicable | No bulk operations based on previous answers. No multi-select UI needed. Keep it simple. | ✓ |
| Checkboxes on threads | Add checkbox to each thread parent. Select multiple, then bulk action buttons appear. Standard pattern. | |
| Shift-click selection | Click first thread, shift-click last thread to select range. Keyboard-friendly but less discoverable. | |

**User's choice:** Not applicable (Recommended)

---

## Claude's Discretion

Areas where Claude has flexibility in implementation:

- Summary button icon choice
- Thread jump button icons and placement
- Modal layout for thread picker
- Summary background color and border styling
- Resolution badge color and shape
- Document/checkmark icon specifics
- Export markdown formatting structure
- Toast duration and auto-dismiss behavior
- Thread preview truncation length
- Muted color opacity for resolved threads
- Batch size for resolution status API calls
- GraphQL error retry logic details

---

*Discussion log created: 2026-04-08*
