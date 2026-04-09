# Milestones

## v1.0 MVP (Shipped: 2026-04-09)

**Phases completed:** 7 phases, 25 plans, 56 tasks

**Key accomplishments:**

- Isolated @plannotator/github workspace package with config-injected server modules following the ExternalAnnotationHandler composition pattern
- Refactored paste-service handler to delegate GitHub routes via middleware composition, removing 200+ lines of inlined OAuth/PR code
- GitHubProvider React context wrapping App.tsx with stubbed actions, plus migrated client utilities using consolidated shared types
- Fixed hook build React resolution via Vite dedupe and verified upstream modification surface is minimal and architecturally necessary
- Server-side auth HTML pages with content-negotiated paste GET handler returning styled 401/403 for browsers and JSON for API clients
- OAuth flow carries return_to URL through state cookie for post-auth redirect; all PR routes validate tokens via GitHub API with KV caching
- GitHubProvider reads plannotator_github_token from localStorage, validates on mount via /api/auth/token/validate, and clears state on failure
- SHA-256 content-based stable ID generation with collision resolution, sync infrastructure types, and UI copywriting constants
- Bidirectional KV mapping and timestamp-based conflict detection for annotation-comment sync
- bun:test skeleton files with 14 trivial stubs covering export (mapAnnotationsToComments, submitBatchReview, exportPlanWithAnnotations) and planHash (generatePlanHash) behavior contracts
- Batch review submission with annotation-to-comment mapping, plan hash generation, rollback on failure, and metadata endpoint
- useGitHubExport hook with 429/401/network retry handling, GitHubProvider prMetadata hydration from paste API
- GitHub PR tab in ExportModal with one-click export, auto-paste creation, drift detection, and toast action buttons
- Failing test skeletons for thread tree, annotation panel, and sync smoke -- ensuring TDD compliance for subsequent plans
- Paginated GitHub comment fetching with KV dedup, edit/delete detection, and inbound sync endpoint returning categorized stats
- Thread tree builder with 12 passing tests, sync hook with 5-min Page Visibility polling, exponential backoff retry, and registerSyncAction pattern in GitHubProvider
- SyncButton with disabled/loading/badge states and threaded GitHub annotation rendering with 24px avatars, clickable usernames, absolute timestamps, and recursive indented replies
- Wired useGitHubPRSync hook with SyncButton in toolbar, toast notifications, and Vite alias fix for github/client subpath imports
- TDD-built outbound sync with annotation classification (new/edited/skipped), batch review posting, threaded edit replies with "Updated:" prefix, and comment ID recovery via review API
- POST outbound sync route with auth/metadata/body validation, React hook with 3x retry and exponential backoff, and GitHubProvider registration wiring
- OutboundSyncButton with upload icon and badge wired in App.tsx with full toast notifications, drift warning, and error handling for push-to-GitHub flow
- GraphQL module for thread resolution and status queries with extended Annotation type for summary/resolution tracking
- Summary annotation creation modal, thread navigation, resolved badges, thread filtering, and markdown export integrated into AnnotationPanel
- PR review submission tab in ExportModal with approve/request-changes/comment buttons and auto-sync of unsynced annotations
- Outbound sync routes summary annotations as thread replies with GraphQL resolution; inbound sync returns thread resolution status on comments

---
