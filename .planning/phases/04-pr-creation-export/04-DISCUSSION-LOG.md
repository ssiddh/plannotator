# Phase 4: PR Creation & Export - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-02
**Phase:** 04-pr-creation-export
**Areas discussed:** PR Creation UI Flow, Annotation Export Strategy, PR Metadata Storage, Line Positioning & Drift, Error Handling & Recovery, Markdown File Structure

---

## PR Creation UI Flow

### Question 1: Where should the 'Create PR' action live?

| Option | Description | Selected |
|--------|-------------|----------|
| Toolbar button (Recommended) | Add 'Create PR' next to Approve/Deny buttons. Natural fit with existing toolbar pattern, always visible. | |
| Settings panel | GitHub tab in Settings with 'Export to PR' button. Separates configuration from action, requires extra click. | |
| Dedicated Export modal | New 'Export' menu/button that opens a modal with PR and other export options. Extensible for future export formats. | ✓ |

**User's choice:** Dedicated Export modal
**Notes:** Chosen for extensibility — can add Notion, Jira, etc. export options in future without cluttering toolbar

### Question 2: What information should users provide when creating a PR?

| Option | Description | Selected |
|--------|-------------|----------|
| One-click (Recommended) | Just click and go. Auto-generate PR title from plan heading, use defaults from config. Fastest UX, no friction. | ✓ |
| Minimal modal | Popup with PR title (editable) and description (editable). Gives control over PR content before creation. | |
| Full form | Title, description, reviewers, labels, base branch. Maximum control but slower workflow. | |

**User's choice:** One-click (Recommended)
**Notes:** Fast workflow prioritized — extract title from plan heading, use GitHub config defaults

### Question 3: How should success be communicated after PR creation?

| Option | Description | Selected |
|--------|-------------|----------|
| Toast + link (Recommended) | Brief success toast notification with 'View PR' link that opens GitHub. Non-intrusive, allows continuing work. | ✓ |
| Modal confirmation | Full-screen modal showing PR URL, number, and actions (View on GitHub, Copy Link, Sync Now). Requires dismiss. | |
| Banner at top | Persistent banner showing PR status with link. Stays visible until dismissed, good for reference. | |

**User's choice:** Toast + link (Recommended)
**Notes:** Non-intrusive UX, user can continue working in Plannotator

### Question 4: How should errors be communicated if PR creation fails?

| Option | Description | Selected |
|--------|-------------|----------|
| Toast + retry (Recommended) | Error toast with message and 'Retry' button. Keeps user in context, easy recovery for transient failures. | ✓ |
| Modal with details | Error modal showing full error message, GitHub API response, and actions (Retry, Copy Error, Cancel). More info for debugging. | |
| Inline banner | Red banner at top of UI with error message. Stays until dismissed, less intrusive than modal. | |

**User's choice:** Toast + retry (Recommended)
**Notes:** Easy recovery pattern for network errors and rate limits

---

## Annotation Export Strategy

### Question 1: How should annotations be submitted to GitHub?

| Option | Description | Selected |
|--------|-------------|----------|
| Single batch review (Recommended) | Submit all annotations as one GitHub review (PR-04). Single notification, cleaner for reviewers. Requires review state (approve/comment/request changes). | ✓ |
| Individual comments | Post each annotation as a separate PR comment. Multiple notifications but simpler API usage. No review state needed. | |
| Hybrid: batch initial, individual later | First export uses batch review, subsequent syncs post individual comments. Best of both but more complex logic. | |

**User's choice:** Single batch review (Recommended)
**Notes:** PR-04 requirement — single notification, cleaner GitHub UX

### Question 2: How should DELETION annotations be exported to GitHub?

| Option | Description | Selected |
|--------|-------------|----------|
| Suggestion blocks (Recommended) | Convert to ```suggestion\n(empty)\n``` format (PR-05). GitHub renders as 'Apply suggestion' button. Native UX. | ✓ |
| Comment with strikethrough | Regular comment with ~~deleted text~~ markdown. Visual but not actionable. Simpler implementation. | |
| Suggestion with replacement | If user provided replacement text, use that in suggestion block. Otherwise empty. Flexible but needs UI for replacement text. | |

