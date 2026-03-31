# Codebase Structure

**Analysis Date:** 2026-03-30

## Directory Layout

```
plannotator/
├── apps/                        # Deployable applications and plugins
│   ├── hook/                    # Claude Code/Copilot CLI plugin
│   ├── opencode-plugin/         # OpenCode plugin
│   ├── pi-extension/            # Pi extension
│   ├── vscode-extension/        # VS Code extension
│   ├── codex/                   # Codex-specific handlers
│   ├── copilot/                 # Copilot CLI-specific handlers
│   ├── review/                  # Standalone review dev server
│   ├── portal/                  # Share URL viewer (share.plannotator.ai)
│   ├── marketing/               # Marketing site (plannotator.ai)
│   ├── paste-service/           # Short URL service (Cloudflare Worker + self-hosted)
│   └── skills/                  # Compound skills
├── packages/                    # Shared libraries
│   ├── server/                  # Bun server implementation
│   ├── ui/                      # React UI components, hooks, utils
│   ├── editor/                  # Plan review app entry
│   ├── review-editor/           # Code review app entry
│   ├── ai/                      # AI provider abstraction
│   └── shared/                  # Cross-runtime utilities
├── scripts/                     # Build and deploy scripts
├── tests/                       # Integration tests
├── .planning/                   # Codebase documentation
├── package.json                 # Workspace root
└── bunfig.toml                  # Bun configuration
```

## Directory Purposes

**apps/hook:**
- Purpose: Claude Code plugin — intercepts ExitPlanMode hook, provides slash commands
- Contains: `.claude-plugin/plugin.json`, `hooks/hooks.json`, `commands/*.md`, `server/index.ts`, `dist/index.html`, `dist/review.html`
- Key files: `server/index.ts` (CLI entry, 7 modes), `hooks/hooks.json` (PermissionRequest registration)

**apps/opencode-plugin:**
- Purpose: OpenCode plugin — registers submit_plan tool, provides slash commands
- Contains: `index.ts` (plugin entry), `commands/*.md`, `plannotator.html`, `review-editor.html` (copied from hook build)
- Key files: `index.ts` (plugin hooks, tool definition, system prompt injection)

**apps/pi-extension:**
- Purpose: Pi extension — similar to OpenCode but uses Pi's extension API
- Contains: `index.ts` (extension entry), `server/` (Node.js server mirror), `commands/`
- Key files: `server/index.ts`, `server/review.ts`, `server/annotate.ts` (Node.js HTTP servers)

**apps/vscode-extension:**
- Purpose: VS Code extension — opens plans in editor tabs instead of browser
- Contains: `src/extension.ts`, `src/panel-manager.ts`, `src/cookie-proxy.ts`, `src/ipc-server.ts`, `src/editor-annotations.ts`, `bin/open-in-vscode` (router script)
- Key files: `src/extension.ts` (activation, IPC server), `bin/open-in-vscode` (PLANNOTATOR_BROWSER shim)

**apps/codex:**
- Purpose: Codex-specific session log parsing for annotate-last command
- Contains: Session discovery logic for Codex rollout structure
- Key files: Codex session parsing utilities

**apps/copilot:**
- Purpose: Copilot CLI-specific session log parsing and plan mode interception
- Contains: Session discovery, plan.md resolution
- Key files: Copilot session utilities

**apps/review:**
- Purpose: Standalone development server for code review UI
- Contains: `index.tsx` (React entry), `index.html`, `server/index.ts` (optional dev server), `vite.config.ts`
- Key files: `index.tsx` (mounts `ReviewApp` from `packages/review-editor`)

**apps/portal:**
- Purpose: Share URL viewer — decompresses plan data from URL hash
- Contains: `index.tsx`, static build output for S3/CloudFront
- Key files: `index.tsx` (share payload decompression)

**apps/marketing:**
- Purpose: Marketing site and documentation (plannotator.ai)
- Contains: `src/pages/`, `src/content/docs/`, `src/content/blog/`, `astro.config.mjs`
- Key files: `src/pages/index.astro`, content collections in `src/content/`

**apps/paste-service:**
- Purpose: Compressed plan storage for short share URLs
- Contains: `core/` (platform-agnostic logic), `stores/` (fs/kv/s3 backends), `targets/` (Cloudflare Worker, Bun server)
- Key files: `targets/cloudflare.ts`, `targets/bun.ts`, `core/handler.ts`

**apps/skills:**
- Purpose: Compound skills for agent workflows
- Contains: Skill definitions that compose multiple Plannotator commands
- Key files: Skill YAML definitions

**packages/server:**
- Purpose: Shared Bun server implementation for plan/review/annotate modes
- Contains: `index.ts` (plan server), `review.ts` (review server), `annotate.ts` (annotate server), `storage.ts`, `integrations.ts`, `git.ts`, `pr.ts`
- Key files: `index.ts` (startPlannotatorServer), `review.ts` (startReviewServer), `annotate.ts` (startAnnotateServer)

**packages/ui:**
- Purpose: Shared React UI components, hooks, utilities, theme system
- Contains: `components/`, `hooks/`, `utils/`, `theme.css`, `types.ts`
- Key files: `components/Viewer.tsx`, `components/AnnotationPanel.tsx`, `hooks/useAnnotationHighlighter.ts`, `utils/parser.ts`, `utils/sharing.ts`

**packages/editor:**
- Purpose: Plan review app entry point — mounts UI with plan-specific logic
- Contains: `App.tsx`, `hooks/useCheckboxOverrides.ts`
- Key files: `App.tsx` (main plan review app)

