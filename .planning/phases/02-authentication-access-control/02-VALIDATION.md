---
phase: 02
slug: authentication-access-control
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-01
---

# Phase 02 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test (built-in) |
| **Config file** | None needed (Bun auto-discovers .test.ts files) |
| **Quick run command** | `bun test packages/github/` |
| **Full suite command** | `bun test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test packages/github/`
- **After every plan wave:** Run `bun test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | AUTH-01, AUTH-03, AUTH-05 | unit + integration | `bun test packages/github/server/auth-page.test.ts` | Yes (created in task) | pending |
| 02-01-02 | 01 | 1 | AUTH-01, AUTH-03 | unit + integration | `bun test packages/github/server/middleware.test.ts` | Partial (extend existing) | pending |
| 02-02-01 | 02 | 1 | AUTH-04, AUTH-02 | unit | `bun test packages/github/server/oauth.test.ts` | Partial (extend existing) | pending |
| 02-02-02 | 02 | 1 | AUTH-02, D-09, D-10 | unit | `bun test packages/github/server/handler.test.ts` | Partial (extend existing) | pending |
| 02-03-01 | 03 | 2 | AUTH-04, AUTH-05 | grep verification | `grep "plannotator_github_token" packages/github/client/GitHubProvider.tsx` | N/A | pending |
| 02-03-02 | 03 | 2 | AUTH-04, AUTH-05 | integration | `bun test packages/github/server/` | Yes | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `packages/github/server/auth-page.test.ts` — tests for HTML auth page generators (AUTH-01, AUTH-05)
- [ ] `packages/github/server/middleware.test.ts` — extend with HTML 401 response tests, team membership mock (AUTH-01, AUTH-03)
- [ ] `packages/github/server/oauth.test.ts` — extend with return_to URL encoding, callback redirect, session cookie tests (AUTH-04)
- [ ] `packages/github/server/handler.test.ts` — extend with PR route token validation + KV caching tests (AUTH-02, D-09, D-10)

*All Wave 0 test stubs are created within their respective plan tasks (TDD approach).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Auth HTML page visual appearance matches UI-SPEC | AUTH-05 | Visual fidelity cannot be verified by string matching alone | Run `bun -e "import { authRequiredHtml } from './packages/github/server/auth-page.ts'; console.log(authRequiredHtml('/login', 'https://example.com'))"`, open output in browser, compare to UI-SPEC |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 5s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-04-01
