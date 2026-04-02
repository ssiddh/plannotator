# Roadmap: Plannotator GitHub Integration Plugin

## Overview

This roadmap transforms Plannotator into a bidirectional GitHub PR review tool. It starts by extracting existing scattered GitHub code into an isolated plugin package, then layers authentication, data infrastructure, PR creation, bidirectional sync, and thread management in a dependency-driven sequence. Each phase delivers a verifiable capability, progressing from "code lives in the right place" through "comments flow both directions" to "discussions resolve with documented decisions."

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Plugin Architecture** - Extract GitHub code into isolated `packages/github/` with handler composition pattern (completed 2026-04-02)
- [ ] **Phase 2: Authentication & Access Control** - GitHub auth gates private shares and PR operations through the plugin
- [ ] **Phase 3: Data Model & Sync Infrastructure** - Stable IDs, bidirectional mapping, and sync state tracking
- [ ] **Phase 4: PR Creation & Export** - Create GitHub PRs from plans with annotations as initial review comments
- [ ] **Phase 5: Inbound Sync** - Import GitHub PR comments into Plannotator as positioned annotations
- [ ] **Phase 6: Outbound Sync** - Export Plannotator annotations to GitHub as PR review comments
- [ ] **Phase 7: Thread Management & Resolution** - Display threads, create summaries, resolve discussions, submit PR reviews

## Phase Details

### Phase 1: Plugin Architecture
**Goal**: All GitHub integration code lives in a single isolated package that composes with core Plannotator without modifying upstream files
**Depends on**: Nothing (first phase)
**Requirements**: ARCH-01, ARCH-02, ARCH-03, ARCH-04, ARCH-05
**Success Criteria** (what must be TRUE):
  1. A `packages/github/` workspace package exists with server, client, and shared directories
  2. Existing GitHub code (OAuth helpers, PR creation, ACL logic) has been extracted from paste-service and UI into the plugin package
  3. The only upstream file modification is a single React context wrapper in App.tsx
  4. The handler follows the ExternalAnnotationHandler composition pattern (returns Response | null)
  5. Running `git diff upstream/main --name-only` shows no modified upstream files except App.tsx
**Plans:** 4/4 plans complete
Plans:
- [x] 01-01-PLAN.md — Create packages/github/ workspace package, extract server modules (handler, oauth, middleware, pr), consolidated types, tests
- [x] 01-02-PLAN.md — Refactor paste-service handler to use middleware composition, update Bun/Cloudflare targets
- [x] 01-03-PLAN.md — Create GitHubProvider + useGitHub hook, move client utilities, wire App.tsx
- [x] 01-04-PLAN.md — Fix hook build React resolution, verify upstream modification surface (gap closure)

### Phase 2: Authentication & Access Control
**Goal**: Users are securely authenticated via GitHub before accessing private shares or performing PR operations
**Depends on**: Phase 1
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05
**Success Criteria** (what must be TRUE):
  1. Private shares with ACL type "whitelist" redirect unauthenticated users to GitHub login
  2. Unauthenticated users see an auth-required error with a working "Sign in with GitHub" link
  3. GitHub tokens are validated before any PR API call proceeds
  4. ACL checks verify users and teams against the GitHub API before granting share access
  5. The existing OAuth flow continues to work without regressions
**Plans:** 3 plans
Plans:
- [ ] 02-01-PLAN.md — Server-side auth gate: HTML error pages for browser auth failures, content negotiation in paste GET handler
- [ ] 02-02-PLAN.md — OAuth return-to-URL: carry original share URL through login/callback, session-only cookies
- [ ] 02-03-PLAN.md — GitHubProvider hydration: correct localStorage key, token validation on mount, end-to-end verification
**UI hint**: yes

### Phase 3: Data Model & Sync Infrastructure
**Goal**: The foundational data layer for bidirectional sync exists -- stable IDs, line mapping, and sync state tracking
**Depends on**: Phase 1
**Requirements**: DATA-01, DATA-02, DATA-03, DATA-04, DATA-05
**Success Criteria** (what must be TRUE):
  1. Annotation IDs use stable deterministic generation (not ephemeral timestamps)
  2. A bidirectional ID map persists the relationship between Plannotator annotation IDs and GitHub comment IDs
  3. The line mapper converts markdown line numbers to block ID + offset and back
  4. Sync metadata records the last sync timestamp and direction for a given paste/PR pair
  5. Conflict detection identifies when both Plannotator and GitHub modified the same annotation since last sync
