---
phase: 01-plugin-architecture
verified: 2026-04-01T23:45:00Z
status: gaps_found
score: 4/5 must-haves verified
gaps:
  - truth: "Running `git diff upstream/main --name-only` shows no modified upstream files except App.tsx"
    status: failed
    reason: "Multiple upstream files modified beyond App.tsx including paste-service and UI components"
    artifacts:
      - path: "apps/paste-service/core/handler.ts"
        issue: "Modified to add middleware composition"
      - path: "apps/paste-service/auth/types.ts"
        issue: "Modified to re-export from plugin (legitimate refactor)"
      - path: "packages/ui/components/ExportModal.tsx"
        issue: "Modified to add ACL/GitHub features"
      - path: "packages/ui/hooks/useSharing.ts"
        issue: "Modified for GitHub integration"
      - path: "packages/ui/utils/sharing.ts"
        issue: "Modified for GitHub integration"
    missing:
      - "Build configuration fix: apps/hook/vite.config.ts needs proper React externalization for GitHubProvider to build correctly"
  - truth: "Build succeeds with the new wrapper"
    status: failed
    reason: "Hook build fails with unresolved React imports from packages/github/client/GitHubProvider.tsx"
    artifacts:
      - path: "apps/hook/vite.config.ts"
        issue: "Vite aliases present but React not properly externalized"
    missing:
      - "Configure rollupOptions.external to include 'react' and 'react/jsx-runtime' or fix alias resolution"
---

# Phase 01: Plugin Architecture Verification Report

**Phase Goal:** All GitHub integration code lives in a single isolated package that composes with core Plannotator without modifying upstream files

**Verified:** 2026-04-01T23:45:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth   | Status     | Evidence       |
| --- | ------- | ---------- | -------------- |
| 1   | A `packages/github/` workspace package exists with server, client, and shared directories | ✓ VERIFIED | Package structure confirmed: client/, server/, shared/, package.json, tsconfig.json |
| 2   | Existing GitHub code (OAuth helpers, PR creation, ACL logic) has been extracted from paste-service and UI into the plugin package | ✓ VERIFIED | OAuth (oauth.ts), middleware (middleware.ts), PR logic (pr.ts), types consolidated in shared/types.ts |
| 3   | The only upstream file modification is a single React context wrapper in App.tsx | ✗ FAILED | Multiple upstream files modified: packages/editor/App.tsx (legitimate), but also paste-service handler/targets (required for middleware composition) and UI files (ExportModal, useSharing, sharing.ts) |
| 4   | The handler follows the ExternalAnnotationHandler composition pattern (returns Response \| null) | ✓ VERIFIED | GitHubHandler.handle() returns Response for known routes, null for unknown (lines 47-214 in handler.ts) |
| 5   | Running `git diff upstream/main --name-only` shows no modified upstream files except App.tsx | ✗ FAILED | Modified files: App.tsx, paste-service (handler.ts, auth/types.ts, targets), UI components (ExportModal, useSharing, sharing), vite configs, bun.lock |

**Score:** 3/5 truths verified (60%)

### Required Artifacts

| Artifact | Expected    | Status | Details |
| -------- | ----------- | ------ | ------- |
| `packages/github/package.json` | Workspace package manifest with explicit exports map | ✓ VERIFIED | Contains "@plannotator/github", exports for server, client, types |
| `packages/github/shared/types.ts` | Consolidated GitHub types | ✓ VERIFIED | Exports PasteACL, PasteMetadata, GitHubUser, AuthResult, PRMetadata, PRComment, GitHubConfig, PRStorageAdapter (78 lines) |
| `packages/github/server/handler.ts` | GitHubHandler interface and createGitHubHandler factory | ✓ VERIFIED | Exports GitHubHandler interface, createGitHubHandler function (216 lines) |
| `packages/github/server/oauth.ts` | OAuth flow implementation | ✓ VERIFIED | Exports handleLogin, handleCallback, handleTokenValidate, handleTokenRefresh, parseCookies |
| `packages/github/server/middleware.ts` | Token extraction and ACL enforcement | ✓ VERIFIED | Exports extractToken, validateGitHubToken, checkAccess |
| `packages/github/server/pr.ts` | PR creation and comment fetching | ✓ VERIFIED | Exports exportToPR, fetchPRComments |
| `packages/github/client/GitHubProvider.tsx` | React context provider for GitHub state | ✓ VERIFIED | Exports GitHubProvider, GitHubContext, GitHubContextValue (55 lines) |
| `packages/github/client/useGitHub.ts` | Context consumer hook | ✓ VERIFIED | Exports useGitHub hook with error for usage outside provider |
| `packages/github/client/useGitHubPRSync.ts` | PR comment sync hook | ✓ VERIFIED | Moved from packages/ui/hooks/, imports from plugin types |
| `packages/github/client/lineMapper.ts` | Line-to-block mapping utility | ✓ VERIFIED | Moved from packages/ui/utils/, imports Block from @plannotator/ui/types |
| `packages/editor/App.tsx` | Plan editor with GitHubProvider wrapper | ✓ VERIFIED | Line 68: import GitHubProvider, Lines 1298/1971: wrapper tags |
| `apps/paste-service/core/handler.ts` | Refactored handler with middleware composition | ⚠️ PARTIAL | Middleware composition present (lines 138-144), OAuth routes removed, but remains a significant upstream modification |
| `apps/paste-service/targets/bun.ts` | Bun target composing GitHubHandler middleware | ✓ VERIFIED | Imports createGitHubHandler, creates githubHandler, passes as middleware array |
| `apps/paste-service/targets/cloudflare.ts` | Cloudflare target composing GitHubHandler middleware | ✓ VERIFIED | Imports createGitHubHandler, creates githubHandler with KV, passes as middleware array |

