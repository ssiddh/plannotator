# Phase 1: Plugin Architecture - Research

**Researched:** 2026-04-01
**Domain:** Monorepo plugin extraction, middleware composition, React context integration
**Confidence:** HIGH

## Summary

Phase 1 extracts scattered GitHub integration code from `apps/paste-service/` into an isolated `packages/github/` workspace package. The codebase already has well-established patterns for every integration mechanism needed: the `ExternalAnnotationHandler` interface for server middleware (returns `Response | null`), React context with cookie-based persistence for client state, and Bun workspace packages with explicit `exports` maps for module resolution.

The existing code to extract is well-contained: ~600 lines of server code across 4 files (`auth/github.ts`, `auth/middleware.ts`, `auth/types.ts`, `github/pr.ts`) plus ~190 lines of client code (`hooks/useGitHubPRSync.ts`, `utils/lineMapper.ts`). The paste-service handler (`core/handler.ts`) currently inlines all GitHub/auth routes directly in a monolithic `handleRequest()` function -- the refactor converts these to a composable middleware that runs before paste routes.

**Primary recommendation:** Follow the ExternalAnnotationHandler pattern exactly -- create a `GitHubHandler` with `handle(req, url) => Promise<Response | null>`, compose it in the paste-service handler before paste routes, and keep all GitHub-specific code in `packages/github/`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Plugin uses middleware chain composition pattern (returns `Response | null`). Follows existing ExternalAnnotationHandler pattern.
- **D-02:** GitHub plugin middleware runs in paste-service server (same process, shared port). Not a separate server.
- **D-03:** React Context Provider pattern for UI integration. Single upstream change: wrap App.tsx in `<GitHubProvider>`.
- **D-04:** Context exposes state + actions (not actions-only or event bus). State: `{isAuthenticated, user, prMetadata, ...}`. Actions: `{syncFromGitHub(), syncToGitHub(), createPR()}`.
- **D-05:** GitHub UI appears as toolbar buttons + settings tab. Natural fit with current UI patterns.
- **D-06:** Tokens stored in both localStorage and httpOnly cookie. localStorage for client-side, httpOnly for server.
- **D-07:** GitHubProvider injects token via React context. Reads localStorage on mount, triggers re-renders on auth changes.
- **D-08:** Server-side proxy for all GitHub API calls. Client calls `/api/github/*`, server forwards to GitHub API.
- **D-09:** OAuth implementation extracted from paste-service into plugin package. Minimizes rebase conflicts.
- **D-10:** Plugin OAuth routes run as middleware in paste-service server. Single server process.

### Claude's Discretion
- Package internal structure (flat vs server/client/shared subdirectories)
- Specific middleware composition order
- Error handling patterns for token expiry/refresh
- TypeScript type organization for GitHub entities

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ARCH-01 | All GitHub integration code lives in isolated `packages/github/` package | Workspace package pattern established by `@plannotator/shared`, `@plannotator/server`, etc. Explicit `exports` map in `package.json`. |
| ARCH-02 | Upstream file changes limited to single context wrapper in App.tsx | `packages/editor/App.tsx` is the plan editor entry. Wrap top-level JSX in `<GitHubProvider>`. ~1 import + 1 JSX wrapper line. |
| ARCH-03 | Handler follows ExternalAnnotationHandler composition pattern | `ExternalAnnotationHandler` interface in `packages/server/external-annotations.ts` returns `Response \| null`. Plugin middleware mirrors this exactly. |
| ARCH-04 | Fork can rebase on upstream main without merge conflicts in GitHub code | All GitHub code in `packages/github/` (fork-only directory). Only upstream touch is App.tsx wrapper. Paste-service handler refactored to accept optional middleware. |
| ARCH-05 | Existing scattered GitHub code extracted into plugin package | 4 server files (auth/github.ts, auth/middleware.ts, auth/types.ts, github/pr.ts) + 2 client files (useGitHubPRSync.ts, lineMapper.ts) move to packages/github/. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Bun | 1.3.11 | Runtime, test runner, workspace manager | Already project runtime |
| TypeScript | ~5.8.2 | Type checking | Already project standard |
| React | 19.2.3 | UI context/hooks | Already project standard |

### Supporting
No new dependencies needed. This phase is purely structural -- moving existing code and creating composition interfaces. All GitHub API calls use native `fetch()` (already in the codebase).

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native fetch for GitHub API | octokit | Adds dependency, existing code already uses raw fetch, extraction phase should minimize changes |
| Custom middleware | Hono/Express | Overkill -- the `Response \| null` pattern is already established and works with Bun.serve |

