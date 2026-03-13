// --- Agent-Produced Checklist ---

export interface ChecklistItem {
  /** Category-prefixed ID, e.g. "func-1", "sec-2" */
  id: string;
  /** Free-form category label, e.g. "visual", "security", "api-contract" */
  category: string;
  /** Imperative verb phrase: "Verify that..." */
  check: string;
  /** Markdown narrative: what changed, what could go wrong, expected behavior */
  description: string;
  /** Ordered instructions for conducting the verification */
  steps: string[];
  /** Why manual verification is needed (not automatable) */
  reason: string;
  /** Related file paths from the diff */
  files?: string[];
  /** Maps file path → number of diff hunks this item covers.
   *  Paths must be keys in Checklist.fileDiffs.
   *  Multiple items can cover the same hunks (many-to-many). */
  diffMap?: Record<string, number>;
  /** True if failure means data loss, security breach, or broken deploy */
  critical?: boolean;
}

/** Pull/merge request reference for linking checklist to a PR */
export interface ChecklistPR {
  /** PR/MR number */
  number: number;
  /** Full URL to the PR/MR */
  url: string;
  /** PR/MR title */
  title?: string;
  /** Source branch name */
  branch?: string;
  /** Git hosting provider */
  provider: "github" | "gitlab" | "azure-devops";
}

export interface Checklist {
  /** Short title for the checklist */
  title: string;
  /** One paragraph: what changed and why manual verification matters */
  summary: string;
  /** The verification items */
  items: ChecklistItem[];
  /** Optional associated pull/merge request */
  pr?: ChecklistPR;
  /** Total diff hunks per file path (relative to repo root).
   *  Presence of this field enables the coverage toggle view. */
  fileDiffs?: Record<string, number>;
}

// --- Developer Response ---

export type ChecklistItemStatus = "passed" | "failed" | "skipped" | "pending";

export interface ChecklistItemResult {
  /** Matches the original item ID */
  id: string;
  status: ChecklistItemStatus;
  /** Developer notes (failure details, skip reason, questions) */
  notes?: string[];
  /** Screenshot evidence */
  images?: { path: string; name: string }[];
}

export type ChecklistViewMode = 'checklist' | 'coverage';

export interface ChecklistSubmission {
  results: ChecklistItemResult[];
  /** Overall notes from the developer */
  globalNotes?: string[];
  /** Automation flags selected by the developer */
  automations?: {
    postToPR?: boolean;
    approveIfAllPass?: boolean;
  };
}
