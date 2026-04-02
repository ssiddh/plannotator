/**
 * UI copywriting constants for sync infrastructure.
 * Defined in Phase 3 so downstream phases (5, 6, 7) render consistent copy.
 * Source of truth: 03-UI-SPEC.md Copywriting Contract table.
 */

export const DRIFT_WARNING = {
  heading: "Plan changed since PR creation",
  body: "Line numbers may be incorrect. Annotations might not land on the expected lines.",
  ctaProceed: "Sync anyway",
  ctaCancel: "Don't sync",
} as const;

export const CONFLICT_DIALOG = {
  heading: "Annotation changed in both places",
  body: "This annotation was modified locally and on GitHub since the last sync.",
  ctaKeepLocal: "Keep local",
  ctaKeepRemote: "Keep GitHub",
  ctaCancel: "Don't sync",
} as const;

export const SYNC_EMPTY_STATE = {
  heading: "No sync history",
  body: "Sync annotations with a linked GitHub PR to see history here.",
} as const;

export const SYNC_ERRORS = {
  hashGenerationFailed: "Could not generate annotation ID",
  kvWriteFailed:
    "Sync state could not be saved. Your annotations are safe but sync tracking may be stale.",
} as const;