**Plans**: TBD

### Phase 4: PR Creation & Export
**Goal**: Users can create a GitHub PR from a plan, with annotations posted as the initial batch of review comments
**Depends on**: Phase 1, Phase 3
**Requirements**: PR-01, PR-02, PR-03, PR-04, PR-05, PR-06
**Success Criteria** (what must be TRUE):
  1. User can click "Create PR" and a GitHub PR is created with the plan markdown as content
  2. Existing annotations are posted as line-level review comments on the PR in a single batch (one GitHub notification)
  3. DELETION annotations are exported as GitHub suggestion blocks (```suggestion format)
  4. PR metadata (repo, PR number, URL) is stored and linked to the paste ID
  5. The existing PR creation functionality works without regressions
**Plans**: TBD
**UI hint**: yes

### Phase 5: Inbound Sync
**Goal**: Users can pull GitHub PR comments into Plannotator, seeing them as positioned annotations with author attribution
**Depends on**: Phase 3, Phase 4
**Requirements**: SYNC-IN-01, SYNC-IN-02, SYNC-IN-03, SYNC-IN-04, SYNC-IN-05, SYNC-IN-06, SYNC-IN-07, SYNC-IN-08, SYNC-IN-09
**Success Criteria** (what must be TRUE):
  1. User can click "Sync from GitHub" and PR comments appear as annotations in the correct positions
  2. Line-level review comments map to the correct plan blocks; general issue comments appear as global annotations
  3. Comment replies are grouped by thread and displayed in chronological order
  4. GitHub user avatars and usernames are visible on imported annotations
  5. Repeated sync does not create duplicate annotations (already-imported comment IDs are skipped)
**Plans**: TBD
**UI hint**: yes

### Phase 6: Outbound Sync
**Goal**: Users can push Plannotator annotations to GitHub as PR review comments with correct line positioning
**Depends on**: Phase 3, Phase 4
**Requirements**: SYNC-OUT-01, SYNC-OUT-02, SYNC-OUT-03, SYNC-OUT-04, SYNC-OUT-05, SYNC-OUT-06, SYNC-OUT-07, SYNC-OUT-08
**Success Criteria** (what must be TRUE):
  1. User can click "Sync to GitHub" and new annotations appear as review comments on the PR
  2. Comments land on the correct lines in the PR diff
  3. Repeated sync does not create duplicate comments (stable annotation IDs prevent re-posting)
  4. When the plan markdown has changed since PR creation, user sees a drift warning before sync proceeds
  5. DELETION annotations are posted as GitHub suggestion blocks; annotations with images include image references
**Plans**: TBD
**UI hint**: yes

### Phase 7: Thread Management & Resolution
**Goal**: Users can view full discussion threads, write summary annotations that capture decisions, and submit PR reviews from Plannotator
**Depends on**: Phase 5, Phase 6
**Requirements**: THREAD-01, THREAD-02, THREAD-03, THREAD-04, THREAD-05, THREAD-06, THREAD-07
**Success Criteria** (what must be TRUE):
  1. User can create a summary annotation for a specific discussion thread via a thread picker UI
  2. Syncing a summary annotation to GitHub posts it as the final reply in the thread and resolves the thread
  3. Resolved thread status is displayed in the Plannotator annotation panel
  4. User can submit a PR review (approve / request changes / comment) from Plannotator, with all pending outbound annotations included as review comments
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Plugin Architecture | 3/4 | Complete    | 2026-04-02 |
| 2. Authentication & Access Control | 0/3 | Planning complete | - |
| 3. Data Model & Sync Infrastructure | 0/0 | Not started | - |
| 4. PR Creation & Export | 0/0 | Not started | - |
| 5. Inbound Sync | 0/0 | Not started | - |
| 6. Outbound Sync | 0/0 | Not started | - |
| 7. Thread Management & Resolution | 0/0 | Not started | - |
