/**
 * PR export with annotations: batch review submission, annotation-to-comment mapping.
 *
 * Created as part of Phase 04 (PR Creation & Export).
 * Orchestrates: exportToPR (branch+commit+PR) -> submitBatchReview (annotations) -> KV persistence.
 */

import type { PRMetadataWithSync, GitHubConfig } from "../shared/types.ts";

/** A single line-level review comment for the GitHub Reviews API. */
export interface ReviewComment {
  path: string;
  line: number;
  side: "RIGHT";
  body: string;
}

/** Annotation shape expected by export functions (subset of UI Annotation type). */
export interface ExportAnnotation {
  id: string;
  blockId: string;
  type: "DELETION" | "COMMENT" | "GLOBAL_COMMENT";
  text?: string;
  originalText: string;
  images?: Array<{ path: string; name: string }>;
}

/** Block shape expected by export functions (subset of UI Block type). */
export interface ExportBlock {
  id: string;
  startLine: number;
}

/**
 * Map Plannotator annotations to GitHub review comments.
 *
 * - COMMENT: text becomes comment body
 * - DELETION: produces a suggestion block (D-06)
 * - GLOBAL_COMMENT: filtered out (goes to review body, not line comments)
 * - Images are skipped (D-07: text-only export)
 * - Each annotation becomes its own comment (D-08)
 * - Uses block.startLine directly for line mapping (D-13/D-14)
 */
export function mapAnnotationsToComments(
  annotations: ExportAnnotation[],
  blocks: ExportBlock[],
  filePath: string
): ReviewComment[] {
  const comments: ReviewComment[] = [];

  for (const annotation of annotations) {
    if (annotation.type === "GLOBAL_COMMENT") {
      continue;
    }

    const block = blocks.find((b) => b.id === annotation.blockId);
    const line = block ? block.startLine : 1;

    let body: string;
    if (annotation.type === "DELETION") {
      body = `> ${annotation.originalText}\n\n\`\`\`suggestion\n\n\`\`\``;
    } else {
      body = annotation.text || "";
    }

    comments.push({
      path: filePath,
      line,
      side: "RIGHT",
      body,
    });
  }

  return comments;
}
