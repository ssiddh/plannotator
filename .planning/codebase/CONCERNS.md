# Codebase Concerns

**Analysis Date:** 2026-03-30

## Tech Debt

**Dual Server Implementation (Bun + Node.js)**
- Issue: Server logic duplicated between `packages/server/` (Bun) and `apps/pi-extension/server/` (Node.js). Both implement the same API surface but use different HTTP primitives.
- Files: `packages/server/index.ts`, `packages/server/review.ts`, `packages/server/annotate.ts` vs `apps/pi-extension/server/serverPlan.ts`, `apps/pi-extension/server/serverReview.ts`, `apps/pi-extension/server/serverAnnotate.ts`
- Impact: Any server endpoint change requires updating both implementations. Increases maintenance burden and risk of divergence.
- Fix approach: Extract HTTP-agnostic logic into `packages/shared/`. Keep only runtime-specific HTTP handling in each target. Pi uses a build-time copy script (`vendor.sh`) but shared code still needs manual sync.

**Path Containment Validation Disabled (OpenCode)**
- Issue: Security validation commented out in `apps/opencode-plugin/plan-mode.ts`. Plans can be written anywhere despite permission restrictions.
- Files: `apps/opencode-plugin/plan-mode.ts:36-55`
- Impact: OpenCode's permission system expects plans scoped to specific directories. Disabling checks bypasses this safety model. TODO comment at line 36: "revisit if we want to re-scope plan file locations."
- Fix approach: Re-implement canonical path validation or document why OpenCode's permission model allows this exception.

**Path Containment Tests Failing**
- Issue: Three path validation tests disabled in `apps/opencode-plugin/plan-mode.test.ts:46-59`. Tests for rejecting paths outside plan directory fail.
- Files: `apps/opencode-plugin/plan-mode.test.ts`
- Impact: No test coverage for path security boundary. Disabled tests indicate the validation logic doesn't work correctly.
- Fix approach: Fix path validation or remove dead code if validation is intentionally disabled.

**Large Component Files (1500+ lines)**
- Issue: Core components exceed 1500 lines. `Settings.tsx` (1815 lines), `App.tsx` files (1739, 1729 lines), `Viewer.tsx` (1167 lines).
- Files: `packages/ui/components/Settings.tsx`, `packages/editor/App.tsx`, `packages/review-editor/App.tsx`, `packages/ui/components/Viewer.tsx`
- Impact: Hard to navigate and test. Settings has 15+ integration toggles in one file. App components mix state management, API calls, keyboard shortcuts, and rendering.
- Fix approach: Split Settings into separate components per integration (Obsidian, Bear, Octarine). Extract custom hooks from App components (`useKeyboardShortcuts`, `useToolbarActions`, etc.).

**Type Safety Bypasses (`any`/`unknown` usage)**
- Issue: 356 occurrences of `any` or `unknown` across 77 TypeScript files. Includes critical areas like annotation highlighting (`useAnnotationHighlighter.ts:19` — `source: any`).
- Files: `packages/ui/hooks/useAnnotationHighlighter.ts`, `packages/server/index.ts`, `apps/hook/server/index.ts`, `packages/ai/` (multiple files)
- Impact: Lost type safety for web-highlighter library integration and AI SDK responses. Runtime errors harder to catch at compile time.
- Fix approach: Define proper interfaces for web-highlighter source objects. Wrap AI SDK responses with validated types.

**Build Order Dependencies**
- Issue: Review UI changes require rebuilding review app before hook app. Hook build copies pre-built HTML from `apps/review/dist/`. Stale HTML copied if review not rebuilt first.
- Files: Build documented in `CLAUDE.md:172-178`
- Impact: Developer confusion when UI changes don't appear. Must remember `bun run --cwd apps/review build && bun run build:hook` sequence. OpenCode plugin depends on hook build completing first.
- Fix approach: Add build dependency checks or make hook build script fail if review HTML missing/stale. Use file timestamps to detect stale builds.

**Pi Extension Generated File Sync**
- Issue: Pi extension uses `vendor.sh` script to copy runtime-agnostic code from `packages/shared/` into `generated/` folder at build time. No automatic detection of source changes.
- Files: `apps/pi-extension/vendor.sh`, `apps/pi-extension/generated/` (build artifact directory)
- Impact: Changes to shared code don't propagate until developer remembers to rebuild Pi package. Risk of serving stale code to Pi users.
- Fix approach: Make Pi build script fail-fast if vendored files differ from source. Add checksum validation or workspace version pinning.

