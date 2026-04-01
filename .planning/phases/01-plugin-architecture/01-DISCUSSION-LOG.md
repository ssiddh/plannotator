# Phase 1: Plugin Architecture - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-01
**Phase:** 1-Plugin Architecture
**Areas discussed:** Integration mechanism, Token flow architecture

---

## Integration Mechanism

### Server Hook

| Option | Description | Selected |
|--------|-------------|----------|
| Middleware chain | Plugin exports middleware that runs before core routes. Returns Response \| null like ExternalAnnotationHandler. Clean composition, follows existing pattern. | ✓ |
| Route registration API | Plugin calls registerRoutes(app) to add endpoints dynamically. More explicit, but requires new infrastructure. | |
| Separate server on different port | GitHub plugin runs its own server alongside paste-service. Maximum isolation, but complicates token sharing and CORS. | |

**User's choice:** Middleware chain (recommended)

---

### Client Hook

| Option | Description | Selected |
|--------|-------------|----------|
| React Context Provider | Wrap App.tsx in <GitHubProvider> that injects UI components and state. Single upstream change, follows React patterns, components can useGitHub(). | ✓ |
| Props drilling from App.tsx | App.tsx imports GitHub components and passes props down. Simple but couples App.tsx to GitHub, harder to maintain fork diff. | |
| Portal injection via DOM | Plugin injects UI into DOM after mount. Maximum decoupling, but breaks React's component tree and state management. | |

**User's choice:** React Context Provider (recommended)

---

### Context API

| Option | Description | Selected |
|--------|-------------|----------|
| State + actions | Expose {isAuthenticated, user, prMetadata, syncFromGitHub(), syncToGitHub(), createPR()}. Components get both state and operations. | ✓ |
| Actions only, read from server | Only expose operations, components fetch state from server APIs. Simpler context, but more network calls. | |
| Event bus pattern | Emit events for GitHub actions, components listen. Decoupled but harder to track data flow. | |

**User's choice:** State + actions (recommended)

---

### UI Placement

| Option | Description | Selected |
|--------|-------------|----------|
| Toolbar buttons + settings tab | Add 'Create PR' / 'Sync' buttons to existing toolbar, GitHub settings in Settings component. Natural fit with existing UI patterns. | ✓ |
| Dedicated sidebar panel | New sidebar tab for GitHub operations and PR metadata. More space but adds UI complexity. | |
| Modal dialogs only | Trigger GitHub actions via modal overlays. Minimal UI footprint but hides functionality. | |

**User's choice:** Toolbar buttons + settings tab

---

## Token Flow Architecture

### Token Store

| Option | Description | Selected |
|--------|-------------|----------|
| Browser localStorage + httpOnly cookie | Store in localStorage for client-side access, httpOnly cookie for server. Current OAuth already uses cookies. Balances security and convenience. | ✓ |
| Cookie only | All token access goes through server. More secure but requires proxy endpoints for every GitHub API call from client. | |
| Memory only (session-scoped) | Tokens don't persist between page refreshes. Simplest but poor UX — user re-authenticates often. | |

**User's choice:** Browser localStorage + httpOnly cookie (recommended)

---

### Plugin Access

| Option | Description | Selected |
|--------|-------------|----------|
| Context provider injection | GitHubProvider reads localStorage on mount, passes token via context. Client components get direct access, server reads from cookie. | ✓ |
| Getter function from shared package | Export getGitHubToken() that reads from storage. Functional but bypasses React state, harder to trigger re-renders on auth changes. | |
| Always fetch from paste-service | Plugin calls /api/auth/token endpoint. Paste service becomes token authority. Extra network overhead but centralized control. | |

**User's choice:** Context provider injection (recommended)

---

### API Caller

| Option | Description | Selected |
|--------|-------------|----------|
| Client-side with token from context | React components call GitHub API directly using token from GitHubProvider. Simpler architecture, fewer server endpoints, but exposes token to browser. | |
| Server-side proxy | Plugin server endpoints proxy GitHub API calls. Token stays in httpOnly cookie, more secure. Client calls /api/github/pr/create, server forwards to GitHub. | ✓ |
| Hybrid: client for reads, server for writes | Client fetches PR comments directly, server handles PR creation/updates. Balances security and performance, but split logic is confusing. | |

**User's choice:** Server-side proxy (recommended)

---

### Paste Service Integration

| Option | Description | Selected |
|--------|-------------|----------|
| Extract OAuth into plugin package | Move auth/github.ts and github/pr.ts into packages/github/. Paste-service stays close to upstream. Plugin package becomes self-contained. Safest for rebasing. | ✓ |
| Keep OAuth in paste-service, isolate carefully | OAuth stays in paste-service but in clearly-marked fork-only directories (auth/, github/). Document these as 'do not merge' zones. Simpler architecture but requires discipline during rebases. | |
| Hybrid: OAuth server in plugin, storage in paste-service | Plugin package runs OAuth endpoints, paste-service only handles paste storage. Clean separation but need CORS setup between services. | |

**User's choice:** Extract OAuth into plugin package (recommended)

**Notes:** User clarified concern about upstream rebase conflicts. Keeping OAuth in paste-service (which exists upstream) risks merge conflicts when upstream modifies paste-service structure. Extracting to packages/github/ (fork-only directory) minimizes conflict risk and aligns with ARCH-04 requirement.

---

### OAuth Server Runtime

| Option | Description | Selected |
|--------|-------------|----------|
| Plugin middleware in paste-service server | Plugin exports OAuth middleware, paste-service server composes it. Single process, shared port. Follows the middleware chain pattern we chose earlier. | ✓ |
| Separate plugin server on different port | Plugin runs its own HTTP server for OAuth callbacks. Maximum isolation but complicates deployment (two services) and CORS. | |
| Serverless functions only (Cloudflare Worker) | OAuth routes deploy as separate Worker endpoints. Works for hosted paste-service but not self-hosted Bun server. | |

**User's choice:** Plugin middleware in paste-service server (recommended)

---

## Claude's Discretion

- Package internal structure (flat vs server/client/shared subdirectories)
- Specific middleware composition order
- Error handling patterns for token expiry/refresh
- TypeScript type organization for GitHub entities

## Deferred Ideas

None — discussion stayed within phase scope
