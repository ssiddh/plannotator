---
phase: 03
slug: data-model-sync-infrastructure
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-02
---

# Phase 03 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test (built-in) |
| **Config file** | none (Bun auto-discovers `*.test.ts` files) |
| **Quick run command** | `bun test packages/github/shared/ packages/github/server/syncMappings.test.ts packages/github/server/syncState.test.ts` |
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
| 03-01-01 | 01 | 1 | DATA-01 | unit | `bun test packages/github/shared/stableId.test.ts` | ❌ W0 | ⬜ pending |
| 03-01-02 | 01 | 1 | DATA-03, DATA-08, DATA-09, DATA-12 | auto | `bun run build:hook` (types check) | ✅ | ⬜ pending |
| 03-02-01 | 02 | 1 | DATA-02 | unit | `bun test packages/github/server/syncMappings.test.ts` | ❌ W0 | ⬜ pending |
| 03-02-02 | 02 | 1 | DATA-04, DATA-05 | unit | `bun test packages/github/server/syncState.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/github/shared/stableId.test.ts` — covers DATA-01 (deterministic output, collision resolution, async behavior)
- [ ] `packages/github/server/syncMappings.test.ts` — covers DATA-02 (set/get both directions, missing mapping returns null)
- [ ] `packages/github/server/syncState.test.ts` — covers DATA-04, DATA-05 (state persistence, conflict detection logic)
- [ ] Mock KV helper — in-memory Map implementing `get/put` with optional TTL for test isolation

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (4 test files created in Wave 0)
- [x] No watch-mode flags
- [x] Feedback latency < 5s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-04-02