## Architecture Patterns

### Recommended Package Structure
```
packages/github/
  package.json                    # @plannotator/github with explicit exports
  tsconfig.json                   # Mirrors packages/shared/tsconfig.json
  server/
    handler.ts                    # GitHubHandler interface + createGitHubHandler() factory
    oauth.ts                      # handleLogin, handleCallback, handleTokenValidate, handleTokenRefresh (from auth/github.ts)
    middleware.ts                  # extractToken, validateGitHubToken, checkAccess (from auth/middleware.ts)
    pr.ts                         # exportToPR, fetchPRComments (from github/pr.ts)
  client/
    GitHubProvider.tsx            # React context provider (NEW)
    useGitHub.ts                  # Context consumer hook (NEW)
    useGitHubPRSync.ts            # Extracted from packages/ui/hooks/ (MOVED)
  shared/
    types.ts                      # PasteACL, PasteMetadata, GitHubUser, AuthResult, PRMetadata, PRComment (from auth/types.ts + github/pr.ts)
  index.ts                        # Re-exports for convenience
```

**Rationale for server/client/shared subdirectories:** The codebase has clear runtime boundaries -- server code uses `node:fs`, `crypto.subtle`, and Bun APIs; client code uses React hooks and DOM APIs. Subdirectories match this split and prevent accidental cross-imports. This mirrors how `packages/shared/` uses explicit `exports` to control what each consumer can import.

### Pattern 1: GitHubHandler (Server Middleware)
**What:** Factory function creating a handler with the `Response | null` composition pattern
**When to use:** All GitHub-related server routes (OAuth, PR, sync)
**Example:**
```typescript
// Source: packages/server/external-annotations.ts (existing pattern)
export interface GitHubHandler {
  handle: (req: Request, url: URL) => Promise<Response | null>;
}

export function createGitHubHandler(config: GitHubConfig): GitHubHandler {
  return {
    async handle(req: Request, url: URL): Promise<Response | null> {
      // OAuth routes
      if (url.pathname === "/api/auth/github/login" && req.method === "GET") {
        return handleLogin(req, config.clientId, config.redirectUri);
      }
      // ... more routes ...

      // Not a GitHub route -- pass through
      return null;
    },
  };
}
```

### Pattern 2: Paste-Service Handler Composition
**What:** Paste-service handler accepts optional middleware array, tries each before paste routes
**When to use:** In paste-service targets (bun.ts, cloudflare.ts)
**Example:**
```typescript
// Source: Derived from current handleRequest() signature
export async function handleRequest(
  request: Request,
  store: PasteStore,
  cors: Record<string, string>,
  options?: Partial<PasteOptions>,
  kv?: KVNamespace,
  middleware?: Array<{ handle: (req: Request, url: URL) => Promise<Response | null> }>
): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  // Try middleware first
  if (middleware) {
    for (const mw of middleware) {
      const response = await mw.handle(request, url);
      if (response) return response;
    }
  }

  // Paste routes (existing code, now without GitHub/auth inlined)
  // ...
}
```

### Pattern 3: GitHubProvider (React Context)
**What:** Context provider wrapping App.tsx, exposing auth state and actions
**When to use:** Plan editor and potentially review editor
**Example:**
```typescript
// Source: Derived from packages/ui/config/configStore.ts pattern
interface GitHubContextValue {
  isAuthenticated: boolean;
  user: GitHubUser | null;
  token: string | null;
  prMetadata: PRMetadata | null;
  // Actions (stubs in Phase 1, implemented in later phases)
  syncFromGitHub: () => Promise<void>;
  syncToGitHub: () => Promise<void>;
  createPR: () => Promise<void>;
}

const GitHubContext = React.createContext<GitHubContextValue | null>(null);

export function GitHubProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() =>
    typeof localStorage !== 'undefined' ? localStorage.getItem('github_token') : null
  );
  // ... state management ...
  return <GitHubContext.Provider value={value}>{children}</GitHubContext.Provider>;
}

export function useGitHub(): GitHubContextValue {
  const ctx = React.useContext(GitHubContext);
  if (!ctx) throw new Error("useGitHub must be used within GitHubProvider");
  return ctx;
}
```

### Pattern 4: Package Exports Map
**What:** Explicit exports in package.json for controlled API surface
**When to use:** `packages/github/package.json`
**Example:**
```json
{
  "name": "@plannotator/github",
  "version": "0.0.1",
  "private": true,
  "exports": {
    "./server": "./server/handler.ts",
    "./client": "./client/GitHubProvider.tsx",
    "./types": "./shared/types.ts"
  }
}
```