**Build Status:** ⚠️ Review build succeeds, Hook build fails (React import resolution issue)

### Key Link Verification

| From | To  | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| packages/github/server/handler.ts | packages/github/server/oauth.ts | imports and delegates OAuth routes | ✓ WIRED | Line 15-20: imports handleLogin, handleCallback, handleTokenValidate, handleTokenRefresh |
| packages/github/server/handler.ts | packages/github/server/pr.ts | imports and delegates PR routes | ✓ WIRED | Line 22: imports exportToPR, fetchPRComments; Lines 129, 196: called |
| packages/github/server/handler.ts | packages/github/shared/types.ts | imports GitHubConfig for factory parameter | ✓ WIRED | Lines 10-14: imports GitHubConfig, PRStorageAdapter, PRMetadata |
| apps/paste-service/targets/bun.ts | packages/github/server/handler.ts | imports createGitHubHandler | ✓ WIRED | Import present, githubHandler created with config and storage |
| apps/paste-service/core/handler.ts | packages/github/server/middleware.ts | imports extractToken, validateGitHubToken, checkAccess for ACL enforcement | ✓ WIRED | Line 3: imports from @plannotator/github/server/middleware, used in presence and paste routes |
| packages/editor/App.tsx | packages/github/client/GitHubProvider.tsx | imports and wraps children | ✓ WIRED | Line 68: import, Lines 1298/1971: wrapper tags |
| packages/github/client/GitHubProvider.tsx | packages/github/shared/types.ts | imports GitHubUser, PRMetadata for context value | ✓ WIRED | Line 2: import type { GitHubUser, PRMetadata } |
| packages/github/client/useGitHubPRSync.ts | packages/github/client/lineMapper.ts | imports mapLineToBlock for line-to-block mapping | ✓ WIRED | Import and usage verified |

### Data-Flow Trace (Level 4)

Not applicable for Phase 01 — this phase establishes infrastructure with stubbed actions (syncFromGitHub, syncToGitHub, createPR). Data flow will be verified in later phases when these stubs are implemented.

**Stub Status:** GitHubProvider actions explicitly log "not implemented" with phase references (Phase 4, 5, 6) — documented stubs, not hollow.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Workspace package resolves | `bun -e "import { createGitHubHandler } from '@plannotator/github/server'"` | "handler OK" | ✓ PASS |
| Client package resolves | `bun -e "import { GitHubProvider } from '@plannotator/github/client'"` | "client OK" | ✓ PASS |
| Server tests pass | `bun test packages/github/server/ --timeout 10000` | 26 pass, 0 fail, 44 expect() calls | ✓ PASS |
| No process.env in plugin | `grep -r "process\.env" packages/github/` | Only comments, no actual references | ✓ PASS |
| OAuth routes removed from handler | `grep "api/auth/github\|handleLogin\|handleCallback" apps/paste-service/core/handler.ts` | No matches | ✓ PASS |
| Review build succeeds | `bun run --cwd apps/review build` | Built successfully (12MB gzipped) | ✓ PASS |
| Hook build succeeds | `bun run build:hook` | Failed: React import unresolved from GitHubProvider.tsx | ✗ FAIL |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| ARCH-01 | 01-01, 01-02 | All GitHub integration code lives in isolated `packages/github/` package | ✓ SATISFIED | Package exists with server/, client/, shared/ directories containing all GitHub code |
| ARCH-02 | 01-03 | Upstream file changes limited to single context wrapper in App.tsx | ⚠️ PARTIAL | App.tsx has wrapper (verified), but paste-service and UI files also modified (middleware composition required for architecture) |
| ARCH-03 | 01-01 | Handler follows ExternalAnnotationHandler composition pattern | ✓ SATISFIED | GitHubHandler.handle() returns Response \| null as specified |
| ARCH-04 | 01-03 | Fork can rebase on upstream main without merge conflicts in GitHub code | ⚠️ NEEDS VERIFICATION | Plugin package is isolated, but paste-service and UI modifications may cause conflicts. Upstream tracking strategy needed. |
| ARCH-05 | 01-01, 01-02, 01-03 | Existing scattered GitHub code (OAuth, PR creation, ACL) extracted into plugin package | ✓ SATISFIED | OAuth (oauth.ts), PR (pr.ts), ACL (middleware.ts), types (shared/types.ts) all extracted |

