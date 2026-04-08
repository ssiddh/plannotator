# Phase 6: Outbound Sync - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-08
**Phase:** 06-outbound-sync
**Areas discussed:** Sync scope & filtering, Drift handling strategy, Image reference strategy, Sync button behavior

---

## Sync scope & filtering

| Option | Description | Selected |
|--------|-------------|----------|
| New annotations only (Recommended) | Export annotations without KV mapping (commentId not set). Simple, matches inbound pattern. Skip already-synced annotations. Clean separation: Phase 6 handles new, Phase 7 handles edits/deletions. | |
| All unsynced annotations | Same as 'new only' but also retry previously-failed exports. Includes annotations where mapping failed but user wants to retry. More forgiving for network failures. | |
| New + edited annotations | Export new annotations AND detect local edits to already-synced annotations (compare text against GitHub comment). Post as new reply in thread. More complex: requires edit detection logic, thread reply handling. | ✓ |
| You decide | Claude chooses the sync scope that best balances simplicity and user expectations for an outbound sync button. | |

**User's choice:** New + edited annotations

**Notes:** This requires fetching current GitHub comment state during outbound sync to detect edits. Edited annotations will be posted as threaded replies to preserve history.

---

## Edit detection method

| Option | Description | Selected |
|--------|-------------|----------|
| Compare text field (Recommended) | If KV mapping exists, fetch GitHub comment and compare annotation.text to comment.body. If different, post as reply. Simple, reliable. Catches all text changes. | ✓ |
| Track edit timestamp | Add 'lastEditedAt' field to Annotation type. Compare against GitHub comment updated_at. More precise but requires new schema field and edit tracking in UI. | |
| You decide | Claude chooses the edit detection method that best balances accuracy and implementation simplicity. | |

**User's choice:** Compare text field (Recommended)

**Notes:** Simple and reliable without requiring schema changes. Fetch GitHub comment body and compare to local annotation text.

---

## Edit format

| Option | Description | Selected |
|--------|-------------|----------|
| Post as reply in thread (Recommended) | New comment in the same thread: 'Updated: [new text]'. Preserves history, matches GitHub's edit pattern (shows edit history). Works with GitHub API. | ✓ |
| Replace original comment | Update the original GitHub comment body. Cleaner but loses edit history. GitHub API may not allow editing others' comments. | |
| You decide | Claude chooses how edited annotations should appear on GitHub. | |

**User's choice:** Post as reply in thread (Recommended)

**Notes:** Preserves edit history on GitHub. Original comment remains, update appears as threaded reply.

---

## Drift handling strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Warn but allow (Recommended) | Show banner: 'Plan changed — line numbers may be incorrect'. Let user proceed. Safer than blocking (user may have good reason), clearer than silent auto-remap. Matches Phase 4 D-15. | ✓ |
| Block sync entirely | Prevent outbound sync when drift detected. User must re-create PR or manually fix drift. Safest but may frustrate users who know their changes are safe (e.g., typo fixes). | |
| Auto-remap lines | Try to intelligently remap annotation positions to new line numbers. Complex: requires diff algorithm, heuristics for matching blocks. May map incorrectly, causing wrong line comments. | |
| You decide | Claude chooses the drift strategy that balances safety and user experience for outbound sync. | |

**User's choice:** Warn but allow (Recommended)

**Notes:** Consistent with Phase 4's drift warning pattern. Non-blocking, provides clear feedback about risk.

---

## Image reference strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Skip images, text only (Recommended) | Same as Phase 4 D-07. Show warning: 'N annotations with images will sync text only'. Simple, no upload infrastructure needed. User can manually attach images on GitHub if needed. | ✓ |
| Upload to GitHub Gist | Upload images to anonymous Gist, embed URL in comment. Preserves images but adds complexity: Gist API calls, failure handling, orphaned Gists on retry. Images persist on GitHub. | |
| Reference as markdown links | Include image references in comment body with markdown syntax. User must manually upload images somewhere and update links. Keeps images in workflow but requires user action. | |
| You decide | Claude chooses the image handling strategy that balances feature completeness and implementation complexity. | |

**User's choice:** Skip images, text only (Recommended)

**Notes:** Consistent with Phase 4 D-07. Simple, no upload infrastructure. Show warning toast when annotations with images are synced.

---

## Sync button behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Two separate buttons (Recommended) | Toolbar has 'Sync from GitHub' (Phase 5) and 'Sync to GitHub' (Phase 6). Clear intent, no ambiguity. Toolbar has room. Matches Phase 5 D-01 pattern. | ✓ |
| Single bidirectional button | One 'Sync with GitHub' button that does both directions automatically. Simpler UI but less control. User can't choose to only pull or only push. | |
| Dropdown menu | Single 'Sync' button with dropdown: 'From GitHub', 'To GitHub', 'Both ways'. Clean toolbar but extra click. Good if toolbar space is limited. | |
| You decide | Claude chooses the button arrangement that best balances clarity and toolbar real estate. | |

**User's choice:** Two separate buttons (Recommended)

**Notes:** Clear intent, matches Phase 5 pattern. Toolbar has room for both buttons side-by-side.

---

## Outbound badge

| Option | Description | Selected |
|--------|-------------|----------|
| Yes - count unsynced (Recommended) | Badge shows count of annotations without KV mapping (new annotations). Matches inbound badge pattern. Updates when user adds annotations. | ✓ |
| No badge | Button has no badge. Simpler, less visual clutter. User clicks when ready to sync, no proactive count. | |
| You decide | Claude decides whether outbound button needs a badge indicator. | |

**User's choice:** Yes - count unsynced (Recommended)

**Notes:** Matches inbound badge pattern. Shows count of new annotations (no KV mapping), updates reactively.

---

## Claude's Discretion

- Exact button icon for outbound sync (upload icon, cloud upload, arrow up)
- Badge positioning relative to inbound button
- Toast duration and auto-dismiss timing
- Retry backoff timing specifics
- Warning banner styling for drift detection
- Edit reply prefix wording ("Updated:" vs "Changed to:" vs "Edit:")
- Error message wording for different failure types

## Deferred Ideas

None mentioned during discussion.