**packages/review-editor:**
- Purpose: Code review app entry point — diff viewer and annotation UI
- Contains: `App.tsx`, `components/DiffViewer.tsx`, `components/FileTree.tsx`, `components/ReviewPanel.tsx`
- Key files: `App.tsx` (main code review app)

**packages/ai:**
- Purpose: Provider-agnostic AI abstraction for code review assistance
- Contains: `providers/` (SDK implementations), `index.ts` (registry/session manager)
- Key files: `providers/claude-agent-sdk.ts`, `providers/codex-sdk.ts`, `providers/pi-sdk.ts`, `providers/opencode-sdk.ts`

**packages/shared:**
- Purpose: Cross-runtime utilities (Bun and Node.js compatible)
- Contains: `storage.ts` (history/archive/draft), `draft.ts`, `project.ts`, `feedback-templates.ts`, `types.ts`
- Key files: `storage.ts` (savePlan, saveToHistory, listArchivedPlans), `draft.ts` (contentHash, draft persistence)

## Key File Locations

**Entry Points:**
- `apps/hook/server/index.ts`: CLI entry (7 modes: plan, review, annotate, annotate-last, archive, sessions, copilot-plan, copilot-last)
- `apps/opencode-plugin/index.ts`: OpenCode plugin entry (submit_plan tool, command handlers)
- `apps/pi-extension/index.ts`: Pi extension entry
- `apps/vscode-extension/src/extension.ts`: VS Code extension activation
- `packages/editor/App.tsx`: Plan review React app
- `packages/review-editor/App.tsx`: Code review React app

**Configuration:**
- `apps/hook/.claude-plugin/plugin.json`: Claude Code plugin manifest
- `apps/hook/hooks/hooks.json`: Hook registration (PermissionRequest)
- `apps/opencode-plugin/package.json`: OpenCode plugin manifest
- `apps/vscode-extension/package.json`: VS Code extension manifest
- `.claude-plugin/marketplace.json`: Marketplace listing (root level)

**Core Logic:**
- `packages/server/index.ts`: Plan server API routes
- `packages/server/review.ts`: Code review server API routes
- `packages/server/storage.ts`: Plan history and archive management
- `packages/ui/utils/parser.ts`: Markdown parsing and annotation export
- `packages/ui/utils/sharing.ts`: URL share compression/decompression
- `packages/ui/hooks/useAnnotationHighlighter.ts`: web-highlighter integration

**Testing:**
- `tests/`: Integration tests for server APIs and UI flows

## Naming Conventions

**Files:**
- Components: PascalCase (`Viewer.tsx`, `AnnotationPanel.tsx`)
- Utilities: camelCase (`parser.ts`, `sharing.ts`)
- Server modules: kebab-case for multi-word (`editor-annotations.ts`, `external-annotations.ts`)

**Directories:**
- Apps: kebab-case (`vscode-extension`, `paste-service`)
- Packages: kebab-case (`review-editor`)
- Component subdirs: kebab-case (`plan-diff/`, `sidebar/`)

## Where to Add New Code

**New Plugin Mode:**
- Primary code: Add mode handler in `apps/hook/server/index.ts` (e.g., `if (args[0] === "new-mode")`)
- Server: Add server function in `packages/server/` (e.g., `new-mode.ts`)
- UI: Reuse existing HTML or create new React app in `packages/`

**New UI Component:**
- Implementation: `packages/ui/components/{ComponentName}.tsx`
- If mode-specific (plan vs review): Place in `packages/editor/components/` or `packages/review-editor/components/`

**New API Endpoint:**
- Plan server: Add route in `packages/server/index.ts` (fetch handler)
- Review server: Add route in `packages/server/review.ts`
- Annotate server: Add route in `packages/server/annotate.ts`

**New Integration:**
- Implementation: Add to `packages/server/integrations.ts` (e.g., `saveToNewApp()`)
- Settings UI: Add tab to `packages/ui/components/Settings.tsx`

**New AI Provider:**
- Implementation: `packages/ai/providers/{provider-name}.ts`
- Registration: Auto-registered in `packages/server/review.ts` if SDK available

**Utilities:**
- Shared helpers: `packages/ui/utils/{utility-name}.ts` (browser-compatible)
- Server helpers: `packages/server/{helper-name}.ts` (Bun/Node.js)
- Cross-runtime: `packages/shared/{utility-name}.ts` (node:fs only, no Bun APIs)

## Special Directories

**.planning/:**
- Purpose: Codebase documentation for GSD commands
- Generated: By `/gsd:map-codebase` agents
- Committed: Yes (part of project knowledge base)

**apps/hook/dist/:**
- Purpose: Single-file HTML builds for hook server
- Generated: `bun run build:hook` (inlines JS/CSS, copies from `apps/review/dist/`)
- Committed: Yes (binary plugins need compiled assets)

**apps/opencode-plugin/*.html:**
- Purpose: OpenCode plugin assets (copied from hook build)
- Generated: `bun run build:opencode` (copies from `apps/hook/dist/`)
- Committed: Yes

**apps/pi-extension/server/:**
- Purpose: Node.js mirror of Bun server (Pi uses Node.js runtime)
- Generated: No (manually maintained parallel implementation)
- Committed: Yes

**~/.plannotator/:**
- Purpose: User data directory (plans, history, drafts, config)
- Generated: Runtime (on first server start)
- Committed: No (local user data)

**node_modules/:**
- Purpose: Installed dependencies
- Generated: `bun install`
- Committed: No

**apps/marketing/dist/:**
- Purpose: Static site build for S3 deployment
- Generated: `bun run build:marketing`
- Committed: No

---

*Structure analysis: 2026-03-30*
