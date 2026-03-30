# Architecture

**Analysis Date:** 2026-03-30

## Pattern Overview

**Overall:** Plugin-based review system with multi-runtime server architecture

**Key Characteristics:**
- Hook/event interception pattern — blocks agent actions until user approval
- Server-client separation — Bun/Node servers serve React SPAs, communicate via JSON APIs
- Multi-modal annotation system — plan reviews, code reviews, document annotation, and archive browsing
- Runtime polymorphism — same API surface across Bun (Claude Code/OpenCode) and Node.js (Pi)

## Layers

**Plugin Layer:**
- Purpose: Integrate with agent runtimes (Claude Code hooks, OpenCode plugin API, Pi extension)
- Location: `apps/hook/`, `apps/opencode-plugin/`, `apps/pi-extension/`
- Contains: Plugin manifests, hook configurations, command definitions, agent prompt engineering
- Depends on: `@plannotator/server` (plan/review/annotate server functions)
- Used by: Agent runtimes (Claude Code, OpenCode, Pi)

**Server Layer:**
- Purpose: Serve HTML, provide REST/SSE APIs, manage user decisions, handle storage
- Location: `packages/server/`, `apps/pi-extension/server/` (Node.js mirror)
- Contains: HTTP servers, API endpoints, git integration, storage, integrations (Obsidian/Bear), AI provider wrappers
- Depends on: `@plannotator/shared` (cross-runtime utilities), `@plannotator/ai` (provider-agnostic AI)
- Used by: Plugin layer (spawns servers), browser clients (fetch API)

**UI Layer:**
- Purpose: Interactive browser-based annotation and review interface
- Location: `packages/ui/`, `packages/editor/`, `packages/review-editor/`
- Contains: React components, hooks, markdown parser, annotation engine, sharing logic, theming
- Depends on: `@plannotator/shared` (types, utilities)
- Used by: Server layer (serves built HTML), browser (renders UI)

**Shared/Cross-Runtime Layer:**
- Purpose: Platform-agnostic logic usable in both Bun and Node.js
- Location: `packages/shared/`
- Contains: Types, storage logic (node:fs only), draft persistence, project name detection, feedback templates
- Depends on: Node.js builtins only (no Bun-specific APIs)
- Used by: Server layer, plugin layer

**AI Provider Layer:**
- Purpose: Unified interface to multiple AI agent SDKs for code review AI assistance
- Location: `packages/ai/`
- Contains: Provider registry, session manager, abstract provider interface, concrete implementations (Claude Agent SDK, Codex SDK, Pi SDK, OpenCode SDK)
- Depends on: Agent SDK libraries (optional, gracefully degrades)
- Used by: Review server (`packages/server/review.ts`)

**Integration/Extensions Layer:**
- Purpose: Third-party integrations and IDE extensions
- Location: `apps/vscode-extension/`, `apps/marketing/`, `apps/paste-service/`
- Contains: VS Code webview panel manager, static marketing site, paste service for short URLs
- Depends on: VS Code API (extension), Astro (marketing), Bun/Cloudflare Workers (paste service)
- Used by: Users (VS Code opens plans in tabs), browser (share URLs), remote users (share links)

## Data Flow

**Plan Review Flow:**

1. Agent calls `ExitPlanMode` or `submit_plan(plan)` tool
2. Plugin layer intercepts (hook or tool handler)
3. Server spawns on random/fixed port, saves plan to history (`~/.plannotator/history/{project}/{slug}/`)
4. Browser opens with plan content, version info, and previous version (if exists)
5. User annotates, adds images, references linked docs, views diffs
6. User clicks Approve or Send Feedback
7. API call (`/api/approve` or `/api/deny`) writes annotations to `~/.plannotator/plans/` (if enabled)
8. Server returns decision to plugin layer via Promise resolution
9. Plugin outputs JSON to stdout (Claude Code: `hookSpecificOutput.decision`, OpenCode: tool result)
10. Agent receives approval or feedback and continues

**Code Review Flow:**

1. User runs `/plannotator-review` command or passes PR URL
2. Plugin runs `git diff` or fetches PR patch via GitHub/GitLab CLI
3. Review server spawns with diff data and git context
4. Browser opens diff viewer with file tree and side-by-side view
5. User annotates lines, suggests code changes, adds file-level comments
6. User clicks Send Feedback or Approve (LGTM)
7. API call (`/api/feedback`) collects annotations
8. Server returns feedback to plugin, outputs to agent session
9. Agent receives feedback and revises code

**Document Annotation Flow:**

1. User runs `/plannotator-annotate <file.md>` or `plannotator annotate-last`
2. Plugin resolves file path or extracts last assistant message from session log
3. Annotate server spawns in `mode: "annotate"` with markdown content
4. Browser opens annotation UI (reuses plan editor HTML)
5. User annotates markdown, adds comments
6. User clicks Send Annotations
7. API call (`/api/feedback`) collects annotations
8. Server returns to plugin, outputs to agent session