**User's choice:** Suggestion blocks (Recommended)
**Notes:** PR-05 requirement — GitHub native "Apply suggestion" UX

### Question 3: How should annotations with images be handled when syncing to GitHub?

| Option | Description | Selected |
|--------|-------------|----------|
| Reference external URLs | Keep temp file paths as-is or reference share.plannotator.ai URLs. Images not uploaded to GitHub. Simple but images may expire. | |
| Upload to GitHub Gist (Recommended) | Create anonymous Gist with image files, embed Gist URLs in comment body. Permanent, GitHub-hosted, SYNC-OUT-08 compliant. | |
| Warn and skip images | Show warning that images can't be synced, post comments without image references. Prevents broken links but loses context. | ✓ |

**User's choice:** Warn and skip images
**Notes:** Simpler implementation for Phase 4 — Gist upload deferred to Phase 6 (Outbound Sync)

### Question 4: When multiple annotations target the same line, how should they appear in GitHub?

| Option | Description | Selected |
|--------|-------------|----------|
| Separate comments (Recommended) | Each annotation becomes its own PR comment on that line. GitHub groups them as a thread. Preserves distinct annotation IDs. | ✓ |
| Combined comment | Merge annotations on same line into single comment with numbered list. Single notification but loses individual tracking. | |
| Primary + replies | First annotation as comment, others as replies to that thread. Hierarchical but complex to maintain bidirectional sync. | |

**User's choice:** Separate comments (Recommended)
**Notes:** Preserves bidirectional mapping — each annotation gets unique GitHub comment ID

---

## PR Metadata Storage

### Question 1: Where should PR metadata (repo, number, URL) be persisted?

| Option | Description | Selected |
|--------|-------------|----------|
| KV store (Recommended) | Server-side KV with key sync:{pasteId}:pr. Consistent with Phase 3 sync infrastructure. Survives page reloads, works cross-device. | ✓ |
| Embedded in paste | Extend paste metadata with prMetadata field. Single source of truth but requires paste update logic and schema migration. | |
| Client localStorage | Store in browser localStorage only. Simple but device-specific, lost on cache clear. Not suitable for multi-device workflows. | |

**User's choice:** KV store (Recommended)
**Notes:** Consistent with Phase 3 patterns (syncMappings, syncState)

### Question 2: Should PR metadata include plan hash for drift detection (Phase 3 D-08)?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes (Recommended) | Store SHA-256 of plan markdown at PR creation. Enables drift warning on sync (SYNC-OUT-04/05). Minimal overhead, high value. | ✓ |
| No, check file on GitHub instead | Fetch plan file from PR branch and compare to current. More accurate but extra API call and network latency. | |
| Skip drift detection for now | Defer to Phase 6 (Outbound Sync). Simpler Phase 4 but loses validation safety net. | |

**User's choice:** Yes (Recommended)
**Notes:** Phase 3 infrastructure ready (PRMetadataWithSync type) — use it for safety

### Question 3: How long should PR metadata persist in storage?

| Option | Description | Selected |
|--------|-------------|----------|
| Same as paste TTL (Recommended) | PR metadata expires when paste expires (30 days or custom). Consistent lifecycle, no orphaned metadata (Phase 3 D-06 pattern). | ✓ |
| Permanent until PR closed | Never expire, only delete when PR is closed/merged. Requires PR webhook or polling to detect closure. Complex. | |
| Short TTL (7 days) | Assume active reviews finish within a week. Reduces storage but may lose metadata for slow reviews. | |

**User's choice:** Same as paste TTL (Recommended)
**Notes:** Phase 3 D-06 pattern — sync metadata TTL matches paste expiry

### Question 4: How should the UI check if a paste already has an associated PR?

| Option | Description | Selected |
|--------|-------------|----------|
| On load via API (Recommended) | GitHubProvider fetches /api/pr/{pasteId}/metadata on mount. Auto-populates prMetadata state. Standard React pattern. | ✓ |
| Lazy on user action | Only fetch when user opens Export modal or clicks sync. Saves API call if not using GitHub features. | |
| Embedded in share payload | Include PR metadata in compressed share URL. No API call needed but increases URL size and couples paste to PR. | |

