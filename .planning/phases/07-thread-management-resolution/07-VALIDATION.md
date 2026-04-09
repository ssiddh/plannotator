---
phase: 7
slug: thread-management-resolution
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-08
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test (built-in) |
| **Config file** | bunfig.toml (existing) |
| **Quick run command** | `bun test packages/github/server/{file}.test.ts` |
| **Full suite command** | `bun test packages/github/server/` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test packages/github/server/{modified}.test.ts`
- **After every plan wave:** Run `bun test packages/github/server/`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 07-01-01 | 01 | 1 | THREAD-04, THREAD-05, THREAD-07 | unit | `bun test packages/github/server/graphql.test.ts` | ❌ W0 (created in task) | ⬜ pending |
| 07-01-02 | 01 | 1 | THREAD-05 | unit | `bun test packages/github/server/export.test.ts` | ✅ (extend existing) | ⬜ pending |
| 07-02-01 | 02 | 2 | THREAD-01, THREAD-02 | file-check | `grep -l "useSummaryAnnotation\|SummaryModal\|ThreadPickerModal" packages/ui/hooks/*.ts packages/ui/components/*.tsx` | ❌ W0 (created in task) | ⬜ pending |
| 07-02-02 | 02 | 2 | THREAD-01, THREAD-02, THREAD-07 | grep-check | `grep -c "Summarize\|isResolved\|isSummary\|Show resolved" packages/ui/components/AnnotationPanel.tsx` | ✅ | ⬜ pending |
| 07-03-01 | 03 | 2 | THREAD-05 | grep-check | `grep -c "submitReview\|ReviewEvent\|ReviewState" packages/ui/hooks/useReview.ts` | ❌ W0 (created in task) | ⬜ pending |
| 07-03-02 | 03 | 2 | THREAD-05, THREAD-06 | grep-check | `grep -c "Review\|APPROVE\|REQUEST_CHANGES\|useReview" packages/ui/components/ExportModal.tsx` | ✅ | ⬜ pending |
| 07-04-01 | 04 | 3 | THREAD-03, THREAD-04, THREAD-06 | unit | `bun test packages/github/server/outboundSync.test.ts` | ✅ (extend existing) | ⬜ pending |
| 07-04-02 | 04 | 3 | THREAD-07 | grep-check | `grep -c "fetchReviewThreads\|isResolved\|threadStatusMap" packages/github/server/inboundSync.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending / ✅ green / ❌ red / ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. Test files that don't yet exist (graphql.test.ts, useReview.ts, etc.) are created as part of their respective tasks, not in a separate Wave 0 step.

- `packages/github/server/graphql.test.ts` — created in 07-01-01
- `packages/github/server/export.test.ts` — exists, extended in 07-01-02
- `packages/github/server/outboundSync.test.ts` — exists, extended in 07-04-01

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Summary modal UI renders correctly | THREAD-01 | Visual layout | Open plan with threads, click Summarize, verify modal styling |
| Resolved badge displays with 70% opacity | THREAD-07 | Visual styling | Sync from GitHub with resolved thread, verify badge and dimming |
| Thread nav scrolls smoothly | THREAD-02 | Animation/scroll | Click Next/Prev thread buttons, verify smooth scroll and highlight |
| Review tab buttons match GitHub colors | THREAD-05 | Visual consistency | Open ExportModal > Review tab, verify Approve=green, Request Changes=red |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or create tests inline
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (test files created in-task)
- [x] No watch-mode flags
- [x] Feedback latency < 10s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
