# External Integrations

**Analysis Date:** 2026-03-30

## APIs & External Services

**AI/Agent SDKs:**
- Anthropic Claude Agent SDK - AI provider for inline chat
  - SDK/Client: `@anthropic-ai/claude-agent-sdk` ^0.2.81
  - Implementation: `packages/ai/providers/claude-agent-sdk.ts`
  - Auth: Via SDK's native authentication
  - Features: Session creation, forking, resuming, read-only tools (Read, Glob, Grep, WebSearch)
  - Models: Default `claude-sonnet-4-6`, configurable

- OpenCode SDK - Plugin integration
  - SDK/Client: `@opencode-ai/sdk` ^1.3.0
  - Implementation: `apps/opencode-plugin/index.ts`, `packages/ai/providers/opencode-sdk.ts`
  - Features: `submit_plan` tool, event handlers for commands, permission hooks

- Codex SDK - Codex integration
  - SDK/Client: `@openai/codex-sdk` ^0.116.0
  - Implementation: `packages/ai/providers/codex-sdk.ts`

**Paste Service:**
- Self-hosted paste API for short URL sharing
  - Service: Custom implementation in `apps/paste-service/`
  - Hosted: Cloudflare Workers at `https://plannotator-paste.plannotator.workers.dev`
  - Self-hosted: Bun server on port 19433 (`apps/paste-service/targets/bun.ts`)
  - Endpoints:
    - `POST /api/paste` - Store compressed plan data, returns `{ id }`
    - `GET /api/paste/:id` - Retrieve stored compressed data
  - Storage: Cloudflare KV (hosted) or filesystem (self-hosted)
  - TTL: Configurable expiration for pastes
  - CORS: Configurable allowed origins (default: `share.plannotator.ai`, `localhost:3001`)
  - Configuration: `PLANNOTATOR_PASTE_URL` env var

**Share Portal:**
- Client-side plan sharing via URL hash
  - Service: Static site at `https://share.plannotator.ai`
  - Implementation: `apps/portal/` (Vite + React)
  - Features: Decompress plan from URL hash, render with annotations
  - No backend required (pure client-side decompression)
  - Configuration: `PLANNOTATOR_SHARE_URL` env var for custom portal

## Data Storage

**Databases:**
- None (no traditional database)

**File Storage:**
- Local filesystem for plan history, drafts, and configuration
  - History: `~/.plannotator/history/{project}/{slug}/{version}.md`
  - Decisions: `~/.plannotator/plans/{filename}.md`
  - Drafts: `~/.plannotator/drafts/{hash}.json`
  - Configuration: `~/.plannotator/config.json`
  - Temp images: OS temp directory for annotation attachments
- Cloudflare KV for paste service
  - Binding: `PASTE_KV`
  - Keys: `paste:{id}` format
  - Automatic expiration via `expirationTtl`

**Caching:**
- None (no dedicated caching layer)

## Authentication & Identity

**Auth Provider:**
- Custom identity generation (no traditional auth)
  - Implementation: `unique-username-generator` package for pseudonymous identities
  - Storage: Browser cookies for identity persistence
  - Scope: Per-port (each server session has isolated cookies)

## Monitoring & Observability

**Error Tracking:**
- None (no third-party error tracking)

**Logs:**
- Console logging to stderr
  - Server startup messages with URLs
  - Git command output
  - Browser open status
  - Port binding warnings

## CI/CD & Deployment

**Hosting:**
- Cloudflare Workers for paste service
  - Deployment: `wrangler deploy` via `apps/paste-service/`
  - Config: `wrangler.toml` with KV namespace bindings
- S3/CloudFront for static sites (marketing, portal)
  - Triggered: GitHub Actions on push to main (inferred)
- VS Code Marketplace for extension
  - Publisher: `backnotprop`
  - Package: `.vsix` via `@vscode/vsce`
- Claude Code Marketplace for plugin
  - Owner: `backnotprop`
  - Manifest: `.claude-plugin/marketplace.json`

**CI Pipeline:**
- GitHub Actions (inferred from deployment mentions)
  - Marketing site build and deploy to S3/CloudFront
  - No explicit CI config in codebase

## Environment Configuration

**Required env vars:**
- None strictly required (all have defaults)

**Optional env vars:**
- `PLANNOTATOR_REMOTE` - Remote mode flag (`1` or `true`)
- `PLANNOTATOR_PORT` - Fixed port override
- `PLANNOTATOR_BROWSER` - Custom browser path (macOS: app name, Linux/Windows: executable)
- `PLANNOTATOR_SHARE` - Disable sharing (`disabled`)
- `PLANNOTATOR_SHARE_URL` - Custom share portal URL
- `PLANNOTATOR_PASTE_URL` - Custom paste service URL
- `PLANNOTATOR_ORIGIN` - Origin identifier for UI customization
- `PLANNOTATOR_PLAN_TIMEOUT_SECONDS` - Plan approval timeout
- `PLANNOTATOR_ALLOW_SUBAGENTS` - Allow subagents to see submit_plan (OpenCode)

**Secrets location:**
- No secrets required (no API keys, database credentials)
- AI SDK authentication handled by SDK itself (outside plugin scope)

## Webhooks & Callbacks

**Incoming:**
- None

**Outgoing:**
- None

## Version Control & Git Integration

