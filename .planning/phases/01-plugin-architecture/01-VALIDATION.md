---
phase: 01
slug: plugin-architecture
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-01
---

# Phase 01 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Bun test 1.3.11 |
| **Config file** | None (Bun test uses convention -- `*.test.ts` files) |
| **Quick run command** | `bun test packages/github/` |
| **Full suite command** | `bun test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test packages/github/`
- **After every plan wave:** Run `bun test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | ARCH-01 | import check | `bun -e "import '@plannotator/github/types'"` | N/A | pending |
| 01-01-02 | 01 | 1 | ARCH-03, ARCH-05 | import check | `bun -e "import { createGitHubHandler } from '@plannotator/github/server'"` | N/A | pending |
| 01-01-03 | 01 | 1 | ARCH-01, ARCH-03 | unit | `bun test packages/github/server/handler.test.ts --timeout 10000` | W0 | pending |
| 01-01-03 | 01 | 1 | ARCH-05 | unit | `bun test packages/github/server/middleware.test.ts --timeout 10000` | W0 | pending |
| 01-02-01 | 02 | 2 | ARCH-04, ARCH-05 | import check | `bun -e "import { handleRequest } from './apps/paste-service/core/handler.ts'"` | N/A | pending |
| 01-02-02 | 02 | 2 | ARCH-04 | import check | `bun -e "import './apps/paste-service/targets/bun.ts'"` | N/A | pending |
| 01-03-01 | 03 | 2 | ARCH-02 | import check | `bun -e "import { GitHubProvider } from '@plannotator/github/client'"` | N/A | pending |
| 01-03-02 | 03 | 2 | ARCH-02, ARCH-05 | grep + import | `grep -c "GitHubProvider" packages/editor/App.tsx` | N/A | pending |

*Status: pending -- green -- red -- flaky*

---

## Wave 0 Requirements

- [ ] `packages/github/server/handler.test.ts` -- stubs for ARCH-01, ARCH-03: GitHubHandler returns Response for known routes, null for unknown
- [ ] `packages/github/server/oauth.test.ts` -- stubs for ARCH-05: OAuth login redirect generates correct URL, callback exchanges token
- [ ] `packages/github/server/middleware.test.ts` -- stubs for ARCH-05: extractToken parses Bearer header, checkAccess enforces ACL
- [ ] `packages/github/server/pr.test.ts` -- stubs for ARCH-05: exportToPR constructs correct API calls, fetchPRComments parses responses
- [ ] `packages/github/client/lineMapper.test.ts` -- can copy from existing packages/ui/utils/ if tests exist there

*Wave 0 files are created by Plan 01, Task 3 (handler.test.ts, middleware.test.ts). Remaining test files (oauth.test.ts, pr.test.ts, lineMapper.test.ts) are deferred to later phases as their modules are extracted verbatim and tested via import checks.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| App.tsx only adds GitHubProvider wrapper (3-line diff) | ARCH-02 | Diff inspection against allowlist | `git diff main --name-only \| grep -v packages/github \| grep -v App.tsx` -- should be empty |
| No upstream merge conflicts | ARCH-04 | Requires git merge simulation | `git diff main --name-only \| grep -v packages/github \| grep -v App.tsx` -- only App.tsx or nothing |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 10s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