### Anti-Patterns to Avoid
- **Inlining routes in handler:** The current paste-service handler has all routes inline. The refactored version must delegate to middleware, not just move the `if` blocks around.
- **Importing server code from client:** The `server/` and `client/` directories must have zero cross-imports. Shared types go in `shared/types.ts`.
- **Modifying upstream files beyond App.tsx:** No changes to `packages/ui/components/Toolbar.tsx`, `packages/ui/components/Settings.tsx`, etc. in Phase 1. The provider and hook are the only integration points.
- **Removing GitHub code from paste-service without replacing it:** The handler refactor must maintain all existing functionality -- no regressions on OAuth, PR creation, or ACL checks.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cookie parsing | Custom parser | Existing `parseCookies()` in auth/github.ts | Already handles edge cases, extract it to shared/ |
| Token validation caching | In-memory cache | Existing KV-based caching pattern in auth/middleware.ts | Production uses Cloudflare KV, local uses no cache -- existing pattern handles both |
| GitHub API requests | New HTTP client | Existing `githubRequest()` helper in github/pr.ts | Already handles auth headers, User-Agent, error parsing |
| CSRF state generation | Custom crypto | Existing `generateState()` in auth/github.ts | Uses Web Crypto correctly |

**Key insight:** This phase is an extraction, not a rewrite. Every server-side function already exists and works. The task is moving code, creating composition interfaces, and adding the React context wrapper.

## Common Pitfalls

### Pitfall 1: Breaking the Cloudflare Worker Target
**What goes wrong:** The Cloudflare Worker target (`targets/cloudflare.ts`) uses `KVNamespace` for token caching. Refactoring the handler signature could break the Worker build.
**Why it happens:** `KVNamespace` is a Cloudflare Workers type, not available in Bun. The middleware must accept `kv?: KVNamespace` as an optional parameter.
**How to avoid:** Test both targets after refactoring. Keep `KVNamespace` as optional parameter in the middleware config.
**Warning signs:** TypeScript errors in `targets/cloudflare.ts`, `wrangler dev` failing.

### Pitfall 2: Circular Dependencies Between Plugin and Paste-Service
**What goes wrong:** `packages/github/` imports from `apps/paste-service/` or vice versa in unexpected ways.
**Why it happens:** The existing code has `PasteStore` type references mixed into GitHub code (e.g., `putPRMetadata` calls).
**How to avoid:** Define a storage interface in `packages/github/shared/types.ts` that the paste-service implements. The plugin should never import from `apps/paste-service/`.
**Warning signs:** Import cycles detected by TypeScript, or runtime errors from bundler.

### Pitfall 3: Duplicate Type Definitions
**What goes wrong:** `PRMetadata` is defined in both `apps/paste-service/auth/types.ts` AND `apps/paste-service/github/pr.ts` (the codebase already has this duplication). Also duplicated in `packages/ui/hooks/useGitHubPRSync.ts`.
**Why it happens:** GitHub code was added incrementally without a shared types package.
**How to avoid:** Consolidate ALL GitHub types into `packages/github/shared/types.ts`. Update all imports to use `@plannotator/github/types`.
**Warning signs:** Multiple `PRMetadata` interfaces in the codebase.

### Pitfall 4: Presence Routes Are NOT GitHub Code
**What goes wrong:** The `presence/handler.ts` module in paste-service also uses auth middleware, tempting extraction into the GitHub plugin.
**Why it happens:** Presence (collaborative editing indicators) uses GitHub tokens for auth but is not GitHub-specific functionality.
**How to avoid:** Leave presence routes in paste-service. Only extract code that is specifically about GitHub OAuth, GitHub PR, or GitHub ACL.
**Warning signs:** Presence features breaking after extraction.

### Pitfall 5: The `process.env` References in Extracted Code
**What goes wrong:** Both `auth/github.ts` and `github/pr.ts` reference `process.env.GITHUB_DEFAULT_REPO`, `process.env.GITHUB_PR_BASE_BRANCH` directly. After extraction, these environment dependencies are hidden inside the plugin.
**Why it happens:** Direct env access is an implicit dependency.
**How to avoid:** The `GitHubConfig` object passed to `createGitHubHandler()` should explicitly accept these values. The paste-service targets read env vars and pass them as config.
**Warning signs:** Runtime errors about missing env vars after extraction.