**Git CLI:**
- Purpose: Code review diff generation, metadata extraction
- Usage:
  - `git diff` - Generate patches for review (`packages/server/git.ts`)
  - `git add/reset` - Stage/unstage files from review UI
  - `git status` - Detect branch, worktree info
  - `git log` - Commit history
  - `git remote` - Repository URL detection
  - `git config` - User name/email detection
- Commands run via Bun's `$` shell API (e.g., `await $`git diff``)
- File paths validated before git operations to prevent command injection

**GitHub/GitLab PR APIs:**
- Purpose: Pull request review integration
- Implementation: `packages/server/pr.ts`
- Features:
  - Fetch PR file content (base, head, merged)
  - Submit review comments
  - Mark files as viewed
  - Detect provider (GitHub, GitLab, Bitbucket) from remote URL
- Commands: `gh` CLI (GitHub), `glab` CLI (GitLab)
- Endpoints called via CLI tools (not direct API calls)

## IDE Integration

**VS Code:**
- Purpose: Display plans in editor tabs, open diff viewer, add inline annotations
- Integration methods:
  1. **Extension** (`apps/vscode-extension/`):
     - Opens Plannotator URLs in webview panels
     - IPC server for communication with plugin
     - Cookie proxy for identity sharing
     - Editor annotation API (add/delete inline comments)
     - Commands: `plannotator-webview.openUrl`, `addEditorAnnotation`, `deleteEditorAnnotation`
  2. **CLI diff command** (`code --diff`):
     - Opens plan version diffs in VS Code's native diff viewer
     - Implementation: `packages/server/ide.ts` `openEditorDiff()`
     - Requires: VS Code CLI in PATH
  3. **Environment variable injection**:
     - Extension sets `PLANNOTATOR_BROWSER` in integrated terminals
     - Routes plan opens to VS Code webview automatically

**VS Code Extension Details:**
- Activation: `onStartupFinished` (automatic)
- Extension kind: `workspace`, `ui` (multi-environment support)
- Commands: Context menu integration for selected text annotations
- Keybindings: `Cmd+Shift+.` (Mac) / `Ctrl+Shift+.` (Windows/Linux)
- Configuration: `plannotatorWebview.injectBrowser` setting (default: true)

## Note-Taking Apps Integration

**Obsidian:**
- Purpose: Save approved plans to Obsidian vaults
- Implementation: `packages/server/integrations.ts` `saveToObsidian()`
- Features:
  - Auto-detect vaults (searches `~/Documents`, `~/Library/Mobile Documents`, `~/iCloud`)
  - Generate frontmatter with tags, timestamp
  - Organize by date/project folders
  - API endpoint: `GET /api/obsidian/vaults` - Detect available vaults
  - Reference browsing: `GET /api/reference/obsidian/files`, `GET /api/reference/obsidian/doc`
- Storage: Writes markdown files directly to vault filesystem
- No API calls (direct filesystem access)

**Bear:**
- Purpose: Save approved plans to Bear notes
- Implementation: `packages/server/integrations.ts` `saveToBear()`
- Features:
  - Create notes via `bear://x-callback-url/create` URL scheme
  - Auto-generate hashtags from plan content and project name
  - Open note in Bear after creation
- Integration: macOS URL scheme (opens Bear app)
- No API calls (URL scheme only)

**Octarine:**
- Purpose: Save plans to custom note-taking setup
- Implementation: Custom frontmatter generation (`generateOctarineFrontmatter()`)

## Browser Integration

**Browser Opening:**
- Purpose: Launch plan review UI in user's browser
- Implementation: `packages/server/browser.ts` `openBrowser()`
- Platform support:
  - macOS: `open` command (app name or path via `PLANNOTATOR_BROWSER`)
  - Linux: `xdg-open` (executable path via `PLANNOTATOR_BROWSER`)
  - Windows: `start` (executable path via `PLANNOTATOR_BROWSER`)
  - WSL: Special handling with Windows paths
- Detection: Checks `PLANNOTATOR_BROWSER` env var first, falls back to system default

**Compression/Crypto:**
- Purpose: Share plans via URL hash
- APIs used:
  - `CompressionStream`/`DecompressionStream` - Native browser API (deflate-raw)
  - `crypto.subtle.encrypt`/`decrypt` - Web Crypto API (AES-GCM, optional encryption)
  - Base64url encoding for URL safety
- Implementation: `packages/shared/compress.ts`, `packages/shared/crypto.ts`
- No third-party compression libraries

## External Annotation API

**Purpose:** Allow external tools (linters, formatters, IDEs) to inject annotations into active plan/review sessions

**Endpoints:**
- `GET /api/external-annotations/stream` - SSE stream for real-time annotation updates
- `GET /api/external-annotations` - Snapshot polling endpoint with version gating (`?since=N`)
- `POST /api/external-annotations` - Add annotations (single or batch `{ annotations: [...] }`)
- `PATCH /api/external-annotations?id={id}` - Update annotation fields
- `DELETE /api/external-annotations` - Remove by `?id=`, `?source=`, or clear all

**Implementation:**
- `packages/server/external-annotations.ts` - Server-side handler
- In-memory store per server session (no persistence)
- Version counter for change detection

**Annotation Format:**
- Markdown plans: Text-based (blockId, startOffset, endOffset)
- Code review: Line-based (file, lineNumber, side: old/new)
- Fields: type (comment/deletion), text, source (tool identifier), author

**Use Cases:**
- Linter warnings as inline annotations
- AI-generated suggestions
- External code analysis tools

---

*Integration audit: 2026-03-30*