**Node.js Dependency in "Shared" Package**
- Issue: `packages/shared/` described as "cross-runtime logic" but imports `node:fs`, `node:path`, `node:os` in `storage.ts` and `draft.ts`.
- Files: `packages/shared/storage.ts`, `packages/shared/draft.ts`
- Impact: Not truly runtime-agnostic. Can't use in browser context. Package name implies broader portability than it provides.
- Fix approach: Rename to `@plannotator/node-utils` or split into `@plannotator/core` (pure utilities) + `@plannotator/node-storage` (filesystem operations).

## Known Bugs

**Image Annotation Temporary Path Handling**
- Issue: Image attachments use temporary file paths (`/tmp/...`) in annotation export. Server serves images via `/api/image?path=` but path validity not validated after server restart.
- Files: `packages/ui/utils/parser.ts:400`, `packages/server/index.ts` (image serving endpoint)
- Impact: Shared URLs with images break if server restarts or temp files cleaned up. User sees missing images without explanation.
- Workaround: Images embedded as base64 in URL hash for shares. Server-side temp paths only work within single session.

**Diff Annotations Lost on Version Switch**
- Issue: Annotations created on diff content (added/removed/modified blocks) lose `diffContext` metadata when switching between clean/raw diff views.
- Files: `packages/ui/hooks/usePlanDiff.ts`, `packages/ui/components/plan-diff/PlanCleanDiffView.tsx`
- Impact: `[In diff content]` labels may not appear in feedback export if user toggles view modes. Annotations remain but context lost.
- Workaround: Don't toggle diff view mode after annotating.

**VS Code CLI Not Found Error Unclear**
- Issue: IDE diff integration fails with "code not found" error but error message assumes VS Code when other editors might be intended.
- Files: `packages/server/ide.ts:15-42`
- Impact: Hardcoded to VS Code CLI (`code --diff`). No configuration for other editors (Cursor, Zed, etc.).
- Workaround: Install VS Code CLI or manually open diff files.

## Security Considerations

**Image Upload Path Traversal Risk**
- Issue: Image upload endpoint creates temp files but path construction not validated against directory traversal.
- Files: `packages/server/shared-handlers.ts` (handleUpload), `apps/pi-extension/server/handlers.ts`
- Risk: Malicious filename in multipart upload could write outside temp directory.
- Current mitigation: Uses `path.basename()` on original filename but relies on OS temp directory security.
- Recommendations: Validate filename characters, use random UUIDs instead of user-provided names.

**Plan History World-Readable**
- Issue: Plan history saved to `~/.plannotator/history/{project}/{slug}/` with default file permissions. May contain sensitive project information.
- Files: `packages/shared/storage.ts:233-284`
- Risk: Other users on shared systems can read plan history. Plans may contain API keys, database schemas, or business logic.
- Current mitigation: None — relies on OS user isolation.
- Recommendations: Set restrictive file permissions (0600) on write. Document security expectations in README.

**External Annotations API No Auth**
- Issue: `/api/external-annotations` endpoints (POST/PATCH/DELETE) accept arbitrary annotations without authentication.
- Files: `packages/server/external-annotations.ts`, `apps/pi-extension/server/external-annotations.ts`
- Risk: Local server only, but if exposed (port forwarding, devcontainer), anyone can inject annotations.
- Current mitigation: Server binds to localhost. Remote mode uses fixed port 19432 (documented, not secret).
- Recommendations: Add simple token auth for remote mode. Document port exposure risks.

**Encryption Key in URL Fragment**
- Issue: Zero-knowledge paste feature encrypts plans with AES-256-GCM key in URL fragment. Key visible in browser history, logs, referrers.
- Files: `packages/shared/crypto.ts`, `packages/ui/utils/sharing.ts`
- Risk: URL fragment not sent to server but appears in DevTools, screenshot OCR, browser history, password managers, and some analytics tools.
- Current mitigation: Fragment-based approach prevents server-side key access. User must explicitly confirm short URL generation.
- Recommendations: Warn users that encrypted URLs still expose content to anyone with the link. Document use cases (internal team sharing only).

## Performance Bottlenecks

**Parser Blocks Rendering on Large Plans**
- Issue: `parseMarkdownToBlocks()` runs synchronously on plan load. 2000+ line plans block UI for 200-500ms.
- Files: `packages/ui/utils/parser.ts:1-150`
- Cause: Single-threaded markdown parsing + DOM manipulation. No virtualization for large block counts.
- Improvement path: Move parsing to web worker or use incremental rendering. Virtualize block list for 500+ blocks.

