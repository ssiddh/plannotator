---
phase: 04
slug: pr-creation-export
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-02
---

# Phase 04 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test (built-in) |
| **Config file** | none (Bun's built-in test runner) |
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
| 04-00-01 | 00 | 0 | PR-02, PR-03, PR-04, PR-05 | scaffold | `bun test packages/github/server/export.test.ts` | Created by 04-00 | ⬜ pending |
| 04-01-01 | 01 | 1 | PR-02, PR-03, PR-04, PR-05 | unit | `bun test packages/github/server/export.test.ts` | ✅ (via 04-00) | ⬜ pending |
| 04-01-02 | 01 | 1 | PR-01, PR-06 | unit | `bun test packages/github/server/handler.test.ts` | ✅ (extend) | ⬜ pending |
| 04-02-01 | 02 | 1 | PR-02 | integration | Manual verify (client hook state) | N/A | ⬜ pending |
| 04-02-02 | 02 | 1 | PR-06 | integration | Manual verify (metadata hydration) | N/A | ⬜ pending |
| 04-03-01 | 03 | 2 | PR-02 | integration | Manual verify (GitHub PR tab) | N/A | ⬜ pending |
| 04-03-02 | 03 | 2 | PR-03, PR-06 | integration | Manual verify (toast, drift warning) | N/A | ⬜ pending |
| 04-03-03 | 03 | 2 | PR-04, PR-05 | e2e | Human checkpoint (create PR, verify batch) | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements (addressed by Plan 04-00)

- [ ] `packages/github/server/export.test.ts` — unit tests for PR-02 (annotations as comments), PR-03 (line mapping), PR-04 (batch review), PR-05 (suggestion blocks)
- [ ] Extend `packages/github/server/handler.test.ts` — unit tests for PR-06 (metadata storage via /api/pr/create)
- [ ] `packages/github/shared/planHash.test.ts` — unit tests for plan hash generation (drift detection)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| GitHub PR tab appears in modal | PR-02 | UI integration | Open ExportModal, verify "GitHub PR" tab exists |
| Success toast with "View PR" action | PR-03 | UI integration | Click export, verify toast appears with link |
| Drift warning banner | PR-06 | UI integration | Modify plan, re-export, verify warning appears |
| Batch review creates 1 notification | PR-04 | GitHub API behavior | Check GitHub notifications after export |
| Suggestion blocks render correctly | PR-05 | GitHub PR UI | View created PR comments, verify suggestion format |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