**User's choice:** On load via API (Recommended)
**Notes:** Eager loading — GitHubProvider hydration on mount

---

## Line Positioning & Drift

### Question 1: How should annotations be mapped to PR line numbers?

| Option | Description | Selected |
|--------|-------------|----------|
| Use block.startLine directly (Recommended) | Annotation's blockId → block.startLine from parser (Phase 3 D-07). Simple, already exists. All annotations on same block go to same line. | ✓ |
| Calculate offset within block | block.startLine + character offset converted to line offset. More precise but complex. Annotations could land on different lines within a multi-line block. | |
| GitHub line from diff context | Map to line numbers in PR diff view (not file lines). Accurate for reviews but requires fetching diff and parsing hunks. High complexity. | |

**User's choice:** Use block.startLine directly (Recommended)
**Notes:** Phase 3 D-07 — simple, already implemented in parser

### Question 2: For annotations on multi-line blocks (code, lists, paragraphs), where should the comment appear?

| Option | Description | Selected |
|--------|-------------|----------|
| Block start (Recommended) | All annotations on a multi-line block appear at its first line. Simple, consistent. GitHub groups them as a thread. | ✓ |
| Annotation start offset | Try to calculate line offset from block start based on character position. More precise but fragile with markdown formatting. | |
| Block end | Appear at last line of block. Useful for 'summary' style annotations but counterintuitive for inline comments. | |

**User's choice:** Block start (Recommended)
**Notes:** Matches block.startLine pattern, GitHub threads multiple comments

### Question 3: When plan markdown changes after PR creation, how should Phase 4 handle it?

| Option | Description | Selected |
|--------|-------------|----------|
| Warn in UI (Recommended) | Compare plan hash, show warning banner if changed. User can still proceed or cancel. Matches Phase 3 D-09 and SYNC-OUT-05. | ✓ |
| Block PR creation | Prevent creating new PR if plan changed since last one. Forces user to recreate from fresh plan. Strict but safe. | |
| Auto-recreate PR | Detect change, close old PR, create new one automatically. Seamless but destructive (loses GitHub discussion history). | |

**User's choice:** Warn in UI (Recommended)
**Notes:** Phase 3 D-09 pattern — warn but allow user to proceed

### Question 4: What level of change should trigger a drift warning?

| Option | Description | Selected |
|--------|-------------|----------|
| Any content change (Recommended) | Full plan markdown hash comparison. Even typo fixes trigger warning. Safe but may be noisy for minor edits. | ✓ |
| Structural changes only | Only warn if block count or IDs changed. Allows typo fixes without warning. More complex hash logic. | |
| Line count changes | Warn only if line count differs. Simple check but misses reordering or block ID changes. | |

**User's choice:** Any content change (Recommended)
**Notes:** Full hash comparison — safest, matches Phase 3 approach

---

## Error Handling & Recovery

### Question 1: If PR creation fails partway (e.g., branch created but PR API fails), what should happen?

| Option | Description | Selected |
|--------|-------------|----------|
| Rollback automatically (Recommended) | Delete created branch, revert all partial state. Clean slate for retry. Requires cleanup logic but safest UX. | ✓ |
| Leave incomplete | Branch stays on GitHub, user sees error, can manually fix or retry. Useful for debugging but leaves orphaned branches. | |
| Save partial state | Store what succeeded (branch SHA, etc.) so retry can resume. Most efficient but high complexity for edge cases. | |

**User's choice:** Rollback automatically (Recommended)
**Notes:** Clean slate for retry — delete created branch on failure

### Question 2: How should 429 (rate limit exceeded) errors from GitHub API be handled?

| Option | Description | Selected |
|--------|-------------|----------|
| Retry with backoff (Recommended) | Check X-RateLimit-Reset header, auto-retry after wait period. User sees progress. Handles transient limits gracefully. | ✓ |
| Fail immediately | Show error with rate limit message and 'Retry' button. Simpler but puts burden on user to retry manually. | |
| Queue for later | Save operation, retry in background after rate limit resets. Complex but seamless UX. | |

**User's choice:** Retry with backoff (Recommended)
**Notes:** Auto-retry with exponential backoff (1s, 2s, 4s), show "Retrying..." indicator

