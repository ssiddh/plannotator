# Requirements: Plannotator GitHub Integration Plugin

**Defined:** 2026-04-01
**Core Value:** Plan reviews happen seamlessly in both Plannotator and GitHub, with discussions staying synchronized and decisions properly documented.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Plugin Architecture

- [x] **ARCH-01**: All GitHub integration code lives in isolated `packages/github/` package
- [ ] **ARCH-02**: Upstream file changes limited to single context wrapper in App.tsx
- [x] **ARCH-03**: Handler follows ExternalAnnotationHandler composition pattern
- [ ] **ARCH-04**: Fork can rebase on upstream main without merge conflicts in GitHub code
- [x] **ARCH-05**: Existing scattered GitHub code (OAuth, PR creation, ACL) extracted into plugin package

### Authentication & Access Control

- [ ] **AUTH-01**: Private shares (ACL type "whitelist") enforce GitHub authentication before access
- [ ] **AUTH-02**: GitHub tokens validated before any PR operations
- [ ] **AUTH-03**: ACL users and teams checked against GitHub API before granting access
- [ ] **AUTH-04**: Existing OAuth flow preserved (no breaking changes)
- [ ] **AUTH-05**: Unauthenticated users see auth-required error with login link

### PR Creation & Export

- [ ] **PR-01**: Existing PR creation functionality preserved (plan markdown → GitHub PR)
- [ ] **PR-02**: Annotations exported as initial PR review comments when creating PR
- [ ] **PR-03**: Annotations mapped to markdown line numbers for line-level comments
- [ ] **PR-04**: Batch review submission (single GitHub notification, not one per comment)
- [ ] **PR-05**: DELETION annotations exported as GitHub code suggestions (```suggestion blocks)
- [ ] **PR-06**: PR metadata (repo, number, URL) stored and linked to paste ID

### Inbound Sync (GitHub → Plannotator)

- [ ] **SYNC-IN-01**: User can trigger "Sync from GitHub" to import PR comments
- [ ] **SYNC-IN-02**: Review comments (line-level) imported as annotations with correct block mapping
- [ ] **SYNC-IN-03**: Issue comments (general) imported as global annotations
- [ ] **SYNC-IN-04**: Comments from all pages fetched (handle 30+ comments via pagination)
- [ ] **SYNC-IN-05**: Comment replies grouped by thread in Plannotator UI
- [ ] **SYNC-IN-06**: Thread display shows all replies in chronological order
- [ ] **SYNC-IN-07**: GitHub user avatars displayed in annotation panel for imported comments
- [ ] **SYNC-IN-08**: Annotation source field tracks GitHub origin (`source: "github-pr"`)
- [ ] **SYNC-IN-09**: Duplicate comments prevented (skip already-imported comment IDs)

### Outbound Sync (Plannotator → GitHub)

- [ ] **SYNC-OUT-01**: User can trigger "Sync to GitHub" to export annotations as PR comments
- [ ] **SYNC-OUT-02**: New annotations posted as PR review comments on correct lines
- [ ] **SYNC-OUT-03**: Stable annotation IDs prevent duplicate comments on repeated sync
- [ ] **SYNC-OUT-04**: Line mapping detects when plan changed since PR creation
- [ ] **SYNC-OUT-05**: Drift warning shown when markdown structure changed (unmappable annotations)
- [ ] **SYNC-OUT-06**: DELETION annotations converted to GitHub suggestion code blocks
- [ ] **SYNC-OUT-07**: Batch review submission for outbound annotations (single notification)
- [ ] **SYNC-OUT-08**: Annotations with images include image references in GitHub comment body

### Thread Management & Resolution

- [ ] **THREAD-01**: Author can create summary annotation for a discussion thread
- [ ] **THREAD-02**: Summary annotation UI allows selecting which thread to summarize
- [ ] **THREAD-03**: Summary annotations synced to GitHub as final reply in thread
- [ ] **THREAD-04**: Thread resolved on GitHub when summary annotation synced (GraphQL mutation)
- [ ] **THREAD-05**: User can submit PR review (approve/request changes) from Plannotator
- [ ] **THREAD-06**: Review submission includes all outbound annotations as review comments
- [ ] **THREAD-07**: Resolved thread status displayed in Plannotator UI

### Data Model & Sync State

- [ ] **DATA-01**: Annotation IDs use stable generation (not ephemeral timestamps)
- [ ] **DATA-02**: Bidirectional ID mapping stored (Plannotator annotation ID ↔ GitHub comment ID)
- [ ] **DATA-03**: Line mapping reversible (markdown line → block ID + offset)
- [ ] **DATA-04**: Sync metadata tracks last sync timestamp and direction
- [ ] **DATA-05**: Conflict detection when both sides modified same annotation

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Advanced Sync

- **SYNC-V2-01**: Real-time sync via GitHub webhooks
- **SYNC-V2-02**: Automatic conflict resolution for simple cases
- **SYNC-V2-03**: Sync history log (audit trail of all sync operations)
- **SYNC-V2-04**: Partial sync (sync only selected annotations)

### Transport Abstraction

- **TRANS-V2-01**: Abstract over fetch() (paste-service) and gh CLI (local server)
- **TRANS-V2-02**: Support both REST and GraphQL for all operations
- **TRANS-V2-03**: Offline queue for sync operations

### Enhanced Features

- **FEAT-V2-01**: AI-generated thread summaries
- **FEAT-V2-02**: Multi-repo support (PRs to different repositories)
- **FEAT-V2-03**: GitLab and Bitbucket integration
- **FEAT-V2-04**: Annotation reactions synced from GitHub emoji reactions

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Automatic real-time sync | User-triggered sync is simpler, no webhook infrastructure needed |
| Inline PR diff editing | Plannotator is for plan review, not code editing |
| Multi-platform support (GitLab, Bitbucket) | GitHub-only focus for v1, validate pattern first |
| Nested thread replies beyond 1 level | GitHub API returns flat threading (`in_reply_to_id` but no nested replies) |
| Modification of core Plannotator files | Plugin architecture must minimize fork diff |
| Automatic annotation ID migration | Stable IDs from start, no migration path needed |
| PR merge/close from Plannotator | Keep scope to review workflow only |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| ARCH-01 | Phase 1 | Complete |
| ARCH-02 | Phase 1 | Pending |
| ARCH-03 | Phase 1 | Complete |
| ARCH-04 | Phase 1 | Pending |
| ARCH-05 | Phase 1 | Complete |
| AUTH-01 | Phase 2 | Pending |
| AUTH-02 | Phase 2 | Pending |
| AUTH-03 | Phase 2 | Pending |
| AUTH-04 | Phase 2 | Pending |
| AUTH-05 | Phase 2 | Pending |
| DATA-01 | Phase 3 | Pending |
| DATA-02 | Phase 3 | Pending |
| DATA-03 | Phase 3 | Pending |
| DATA-04 | Phase 3 | Pending |
| DATA-05 | Phase 3 | Pending |
| PR-01 | Phase 4 | Pending |
| PR-02 | Phase 4 | Pending |
| PR-03 | Phase 4 | Pending |
| PR-04 | Phase 4 | Pending |
| PR-05 | Phase 4 | Pending |
| PR-06 | Phase 4 | Pending |
| SYNC-IN-01 | Phase 5 | Pending |
| SYNC-IN-02 | Phase 5 | Pending |
| SYNC-IN-03 | Phase 5 | Pending |
| SYNC-IN-04 | Phase 5 | Pending |
| SYNC-IN-05 | Phase 5 | Pending |
| SYNC-IN-06 | Phase 5 | Pending |
| SYNC-IN-07 | Phase 5 | Pending |
| SYNC-IN-08 | Phase 5 | Pending |
| SYNC-IN-09 | Phase 5 | Pending |
| SYNC-OUT-01 | Phase 6 | Pending |
| SYNC-OUT-02 | Phase 6 | Pending |
| SYNC-OUT-03 | Phase 6 | Pending |
| SYNC-OUT-04 | Phase 6 | Pending |
| SYNC-OUT-05 | Phase 6 | Pending |
| SYNC-OUT-06 | Phase 6 | Pending |
| SYNC-OUT-07 | Phase 6 | Pending |
| SYNC-OUT-08 | Phase 6 | Pending |
| THREAD-01 | Phase 7 | Pending |
| THREAD-02 | Phase 7 | Pending |
| THREAD-03 | Phase 7 | Pending |
| THREAD-04 | Phase 7 | Pending |
| THREAD-05 | Phase 7 | Pending |
| THREAD-06 | Phase 7 | Pending |
| THREAD-07 | Phase 7 | Pending |

**Coverage:**
- v1 requirements: 47 total
- Mapped to phases: 47
- Unmapped: 0

---
*Requirements defined: 2026-04-01*
*Last updated: 2026-04-01 after roadmap creation*