### Pitfall 6: Note Two DIFFERENT PR Systems in the Codebase
**What goes wrong:** Confusion between the paste-service PR system (HTTP API, token-based, `github/pr.ts`) and the shared PR provider system (CLI-based, `packages/shared/pr-github.ts`).
**Why it happens:** The codebase has TWO independent GitHub PR integrations for different purposes:
  - `apps/paste-service/github/pr.ts` -- HTTP API calls for plan-to-PR export via paste service (token auth, used by portal/sharing)
  - `packages/shared/pr-github.ts` + `pr-provider.ts` -- CLI-based (`gh` command) for code review PR fetching (used by review-editor)
**How to avoid:** Phase 1 extracts ONLY the paste-service PR code. The shared pr-provider system is unrelated and must not be touched or confused with the plugin.
**Warning signs:** Accidentally importing from `@plannotator/shared/pr-provider` in the GitHub plugin.

## Code Examples

### Existing ExternalAnnotationHandler (Reference Pattern)
```typescript
// Source: packages/server/external-annotations.ts lines 30-36
export interface ExternalAnnotationHandler {
  handle: (
    req: Request,
    url: URL,
    options?: { disableIdleTimeout?: () => void },
  ) => Promise<Response | null>;
}
```

### Existing Handler Composition (How It's Used)
```typescript
// Source: Paste-service handler pattern -- middleware is called first, returns null to pass through
const response = await githubHandler.handle(request, url);
if (response) return response;
// Continue to paste routes...
```

### Existing Workspace Package Pattern
```json
// Source: packages/shared/package.json
{
  "name": "@plannotator/shared",
  "version": "0.0.1",
  "private": true,
  "exports": {
    "./agents": "./agents.ts",
    "./compress": "./compress.ts",
    // ... explicit export map
  }
}
```

### Existing TypeScript Config for Non-React Packages
```json
// Source: packages/shared/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "types": ["node"]
  },
  "exclude": ["**/*.test.ts"]
}
```

### Files to Extract (Inventory)

| Source | Destination | Lines | Changes Needed |
|--------|-------------|-------|----------------|
| `apps/paste-service/auth/github.ts` | `packages/github/server/oauth.ts` | 331 | Replace `process.env` with config params |
| `apps/paste-service/auth/middleware.ts` | `packages/github/server/middleware.ts` | 192 | No changes needed (already parameterized) |
| `apps/paste-service/auth/types.ts` | `packages/github/shared/types.ts` | 37 | Consolidate with `PRMetadata` from pr.ts |
| `apps/paste-service/github/pr.ts` | `packages/github/server/pr.ts` | 269 | Replace `process.env` with config params |
| `packages/ui/hooks/useGitHubPRSync.ts` | `packages/github/client/useGitHubPRSync.ts` | 191 | Update imports |
| `packages/ui/utils/lineMapper.ts` | `packages/github/client/lineMapper.ts` | 137 | No changes needed |

### Paste-Service Handler Refactor Summary

The `handleRequest()` function in `apps/paste-service/core/handler.ts` (567 lines) currently inlines:
- OAuth routes (lines 152-203): Move to plugin middleware
- PR routes (lines 207-316): Move to plugin middleware
- ACL checks in paste GET (lines 504-560): Keep in handler but import `checkAccess` from plugin
- Paste create with ACL (lines 406-501): Keep in handler but import auth helpers from plugin

After refactor, `handleRequest()` should:
1. Accept optional middleware array
2. Run middleware first (returns `Response | null`)
3. Handle paste CRUD (its core responsibility)
4. Import only `extractToken`, `validateGitHubToken`, `checkAccess` from `@plannotator/github/server` for ACL enforcement on paste access

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Monolithic handler with all routes | Middleware composition (Response \| null) | Already in codebase (external-annotations) | Pattern exists, just not applied to GitHub code yet |
| Inline type definitions per file | Centralized types in shared package | Already in codebase (@plannotator/shared) | Workspace exports map pattern established |

## Open Questions

1. **ACL Enforcement Location**
   - What we know: Paste GET currently validates ACL using `validateGitHubToken()` and `checkAccess()` directly in the handler. These functions must remain callable from paste-service.
   - What's unclear: Should ACL functions live in the plugin (imported by paste-service) or in a shared location?
   - Recommendation: Keep in `packages/github/server/middleware.ts` and import from `@plannotator/github/server`. The paste-service is the primary (only) consumer of the plugin's middleware. This keeps all GitHub auth code in one place per D-09.

