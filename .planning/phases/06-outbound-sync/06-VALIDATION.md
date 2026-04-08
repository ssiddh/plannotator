---
phase: 6
slug: outbound-sync
status: active
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-08
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test (built-in) |
| **Config file** | bunfig.toml (linker: isolated) |
| **Quick run command** | `bun test packages/github/server/outboundSync.test.ts` |
| **Full suite command** | `bun test packages/github/` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test packages/github/server/outboundSync.test.ts`
- **After every plan wave:** Run `bun test packages/github/`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | SYNC-OUT-01 through SYNC-OUT-08 | unit | `bun test packages/github/server/outboundSync.test.ts 2>&1 \| tail -5` | :x: W0 | :white_large_square: pending |
| 06-01-02 | 01 | 1 | SYNC-OUT-01 through SYNC-OUT-08 | unit | `bun test packages/github/server/outboundSync.test.ts` | :x: W0 | :white_large_square: pending |
| 06-02-01 | 02 | 2 | SYNC-OUT-01, SYNC-OUT-02, SYNC-OUT-03, SYNC-OUT-04, SYNC-OUT-07 | unit | `bun test packages/github/server/handler.test.ts` | :white_check_mark: | :white_large_square: pending |
| 06-02-02 | 02 | 2 | SYNC-OUT-01 | build | `bun build packages/github/client/useGitHubOutboundSync.ts --no-bundle 2>&1 \| tail -3` | :x: W0 | :white_large_square: pending |
| 06-03-01 | 03 | 3 | SYNC-OUT-01, SYNC-OUT-04, SYNC-OUT-05, SYNC-OUT-08 | build | `bun build packages/ui/components/ToolbarButtons.tsx --no-bundle 2>&1 \| tail -3` | :white_check_mark: | :white_large_square: pending |
| 06-03-02 | 03 | 3 | SYNC-OUT-01, SYNC-OUT-04, SYNC-OUT-05 | build | `bun build packages/editor/App.tsx --no-bundle --external react --external react-dom 2>&1 \| tail -5` | :white_check_mark: | :white_large_square: pending |
| 06-03-03 | 03 | 3 | SYNC-OUT-01 through SYNC-OUT-08 | manual | User verification checkpoint | N/A | :white_large_square: pending |

*Status: :white_large_square: pending · :white_check_mark: green · :x: red · :warning: flaky*

---

## Wave 0 Requirements

- [ ] `packages/github/server/outboundSync.test.ts` — stubs for SYNC-OUT-01 through SYNC-OUT-05, SYNC-OUT-08 (created by Plan 01 Task 1)
- [ ] Mock KV pattern: reuse `createMockKV()` from `packages/github/server/inboundSync.test.ts`
- [ ] Mock `githubRequest` and `fetchPRComments` for isolated testing
- [ ] Mock `submitBatchReview` to capture args and return review ID for follow-up fetch

*Note: Wave 0 is handled by Plan 01 Task 1 (TDD Red phase creates all test stubs before implementation).*

---

## Requirement Coverage

| Req ID | Description | Covered By |
|--------|-------------|------------|
| SYNC-OUT-01 | Trigger outbound sync endpoint | Plan 01 (test: "trigger"), Plan 02 (handler route), Plan 03 (UI button) |
| SYNC-OUT-02 | New annotations map to correct lines | Plan 01 (test: "line mapping"), Plan 02 (handler passes blocks) |
| SYNC-OUT-03 | Deduplication via KV mapping | Plan 01 (test: "dedup"), Plan 02 (handler wires KV) |
| SYNC-OUT-04 | Drift detection via plan hash | Plan 01 (test: "drift"), Plan 03 (drift warning toast) |
| SYNC-OUT-05 | Drift warning on hash mismatch | Plan 01 (test: "drift warning"), Plan 03 (UI banner) |
| SYNC-OUT-06 | DELETION as suggestion blocks | Plan 01 (reuses mapAnnotationsToComments), existing `export.test.ts` |
| SYNC-OUT-07 | Batch review submission | Plan 01 (reuses submitBatchReview), existing `export.test.ts` |
| SYNC-OUT-08 | Images skipped, text-only | Plan 01 (test: "images"), Plan 03 (warning toast) |

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| OutboundSyncButton appears adjacent to SyncButton with correct icon | SYNC-OUT-01 | Visual layout verification | Build with `bun run build:hook`, run `claude --plugin-dir ./apps/hook`, create plan, check toolbar |
| Badge shows correct unsynced count and updates after sync | SYNC-OUT-01 | Reactive UI behavior | Add annotations, verify badge updates, sync, verify badge resets |
| Toast messages match D-20 copywriting (stats format) | SYNC-OUT-01 | Toast content and timing | Trigger sync, verify toast shows "Synced N annotations" with correct breakdown |
| GitHub PR shows review comments on correct lines | SYNC-OUT-02 | End-to-end with real GitHub API | Create PR, add annotations, sync, check PR on GitHub |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 10s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