### Question 3: If GitHub token is invalid/expired during PR creation, what should happen?

| Option | Description | Selected |
|--------|-------------|----------|
| Clear state and prompt re-auth (Recommended) | Remove invalid token, redirect to OAuth login with return_to URL (Phase 2 pattern). User re-authenticates, then retries. | ✓ |
| Silent refresh attempt | Try to refresh token using refresh_token (Phase 2 oauth.ts). Fall back to re-auth if refresh fails. More seamless but complex. | |
| Show error, manual re-auth | Error message with 'Sign in again' button. User manually logs in from error state. Simple but more clicks. | |

**User's choice:** Clear state and prompt re-auth (Recommended)
**Notes:** Phase 2 D-19 pattern — OAuth flow with return_to URL

### Question 4: How should temporary network errors (timeouts, DNS failures) be handled?

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-retry 3x (Recommended) | Exponential backoff (1s, 2s, 4s). User sees 'Retrying...' indicator. Handles flaky networks without user action. | ✓ |
| Fail immediately | Show network error, user retries manually. Simple but frustrating for users on unreliable connections. | |
| Offline queue | Save operation, auto-retry when connectivity restored. Complex but best offline UX. | |

**User's choice:** Auto-retry 3x (Recommended)
**Notes:** Exponential backoff (1s, 2s, 4s) — user sees "Retrying..." indicator

---

## Markdown File Structure

### Question 1: Where should the plan markdown be committed in the PR?

| Option | Description | Selected |
|--------|-------------|----------|
| plans/{pasteId}.md (Recommended) | Current pattern from pr.ts. Organized in plans/ directory, unique by paste ID. Clean separation from code. | ✓ |
| docs/plans/{pasteId}.md | Nested under docs/ for documentation organization. Better for repos with existing docs structure. | |
| User-configurable path | Allow setting in GitHub config. Flexible but adds configuration complexity. | |

**User's choice:** plans/{pasteId}.md (Recommended)
**Notes:** Keep existing pr.ts pattern — clean separation from code

### Question 2: What should the PR description (body) contain?

| Option | Description | Selected |
|--------|-------------|----------|
| Summary + link (Recommended) | Brief summary extracted from plan heading, link to full plan on Plannotator. Keeps PR description concise, full content in file. | ✓ |
| Full plan markdown | Complete plan content in PR body. Duplicates file content but readable without opening file. Can exceed GitHub's 65k char limit. | |
| Metadata only | Just paste ID, created date, author. Minimal clutter, relies on file for content. | |

**User's choice:** Summary + link (Recommended)
**Notes:** Concise PR body, link to share.plannotator.ai for full context

### Question 3: What should the PR branch be named?

| Option | Description | Selected |
|--------|-------------|----------|
| plan/{pasteId} (Recommended) | Current pattern. Clear namespace, unique. Example: plan/a3f9d2b8 | ✓ |
| plannotator/{pasteId} | More explicit tool attribution. Example: plannotator/a3f9d2b8 | |
| User-defined prefix | Configurable prefix + paste ID. Flexible for team conventions but adds configuration. | |

**User's choice:** plan/{pasteId} (Recommended)
**Notes:** Keep existing pr.ts pattern — clear namespace

### Question 4: What should the commit message say?

| Option | Description | Selected |
|--------|-------------|----------|
| Auto from plan heading (Recommended) | Extract first # heading as commit title, add 'Generated via Plannotator' trailer. Descriptive and attributed. | ✓ |
| Generic template | 'Add plan review: {pasteId}' (current pattern). Simple but less informative. | |
| User-editable | Let user edit commit message before PR creation. Maximum control but slows one-click workflow. | |

**User's choice:** Auto from plan heading (Recommended)
**Notes:** Extract heading, add attribution trailer — descriptive + fast workflow

---

## Claude's Discretion

Areas where user said "you decide" or deferred to implementation:

- Toast notification duration (5-8 seconds auto-dismiss suggested)
- Retry backoff timing specifics (1s, 2s, 4s suggested)
- Warning banner styling and placement in UI
- Export modal design (icon, wording, layout)
- Error message wording for different failure types

## Deferred Ideas

None captured during discussion.
