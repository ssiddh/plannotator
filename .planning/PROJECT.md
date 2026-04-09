# Plannotator GitHub Integration Plugin

## What This Is

A GitHub integration plugin for Plannotator that enables authenticated sharing and collaborative plan reviews via GitHub PRs. Users can review plans in Plannotator or GitHub, with annotations and PR comments syncing bidirectionally. Discussion threads on GitHub can be consolidated into summary annotations that capture final decisions.

## Core Value

Plan reviews happen seamlessly in both Plannotator and GitHub, with discussions staying synchronized and decisions properly documented.

## Requirements

### Validated

- [x] All GitHub-specific code lives in a plugin architecture (minimal core changes) — Validated in Phase 1: Plugin Architecture
- [x] Fork can rebase on upstream Plannotator without breaking GitHub features — Validated in Phase 1: Plugin Architecture
- [x] Existing OAuth/PR/ACL code refactored into plugin structure — Validated in Phase 1: Plugin Architecture
- [x] Private shares require GitHub authentication to access — Validated in Phase 2: Authentication & Access Control
- [x] Stable annotation IDs that persist across syncs — Validated in Phase 3: Data Model & Sync Infrastructure
- [x] Bidirectional ID mapping between Plannotator and GitHub — Validated in Phase 3: Data Model & Sync Infrastructure
- [x] Line mapping converts between markdown lines and annotation positions — Validated in Phase 3: Data Model & Sync Infrastructure
- [x] Sync state tracking with timestamps and direction — Validated in Phase 3: Data Model & Sync Infrastructure
- [x] Conflict detection when both sides modified annotations — Validated in Phase 3: Data Model & Sync Infrastructure
- [x] Users can create GitHub PR from a plan with annotations as initial review comments — Validated in Phase 4: PR Creation & Export
- [x] GitHub PR comments (including replies) sync into Plannotator as annotations — Validated in Phase 5: Inbound Sync
- [x] Plannotator annotations sync to GitHub as PR review comments (line-level) — Validated in Phase 6: Outbound Sync
- [x] Discussion threads in GitHub display with all replies in Plannotator — Validated in Phase 5: Inbound Sync
- [x] Plan author can create summary annotations in Plannotator — Validated in Phase 7: Thread Management & Resolution
- [x] Summary annotations resolve the associated GitHub thread when synced — Validated in Phase 7: Thread Management & Resolution

### Active

(None — all requirements validated)

### Out of Scope

- Real-time sync via webhooks — sync is user-triggered (explicit button clicks)
- Automatic AI-generated thread summaries — author writes summaries manually
- GitLab/Bitbucket support — GitHub only for v1
- Modifying core Plannotator files — must be plugin-based
- Multi-repo support — single default repo for now

## Context