**State Management:**
- Annotation state: React `useState` in `App.tsx`, synced to draft API for crash recovery
- Server state: Decision promises, mutable diff type (for switching views), file staging state
- Persistent state: Cookies for settings (identity, plan save, agent switch), localStorage for UI preferences, filesystem for history/archives/drafts

## Key Abstractions

**Server Result Pattern:**
- Purpose: Uniform interface for spawning and awaiting user decisions
- Examples: `ServerResult` (plan), `ReviewServerResult` (code), both return `{ port, url, waitForDecision, stop }`
- Pattern: Promise-based async API — server runs until `waitForDecision()` resolves with user choice

**Annotation Model:**
- Purpose: Unified annotation representation across plan and code reviews
- Examples: `Annotation` (plan/doc), `CodeAnnotation` (diff lines), `EditorAnnotation` (VS Code editor)
- Pattern: Type-discriminated unions with metadata (blockId, lineStart/End, diffContext, source)

**Block Parsing:**
- Purpose: Convert markdown to structured blocks for annotation targeting
- Examples: `parseMarkdownToBlocks(markdown)` → `Block[]`, `exportAnnotations(blocks, annotations)` → feedback string
- Pattern: Line-based parsing with block IDs, used by both viewer and exporter

**External Annotation System:**
- Purpose: Real-time annotation injection from external tools (linters, static analyzers, CI)
- Examples: SSE endpoint (`/api/external-annotations/stream`), POST endpoint for batch injection
- Pattern: Server-sent events with in-memory state, versioned polling fallback

**Provider Registry Pattern (AI):**
- Purpose: Dynamically load and query multiple AI providers for code review
- Examples: `ProviderRegistry` holds `ClaudeAgentSDKProvider`, `CodexSDKProvider`, `PiSDKProvider`
- Pattern: Factory pattern with feature detection, graceful degradation when SDK unavailable

**Draft Persistence:**
- Purpose: Auto-save annotations to survive server crashes/restarts
- Examples: `contentHash(plan)` → draft key, `/api/draft` GET/POST/DELETE endpoints
- Pattern: Content-addressed storage in `~/.plannotator/drafts/`, timestamped recovery prompt

## Entry Points

**Claude Code Hook:**
- Location: `apps/hook/server/index.ts`
- Triggers: `ExitPlanMode` PermissionRequest hook (plan review), `/plannotator-review` slash command (code review), `/plannotator-annotate` slash command (doc annotation)
- Responsibilities: Parse stdin JSON, spawn servers, output stdout JSON with hook decision

**OpenCode Plugin:**
- Location: `apps/opencode-plugin/index.ts`
- Triggers: `submit_plan` tool call, event listeners for slash commands
- Responsibilities: Register tool, inject system prompts, spawn servers, return tool results, handle command events

**Pi Extension:**
- Location: `apps/pi-extension/index.ts`
- Triggers: Plan mode entry, `/review` command, `/annotate` command
- Responsibilities: Call extension API, spawn Node.js servers, handle callbacks

**VS Code Extension:**
- Location: `apps/vscode-extension/src/extension.ts`
- Triggers: `PLANNOTATOR_BROWSER` env var pointing to IPC router script
- Responsibilities: Open webview panels, proxy cookies, manage editor annotations, inject env vars into terminals

**Marketing Site:**
- Location: `apps/marketing/src/pages/index.astro`
- Triggers: Web browser navigation
- Responsibilities: Static marketing pages, docs, blog (Astro 5, SSG)

**Paste Service:**
- Location: `apps/paste-service/targets/cloudflare.ts` (Cloudflare Worker), `apps/paste-service/targets/bun.ts` (self-hosted)
- Triggers: POST `/api/paste` from UI, GET `/api/paste/:id` from share portal
- Responsibilities: Store/retrieve compressed plan data for short URLs

## Error Handling

**Strategy:** Graceful degradation with user-visible errors

**Patterns:**
- Server startup: Retry on port conflict (5 attempts, 500ms delay), throw on non-retryable errors
- API calls: Return JSON `{ error: "..." }` with HTTP 4xx/5xx, UI displays toast/banner
- Git operations: Capture stderr, return `{ patch, error }` tuple, UI shows error banner with retry button
- Integration failures (Obsidian/Bear): Log to stderr, return `{ success: false, error }`, continue with other operations
- Draft loading: Silent failure if file doesn't exist, prompt user on successful load
- External annotations: SSE connection failure falls back to polling, UI remains functional
- AI provider unavailable: Hide AI features, review functionality unaffected

## Cross-Cutting Concerns

**Logging:** Console.error for server-side errors, VS Code output channel for extension logs

**Validation:** File path validation for git operations, annotation schema validation on external API, agent name validation for OpenCode agent switching

**Authentication:** Cookie-based for settings persistence, no user accounts, local filesystem access only (except paste service for share URLs)

---

*Architecture analysis: 2026-03-30*
