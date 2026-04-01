# Phase 1: Plugin Architecture - Context

**Gathered:** 2026-04-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Extract all GitHub integration code from scattered locations (paste-service auth/, github/) into a single isolated `packages/github/` workspace package that composes with core Plannotator through middleware and React context, without modifying upstream files except a single wrapper in App.tsx.

</domain>

<decisions>
## Implementation Decisions

### Integration Mechanism - Server

- **D-01:** Plugin uses middleware chain composition pattern (returns `Response | null`)
  - Follows existing ExternalAnnotationHandler pattern
  - Plugin exports middleware, paste-service server composes it
  - Clean composition without modifying core routing logic

- **D-02:** GitHub plugin middleware runs in paste-service server (same process, shared port)
  - Not a separate server on different port
  - Simplifies deployment, avoids CORS complexity
  - Paste-service imports and chains plugin middleware

### Integration Mechanism - Client

- **D-03:** React Context Provider pattern for UI integration
  - Single upstream change: wrap App.tsx in `<GitHubProvider>`
  - Components access GitHub state/actions via `useGitHub()` hook
  - Preserves React component tree and state management

- **D-04:** Context exposes state + actions (not actions-only or event bus)
  - State: `{isAuthenticated, user, prMetadata, ...}`
  - Actions: `{syncFromGitHub(), syncToGitHub(), createPR()}`
  - Components get both state and operations in one context

- **D-05:** GitHub UI appears as toolbar buttons + settings tab
  - "Create PR" / "Sync" buttons in existing toolbar
  - GitHub configuration in Settings component (new tab)
  - Natural fit with current UI patterns, minimal disruption

### Token Flow Architecture

- **D-06:** Tokens stored in both localStorage and httpOnly cookie
  - localStorage for client-side access (read by GitHubProvider)
  - httpOnly cookie for server-side operations (read by middleware)
  - Balances security (httpOnly for server) and UX (localStorage for client state)

- **D-07:** GitHubProvider injects token via React context
  - Provider reads localStorage on mount
  - Client components get token from context
  - Server reads token from cookie header
  - Triggers re-renders on auth state changes

- **D-08:** Server-side proxy for all GitHub API calls
  - Client calls `/api/github/pr/create`, server forwards to GitHub API
  - Token stays in httpOnly cookie, not exposed to client HTTP calls
  - More secure than client-direct calls with token in headers

- **D-09:** OAuth implementation extracted from paste-service into plugin package
  - Minimizes rebase conflicts with upstream (paste-service exists in upstream)
  - All GitHub code lives in `packages/github/` (fork-only directory)
  - Paste-service becomes paste storage only (closer to upstream)

- **D-10:** Plugin OAuth routes run as middleware in paste-service server
  - Plugin exports OAuth middleware (login, callback, validate endpoints)
  - Paste-service composes it with paste storage routes
  - Single server process, no separate service or Cloudflare-only approach

### Claude's Discretion

- Package internal structure (flat vs server/client/shared subdirectories)
- Specific middleware composition order
- Error handling patterns for token expiry/refresh
- TypeScript type organization for GitHub entities

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §Plugin Architecture — ARCH-01 through ARCH-05 define the architectural constraints

### Existing Patterns
- `packages/server/external-annotations.ts` — ExternalAnnotationHandler pattern (Response | null composition)
- `packages/ai/providers/` — ProviderRegistry pattern for optional dependency loading with graceful degradation
- `packages/ui/hooks/` — Custom hook patterns for context consumption
- `packages/ui/components/Settings.tsx` — Existing settings tabs pattern

### Codebase Structure
- `.planning/codebase/STRUCTURE.md` — Workspace package organization conventions
- `.planning/codebase/CONVENTIONS.md` — Naming patterns, TypeScript config, React patterns
- `.planning/codebase/ARCHITECTURE.md` — Server-client separation, data flow patterns

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **ExternalAnnotationHandler pattern**: Server handlers return `Response | null`, allowing clean composition without modifying core routing
  - Used in `packages/server/external-annotations.ts`
  - Plugin middleware should follow this pattern

- **ProviderRegistry pattern**: Optional dependencies loaded with feature detection
  - Used in `packages/ai/` for Claude Agent SDK, Codex SDK, etc.
  - Provides graceful degradation when SDK unavailable
  - Not directly applicable (GitHub is required, not optional), but shows dependency loading patterns

- **React Context patterns**: Existing contexts in `packages/ui/config/configStore.ts`
  - Cookie-based persistence for cross-port settings
  - Reactive updates via context API
  - GitHubProvider should follow similar patterns

- **Settings component**: `packages/ui/components/Settings.tsx` (1815 lines)
  - Tab-based settings UI (Identity, Plan Saving, Agent, Obsidian, etc.)
  - GitHub settings should add a new tab following existing pattern

### Established Patterns

- **Workspace packages**: `@plannotator/server`, `@plannotator/ui`, `@plannotator/shared`
  - Monorepo with Bun workspaces
  - Plugin should be `@plannotator/github` for consistency

- **Runtime polymorphism**: Same API surface across Bun and Node.js
  - `packages/server/` (Bun) vs `apps/pi-extension/server/` (Node.js)
  - GitHub plugin may need similar dual implementation

- **Server composition**: Apps import server functions from packages
  - `apps/hook/server/index.ts` imports from `@plannotator/server`
  - Paste service should import GitHub middleware from `@plannotator/github/server`

### Integration Points

- **Paste service handler**: `apps/paste-service/core/handler.ts`
  - Main request router for paste operations
  - GitHub middleware composes here before paste routes

- **App.tsx wrappers**: `packages/editor/App.tsx` (plan review), `packages/review-editor/App.tsx` (code review)
  - Single upstream modification point
  - Wrap with `<GitHubProvider>` at top level

- **Toolbar**: `packages/ui/components/Toolbar.tsx`
  - Existing buttons for Approve, Deny, Settings
  - GitHub sync buttons integrate here

### Code to Extract

- `apps/paste-service/auth/github.ts` (331 lines) — OAuth flow (login, callback, token validation, refresh)
- `apps/paste-service/auth/middleware.ts` — Auth middleware for ACL enforcement
- `apps/paste-service/auth/types.ts` — GitHub user and auth types
- `apps/paste-service/github/pr.ts` (269 lines) — PR creation, comment fetching, GitHub API helpers
- ACL logic in `apps/paste-service/stores/` and `apps/paste-service/core/handler.ts` — Scattered ACL checks referencing GitHub auth

</code_context>

<specifics>
## Specific Ideas

- Middleware composition should match ExternalAnnotationHandler pattern: plugin returns `Response | null`, paste-service checks return value before continuing to next handler
- GitHubProvider context should expose both state and actions (not split into separate contexts)
- OAuth routes in plugin middleware: `/api/auth/github/login`, `/api/auth/github/callback`, `/api/auth/github/validate`
- Server proxy routes for GitHub API: `/api/github/pr/create`, `/api/github/pr/comments`, `/api/github/pr/sync`
- Single upstream file modification: `packages/editor/App.tsx` wrapped in `<GitHubProvider>` (and same for `packages/review-editor/App.tsx` if GitHub features needed in code review mode)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-plugin-architecture*
*Context gathered: 2026-04-01*