**Annotation Restoration O(n²) Complexity**
- Issue: Shared URL annotation restoration searches DOM text content for each annotation. 100 annotations × 200 blocks = 20,000 text comparisons.
- Files: `packages/ui/hooks/useAnnotationHighlighter.ts:200-350` (applyAnnotations)
- Cause: Text-based position recovery (no stable IDs in DOM). Each annotation does full tree walk.
- Improvement path: Build text offset index once. Binary search for positions. Cache DOM text content per block.

**History Save on Every Plan Load**
- Issue: Every plan arrival triggers version history save (`saveToHistory()`) before UI renders. Synchronous filesystem operations on main thread (Bun server).
- Files: `packages/shared/storage.ts:233-284`, `packages/server/index.ts` (startup path)
- Cause: Ensures version captured even if user force-quits browser. Bun synchronous file I/O.
- Improvement path: Already optimized with deduplication. Consider async write with fsync for durability without blocking.

**AI Session SSE Memory Leak**
- Issue: Server-Sent Events connections for AI chat not cleaned up if browser closes without sending abort.
- Files: `packages/ai/session-manager.ts`, `packages/ai/endpoints.ts`
- Cause: No client heartbeat. Server holds open connections indefinitely.
- Improvement path: Add connection timeout (5min). Prune stale connections in session manager.

## Fragile Areas

**Web Highlighter Integration**
- Files: `packages/ui/hooks/useAnnotationHighlighter.ts:1-615`
- Why fragile: Third-party library with untyped source objects (`any`). Highlights stored as DOM mutations. Annotations lost if DOM structure changes (diff view toggle, theme change).
- Safe modification: Don't change markdown rendering strategy (marked → DOMPurify → innerHTML). Any change to block `data-block-id` attributes breaks restoration.
- Test coverage: No automated tests for annotation restoration. Manual testing only.

**Plan Diff Engine Heuristics**
- Files: `packages/ui/utils/planDiffEngine.ts`
- Why fragile: Relies on heuristic to merge consecutive remove+add into "modified" blocks. Sensitive to line break changes and markdown formatting.
- Safe modification: Use `diff` library's output directly. Don't add custom merge logic. Changes affect block-level annotation targeting.
- Test coverage: No unit tests for diff edge cases (large blocks, nested lists, code blocks).

**Git Diff Parsing**
- Files: `packages/shared/review-core.ts`, `packages/server/git.ts`
- Why fragile: Parses git diff output with regex. Assumes unified diff format with specific header structure.
- Safe modification: Don't change `runGitDiff()` invocation flags. Added git config options may break parsing.
- Test coverage: Manual test fixtures in `tests/manual/fixtures/`. No property-based testing for git output variations.

**Cookie Proxy State (VS Code Extension)**
- Files: `apps/vscode-extension/src/cookie-proxy.ts`, `apps/vscode-extension/src/extension.ts:38-77`
- Why fragile: Each panel gets a cookie proxy on random port. Cookies saved to VS Code global state. If multiple panels open, cookie state may conflict.
- Safe modification: Don't share cookie proxy between panels. Each panel needs isolated state.
- Test coverage: Mock-based unit tests. No integration tests with real VS Code.

## Scaling Limits

**Plan Version History Unbounded Growth**
- Current capacity: No limit on version count per plan slug. 100+ iterations = 100+ files in `~/.plannotator/history/{project}/{slug}/`.
- Limit: Filesystem inode limits. Directory listing slows at 10,000+ files.
- Scaling path: Add version pruning (keep last 50, or 30 days). Compress old versions. Move to SQLite for faster queries.

**Archive Browser Memory Usage**
- Current capacity: Loads all archived plan metadata into memory. 1000+ plans = 5-10MB JSON payload.
- Limit: Browser tab memory limit (2-4GB typical). Sidebar becomes sluggish with 500+ plans.
- Scaling path: Paginate archive API. Virtual scroll in sidebar. Server-side filtering by date/project.

**SSE Connection Limits**
- Current capacity: One SSE connection per external annotation stream + one per AI session. Browser limit ~6 connections per origin.
- Limit: Multiple tabs with AI sidebar open exhaust connection pool.
- Scaling path: Use WebSocket instead of SSE. Share connections via SharedWorker.

## Dependencies at Risk