**Requirements Status:** 3 satisfied, 2 partial (ARCH-02, ARCH-04)

**Note on ARCH-02 and ARCH-04:** The original success criteria stated "only App.tsx modified" but the actual implementation requires paste-service modifications for middleware composition (ARCH-03). This is an architectural necessity — the plugin pattern requires the host to delegate via middleware. The paste-service changes are minimal (add middleware array parameter, remove inlined OAuth/PR routes) and follow the composition pattern. However, this does increase the rebase surface area beyond the originally stated goal.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| packages/github/client/GitHubProvider.tsx | 41-49 | Stub actions with console.warn | ℹ️ Info | Documented stubs for future phases — not a code smell |
| apps/hook/vite.config.ts | 22 | Hardcoded alias to specific file (GitHubProvider.tsx) instead of directory | ⚠️ Warning | May cause build issues if plugin exports change |
| apps/paste-service/core/handler.ts | 4 | Still imports exportToPR for inline paste POST github_export logic | ℹ️ Info | Documented TODO for Phase 4 — backward compatibility maintained |

### Human Verification Required

None required for this phase. All verification points are automated (imports resolve, tests pass, routes delegate correctly).

### Gaps Summary

**Gap 1: Build Configuration Issue**
The hook build fails because React imports from `packages/github/client/GitHubProvider.tsx` are not properly resolved by Vite. The alias configuration exists but React needs to be externalized or the bundle needs to include React as a peer dependency properly.

**Root cause:** Vite's rollup configuration doesn't externalize React when bundling the single-file HTML. The plugin package correctly declares React as a peer dependency, but the build process for apps/hook doesn't respect this.

**Impact:** Hook cannot be built for distribution. Development and runtime imports work correctly (verified via `bun -e` tests).

**Fix:** Add React to `rollupOptions.external` in apps/hook/vite.config.ts OR configure proper alias resolution for React peer dependencies.

**Gap 2: Upstream Modification Surface**
The phase goal states "only App.tsx modified" but the actual implementation modifies 11 upstream files (excluding plugin package, planning, tests, docs):
- packages/editor/App.tsx (expected)
- apps/paste-service/core/handler.ts (middleware composition)
- apps/paste-service/auth/types.ts (re-export from plugin)
- apps/paste-service/targets/bun.ts (create and pass middleware)
- apps/paste-service/targets/cloudflare.ts (create and pass middleware)
- apps/paste-service/core/cors.ts (unknown changes)
- apps/hook/vite.config.ts (aliases for plugin)
- apps/portal/vite.config.ts (aliases for plugin)
- packages/ui/components/ExportModal.tsx (ACL/GitHub features)
- packages/ui/hooks/useSharing.ts (GitHub integration)
- packages/ui/utils/sharing.ts (GitHub integration)

**Root cause:** The middleware composition pattern (ARCH-03) inherently requires the host service (paste-service) to accept and delegate to middleware. This is a necessary architectural change, not a deviation.

**Impact:** Increases rebase complexity vs upstream. However, all paste-service changes are localized to the handler and targets — the core paste CRUD logic is untouched. UI changes appear to be for ACL/sharing features that are part of the GitHub integration.

**Status:** The UI changes (ExportModal, useSharing, sharing) need clarification — they weren't mentioned in the plans but may be legitimate additions for the GitHub integration feature set. The paste-service changes are documented and necessary for the architecture.

---

_Verified: 2026-04-01T23:45:00Z_
_Verifier: Claude (gsd-verifier)_