This is a fork of upstream Plannotator (https://github.com/backnotprop/plannotator). The fork needs to stay synchronized with upstream via regular rebasing.

**Phase 1 complete:** Plugin architecture established. All GitHub code now lives in isolated `packages/github/` workspace package with server (handler, OAuth, middleware, PR logic), client (GitHubProvider, hooks), and shared (types) modules. Paste-service refactored to use middleware composition. Single upstream modification: App.tsx wrapper. Build configuration fixed for hook distribution.

**Phase 2 complete:** Authentication & access control system fully operational. Server-side auth gates return HTML error pages to browsers and JSON to API clients. OAuth flow carries return-to URL for post-auth redirect. Session-only token cookies. All PR routes validate tokens via GitHub API with KV caching. GitHubProvider hydrates from correct localStorage key and validates on mount.

**Phase 3 complete:** Data model and sync infrastructure established. SHA-256 stable ID generation (12-char hex) with collision resolution. Bidirectional KV mapping with O(1) lookups (annotation ID ↔ comment ID). Sync state tracking persists timestamps and direction. Conflict detection identifies when both sides modified annotations. Existing line mapper validated for bidirectional conversion. All foundation modules ready for PR creation and bidirectional sync.

**Phase 4 complete:** PR creation and export functionality operational. Users can create GitHub PRs from plans via "Export to GitHub PR" button in ExportModal. Annotations are posted as initial batch review comments (single GitHub notification). DELETION annotations export as GitHub suggestion blocks. PR metadata (repo, number, URL, plan hash) is stored and linked to paste ID. Drift detection warns when plan hash differs from stored PR. Backward compatibility maintained — legacy exportToPR path preserved when annotations are absent.

**Phase 5 complete:** Inbound sync from GitHub to Plannotator fully operational. All PR comments (including nested replies) import as annotations via "Sync from GitHub" button. Threaded discussion structure preserved with depth-based indentation (max 3 levels). Pagination handles large PR comment threads. Per-comment timestamps enable edit/delete detection. Author avatars stored as first image in annotation metadata. Client-side deduplication prevents duplicate annotations on repeated syncs.

**Phase 6 complete:** Outbound sync from Plannotator to GitHub fully operational. New annotations sync to GitHub as PR review comments via "Sync to GitHub" button. DELETION annotations export as suggestion blocks, COMMENT annotations as plain text. Positional matching recovers GitHub comment IDs from batch review response. Edit detection compares expected body format. 401 errors clear invalid tokens; 429 rate limits show retry guidance. GitHub-sourced annotations are filtered to prevent circular syncing.

**Phase 7 complete:** Thread management and resolution features operational. Users can create summary annotations in Plannotator that post as thread replies on GitHub and resolve the associated thread via GraphQL. Thread picker modal and Previous/Next navigation buttons enable jumping between discussions. Resolved threads display with "Resolved" badge and 70% opacity; users can toggle "Show resolved" filter. Inbound sync fetches thread resolution status. Review tab in ExportModal allows submitting PR reviews (Approve/Request Changes/Comment) from Plannotator with auto-sync before submission.

**Workflow:**
1. User reviews plan in Plannotator, adds annotations
2. User clicks "Create PR" → plan markdown pushed to GitHub, annotations posted as initial review comments
3. Others review on GitHub, add line comments and replies
4. User clicks "Sync from GitHub" → PR comments imported as annotations in Plannotator
5. User sees full discussion threads, writes summary annotations to capture decisions
6. User clicks "Sync to GitHub" → new annotations posted as review comments, summaries resolve threads
7. User approves/requests changes in Plannotator → submits PR review on GitHub

**Technical approach:**
- Use GitHub API (not CLI) for comment sync (line numbers, threads, resolution status)
- Line comments map to plan markdown line numbers
- Each annotation tracks its GitHub comment ID for updates
- Thread replies stored as nested annotations or metadata
- Summary annotations have special flag that triggers thread resolution

## Constraints

- **Architecture**: Plugin/extension only — no modifications to core Plannotator files
- **Upstream sync**: Must support clean rebase on upstream main branch
- **Existing code**: Current OAuth/PR/ACL code in paste service needs refactoring
- **Manual sync**: No webhooks or real-time sync (user-triggered only)
- **Single repo**: PRs go to one configured GitHub repository
- **Line mapping**: Review comments must map accurately to plan markdown line numbers

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Manual sync (user clicks button) vs webhooks | Simpler implementation, no server-side webhook handling, user controls timing | — Pending |
| Line-level review comments vs general comments | Better context, standard GitHub PR review pattern, users expect line-specific feedback | — Pending |
| Author-written summaries vs AI summaries | Author knows the decision, AI might miss nuance, explicit is better than guessed | — Pending |
| Plugin architecture for all GitHub code | Minimal fork diff, easy upstream rebases, clean separation of concerns | — Pending |
| GitHub API for sync, `gh` CLI for PR operations | API has richer comment/thread data, CLI for existing PR creation pattern | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-09 after Phase 7 completion*