**`web-highlighter` (Unmaintained)**
- Risk: Last published 2+ years ago. Uses deprecated DOM APIs (document.execCommand assumptions).
- Impact: Annotation highlighting core feature. No drop-in replacement found.
- Migration plan: Fork and maintain, or rewrite using modern Selection API + Range manipulation. Explored in `packages/ui/hooks/usePinpoint.ts` (alternative approach for block-level targeting).

**`@opencode-ai/sdk` (Early Stage)**
- Risk: OpenCode SDK at v1.3.0 but API surface still evolving. Breaking changes in minor versions.
- Impact: Plugin hooks for OpenCode may break with SDK updates. Permission model changed between 1.2 → 1.3.
- Migration plan: Pin SDK version in `package.json`. Document required OpenCode version in README.

**Bun Runtime Requirement**
- Risk: Hook and OpenCode servers require Bun. Not compatible with Node.js (uses Bun-specific APIs like `Bun.spawn`, `Bun.serve`).
- Impact: Limits deployment options. Can't use standard Node.js hosting. Users must install Bun.
- Migration plan: Maintain dual implementations (already done for Pi). Provide Node.js fallback in future.

## Missing Critical Features

**No Offline Mode**
- Problem: Plan review requires server running. Can't view shared URLs offline.
- Blocks: Reviewing plans on planes/trains. Team collaboration without internet.

**No Annotation Threading**
- Problem: Multiple reviewers can't reply to each other's annotations. Import merges feedback but no conversation history.
- Blocks: Asynchronous code review workflows. Design discussions in plan context.

**No Plan Search**
- Problem: Archive browser lists plans chronologically. No search by content, tags, or date range.
- Blocks: Finding past decisions as project scales. Cross-referencing related plans.

**No Mobile Review UI**
- Problem: Plan review UI not optimized for mobile screens. Toolbar overlaps content. Annotations hard to tap.
- Blocks: Reviewing plans on phone/tablet. On-call approval workflows.

## Test Coverage Gaps

**Shared URL Encryption/Decryption**
- What's not tested: Zero-knowledge encryption roundtrip with real plan data (2000+ lines). Concurrent encryption from multiple browser tabs.
- Files: `packages/shared/crypto.ts`
- Risk: Key derivation edge cases. Binary data corruption in URL encoding.
- Priority: High — encryption bugs expose user data.

**Plan Version Deduplication**
- What's not tested: Concurrent version saves (race condition if two servers write to same slug). Whitespace-only diffs being considered "different".
- Files: `packages/shared/storage.ts:233-284`
- Risk: Duplicate version files. Version count mismatch in sidebar.
- Priority: Medium — causes clutter, not data loss.

**Server-Sent Events Error Recovery**
- What's not tested: SSE reconnection logic in AI chat and external annotations. Browser behavior when server restarts mid-stream.
- Files: `packages/review-editor/hooks/useAIChat.ts`, `packages/ui/hooks/useExternalAnnotations.ts`
- Risk: Stale annotations after network interruption. Ghost AI sessions.
- Priority: Medium — manual page refresh recovers.

**Git Worktree Diff Handling**
- What's not tested: Edge cases for git worktree paths with spaces, symlinks, non-ASCII characters. Worktree deleted while server running.
- Files: `packages/shared/review-core.ts:300-400` (worktree parsing)
- Risk: Crashes when reviewing worktree diffs in complex git setups.
- Priority: Low — niche feature, graceful degradation.

**Annotation Draft Auto-Save**
- What's not tested: Draft persistence when server crashes mid-annotation. Draft conflict when two reviewers edit same plan concurrently.
- Files: `packages/shared/draft.ts`, `packages/server/draft.ts`
- Risk: Lost annotations after crash. Overwriting teammate's draft.
- Priority: Medium — rare but frustrating when it happens.

**VS Code Extension Multi-Workspace**
- What's not tested: Multiple VS Code workspaces with Plannotator panels open. Workspace folder renamed while panel active.
- Files: `apps/vscode-extension/src/extension.ts`, `apps/vscode-extension/src/ipc-server.ts`
- Risk: IPC registry conflicts. Cookie state leaking between projects.
- Priority: Low — single workspace is typical use case.

**Markdown Edge Cases in Parser**
- What's not tested: Deeply nested lists (6+ levels). Code blocks inside blockquotes. Markdown with HTML comments.
- Files: `packages/ui/utils/parser.ts`
- Risk: Block ID assignment conflicts. Annotations target wrong blocks.
- Priority: High — parser is critical for annotation positioning.

---

*Concerns audit: 2026-03-30*