2. **useGitHubPRSync Location Decision**
   - What we know: The hook is currently in `packages/ui/hooks/` (upstream territory). Moving it to `packages/github/client/` keeps it fork-only.
   - What's unclear: Whether removing it from `packages/ui/hooks/` counts as an "upstream modification."
   - Recommendation: Move it to `packages/github/client/`. Removing a file from upstream is acceptable since git rebase handles file deletions cleanly (no merge conflict). The file is only used in GitHub integration flows anyway.

3. **lineMapper Utility Ownership**
   - What we know: `lineMapper.ts` is in `packages/ui/utils/` but is exclusively used for GitHub PR comment mapping.
   - What's unclear: Could other features use line mapping in the future?
   - Recommendation: Move to `packages/github/client/` since it's GitHub-specific. If needed elsewhere later, it can be promoted to `@plannotator/shared`.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Bun test 1.3.11 |
| Config file | None (Bun test uses convention -- `*.test.ts` files) |
| Quick run command | `bun test packages/github/` |
| Full suite command | `bun test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ARCH-01 | Package exists with correct exports | unit | `bun test packages/github/server/handler.test.ts -x` | Wave 0 |
| ARCH-02 | App.tsx only adds GitHubProvider wrapper | manual | `git diff upstream/main --name-only` against allowlist | N/A |
| ARCH-03 | Handler returns Response or null | unit | `bun test packages/github/server/handler.test.ts -x` | Wave 0 |
| ARCH-04 | No upstream merge conflicts | smoke | `git diff main --name-only \| grep -v packages/github \| grep -v App.tsx` | N/A |
| ARCH-05 | OAuth/PR/ACL code extracted | unit | `bun test packages/github/ -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `bun test packages/github/`
- **Per wave merge:** `bun test` (full suite)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/github/server/handler.test.ts` -- covers ARCH-01, ARCH-03: GitHubHandler returns Response for known routes, null for unknown
- [ ] `packages/github/server/oauth.test.ts` -- covers ARCH-05: OAuth login redirect generates correct URL, callback exchanges token
- [ ] `packages/github/server/middleware.test.ts` -- covers ARCH-05: extractToken parses Bearer header, checkAccess enforces ACL
- [ ] `packages/github/server/pr.test.ts` -- covers ARCH-05: exportToPR constructs correct API calls, fetchPRComments parses responses
- [ ] `packages/github/client/lineMapper.test.ts` -- can copy from existing packages/ui/utils/ if tests exist there

## Project Constraints (from CLAUDE.md)

- **GSD Workflow:** Must use `/gsd:execute-phase` for planned phase work. No direct repo edits outside GSD workflow.
- **Build order:** Review app must build before hook: `bun run --cwd apps/review build && bun run build:hook`
- **Workspace packages:** Follow `@plannotator/{name}` naming. Use explicit `exports` in package.json.
- **TypeScript:** Strict mode, bundler module resolution, `allowImportingTsExtensions`.
- **Server runtimes:** Bun server pattern for plugin. If Pi needs support, mirror with node:http (deferred -- not Phase 1 scope).
- **React conventions:** Functional components, explicit props typing (not `React.FC`), custom hooks prefixed with `use`.
- **Error handling:** JSON `{ error: "message" }` with HTTP status codes for server endpoints. Try-catch for async operations.
- **Naming:** camelCase for functions/variables, PascalCase for components/interfaces, `.test.ts` suffix for tests.
- **No formatter enforced:** 2-space indentation (observed convention). Mixed quotes.

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection of all files listed in Code Examples section
- `packages/server/external-annotations.ts` -- ExternalAnnotationHandler pattern (the composition interface)
- `apps/paste-service/core/handler.ts` -- Current monolithic handler (567 lines, all routes inline)
- `apps/paste-service/auth/` -- OAuth, middleware, types (existing code to extract)
- `apps/paste-service/github/pr.ts` -- PR creation and comment fetching
- `packages/ui/hooks/useGitHubPRSync.ts` -- Client-side PR sync hook
- `packages/ui/utils/lineMapper.ts` -- Line-to-block mapping utility
- `packages/shared/package.json` -- Workspace package exports pattern

### Secondary (MEDIUM confidence)
- `packages/shared/pr-provider.ts` + `pr-github.ts` -- Separate PR system (CLI-based, NOT the system being extracted, but important to note its existence to avoid confusion)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- No new dependencies, all patterns already in codebase
- Architecture: HIGH -- Directly derived from existing ExternalAnnotationHandler and workspace package patterns
- Pitfalls: HIGH -- Identified from direct code inspection (duplicate types, two PR systems, env var coupling, Cloudflare target)

**Research date:** 2026-04-01
**Valid until:** 2026-05-01 (stable -- no external dependencies to go stale)
