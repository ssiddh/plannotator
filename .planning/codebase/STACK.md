# Technology Stack

**Analysis Date:** 2026-03-30

## Languages

**Primary:**
- TypeScript ~5.8.2 - All application code, packages, and server implementations
- JavaScript - Build scripts, configuration files

**Secondary:**
- CSS - Theming system in `packages/ui/theme.css`, component styles
- Markdown - Documentation, content collections, plan/annotation content

## Runtime

**Environment:**
- Bun 1.3.11 - Primary runtime for plugin servers (`apps/hook/`, `apps/opencode-plugin/`)
- Node.js 18+ - VS Code extension (`apps/vscode-extension/`), Pi extension (`apps/pi-extension/`)
- Browser - Frontend applications (plan editor, review editor, portal)
- Cloudflare Workers - Paste service deployment (`apps/paste-service/targets/cloudflare.ts`)

**Package Manager:**
- Bun (native workspace support)
- Lockfile: `bun.lock` present
- Workspaces: `apps/*`, `packages/*` defined in root `package.json`

**Configuration:**
- `bunfig.toml` sets linker to "isolated"

## Frameworks

**Core:**
- React 19.2.3 - All UI components (plan editor, review editor, marketing site components)
- Astro 5.7.0 - Static site generation for marketing site (`apps/marketing/`)
  - Output: static
  - Integrations: `@astrojs/react`, `@astrojs/sitemap`, `@astrojs/mdx`

**Testing:**
- Bun test - Native test runner (test files: `*.test.ts`)

**Build/Dev:**
- Vite 6.2.0 - Build system for all React apps (`apps/hook/`, `apps/review/`, `apps/portal/`)
  - `vite-plugin-singlefile` - Bundles to single HTML file for plugin distribution
  - `@vitejs/plugin-react` - React support
- esbuild 0.24.0 - VS Code extension bundling (`apps/vscode-extension/scripts/esbuild.config.ts`)
  - Target: Node.js 18, CommonJS output
  - Platform: node, format: cjs
- Wrangler 3.99.0 - Cloudflare Workers deployment tool

## Key Dependencies

**Critical:**
- `@anthropic-ai/claude-agent-sdk` ^0.2.81 - Claude Agent SDK integration for AI provider
- `@opencode-ai/sdk` ^1.3.0 - OpenCode plugin SDK
- `@openai/codex-sdk` ^0.116.0 - Codex SDK integration
- `@pierre/diffs` ^1.1.0-beta.19 - Git diff parsing and rendering (`packages/review-editor/`)

**UI/Rendering:**
- `@plannotator/web-highlighter` ^0.8.1 - Text selection and highlighting for annotations
- `highlight.js` ^11.11.1 - Syntax highlighting for code blocks
- `mermaid` ^11.12.2 - Diagram rendering in markdown
- `@viz-js/viz` ^3.25.0 - Graphviz diagram rendering
- `marked` ^17.0.5 - Markdown parsing (used in review editor)
- `dompurify` ^3.3.3 - HTML sanitization for markdown rendering
- `diff` ^8.0.3 - Line-level diff computation for plan version comparison
- `perfect-freehand` ^1.2.2 - Image annotation drawing

**Styling:**
- `tailwindcss` ^4.1.18 - Utility-first CSS framework (all apps)
- `@tailwindcss/vite` ^4.1.18 - Vite integration for Tailwind v4
- Custom theme system in `packages/ui/theme.css` with 18+ themes

**Infrastructure:**
- `@vscode/vsce` ^3.0.0 - VS Code extension packaging tool
- `typescript` ~5.8.2 - Type checking and compilation

## Configuration

**Environment:**
- Environment variables for server configuration:
  - `PLANNOTATOR_REMOTE` - Remote/devcontainer mode flag
  - `PLANNOTATOR_PORT` - Fixed port (default: random local, 19432 remote)
  - `PLANNOTATOR_BROWSER` - Custom browser path
  - `PLANNOTATOR_SHARE` - Enable/disable URL sharing
  - `PLANNOTATOR_SHARE_URL` - Custom share portal URL (default: `https://share.plannotator.ai`)
  - `PLANNOTATOR_PASTE_URL` - Paste service API URL (default: `https://plannotator-paste.plannotator.workers.dev`)
  - `PLANNOTATOR_ORIGIN` - Origin identifier (`claude-code` or `opencode`)
  - `PLANNOTATOR_PLAN_TIMEOUT_SECONDS` - Plan approval timeout (default: 345600)
  - `PLANNOTATOR_ALLOW_SUBAGENTS` - Allow subagents to see submit_plan tool (OpenCode)
- No `.env` files present in repository (environment-based configuration)

**Build:**
- `tsconfig.json` files per package/app
  - Target: ES2022
  - Module: ESNext
  - Module resolution: bundler (Bun-style)
  - Strict mode enabled
  - No emit (type-checking only)
- `vite.config.ts` in all Vite-based apps
  - Single-file output for plugin apps
  - React JSX transform
  - Tailwind CSS plugin
  - Path aliases for monorepo packages
- `astro.config.mjs` for marketing site
  - Site URL: `https://plannotator.ai`
  - Shiki syntax highlighting (github-light/github-dark)
  - Trailing slash: always
- `wrangler.toml` for Cloudflare Workers
  - KV namespace binding: `PASTE_KV`
  - CORS origins configured

**TypeScript:**
- Path aliases for package imports (e.g., `@plannotator/ui`, `@plannotator/server`)
- Isolated modules, skip lib check enabled
- JSX: `react-jsx` for React 19

## Platform Requirements

**Development:**
- Bun >=1.0.0 (peer dependency for `@plannotator/server`)
- Node.js 18+ (for VS Code extension development)
- Git (for diff operations, version control)
- VS Code CLI (`code` command) - Optional, for diff integration

**Production:**
- Claude Code CLI with plugin/hooks support - Hook plugin deployment
- OpenCode - OpenCode plugin deployment
- VS Code 1.85.0+ - Extension installation
- Cloudflare Workers - Paste service hosting
- S3/CloudFront - Marketing site, portal site hosting
- Browser with modern APIs:
  - CompressionStream/DecompressionStream (deflate-raw)
  - Web Crypto API (for encryption)
  - ES2022 features

**Plugin Distribution:**
- Claude Code marketplace: `backnotprop/plannotator`
- VS Code marketplace: Publisher `backnotprop`
- Local testing: `claude --plugin-dir ./apps/hook`

## Build Pipeline

**Hook Plugin (Claude Code):**
1. Build review app: `bun run --cwd apps/review build` → `apps/review/dist/index.html`
2. Build hook app: `bun run --cwd apps/hook build` → `apps/hook/dist/index.html`
3. Copy review HTML to hook dist: `cp ../review/dist/index.html dist/review.html`
4. Output: Single-file HTML bundles for plan review and code review

**OpenCode Plugin:**
1. Build hook first (generates HTML files)
2. `bun run --cwd apps/opencode-plugin build` copies HTML to `plannotator.html` and `review-editor.html`

**Marketing Site:**
- `bun run --cwd apps/marketing build` → Static site to `dist/`
- Content collections for docs and blog posts

**VS Code Extension:**
- `bun run --cwd apps/vscode-extension build` → esbuild to `dist/extension.cjs`
- `bun run --cwd apps/vscode-extension package` → `.vsix` file via vsce

**Build Order Dependency:**
Review app must be built before hook app (hook copies review HTML). OpenCode plugin depends on both.

---

*Stack analysis: 2026-03-30*
