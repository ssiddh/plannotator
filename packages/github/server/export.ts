/**
 * PR export with annotations: batch review submission, annotation-to-comment mapping.
 *
 * Created as part of Phase 04 (PR Creation & Export).
 * Orchestrates: exportToPR (branch+commit+PR) -> submitBatchReview (annotations) -> KV persistence.
 */

import type { PRMetadataWithSync, GitHubConfig } from "../shared/types.ts";
import { generatePlanHash } from "../shared/planHash.ts";
import { exportToPR, githubRequest } from "./pr.ts";
import { setMapping } from "./syncMappings.ts";
import { setSyncState } from "./syncState.ts";

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

/**
 * Submit a batch review on a GitHub PR.
 * Per D-05: POST /repos/{owner}/{repo}/pulls/{pr_number}/reviews
 *
 * When comments array is empty, submits review with just the body (no comments field).
 */
export async function submitBatchReview(
  owner: string,
  repo: string,
  prNumber: number,
  token: string,
  comments: ReviewComment[],
  reviewBody?: string
): Promise<any> {
  const body: Record<string, any> = {
    body: reviewBody || "Plan review exported from Plannotator",
    event: "COMMENT",
  };

  if (comments.length > 0) {
    body.comments = comments;
  }

  return githubRequest(
    `POST /repos/${owner}/${repo}/pulls/${prNumber}/reviews`,
    token,
    body
  );
}

const DEFAULT_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

/**
 * Full export flow: create PR with annotations as batch review comments.
 *
 * Orchestrates:
 * 1. exportToPR (branch + commit + PR)
 * 2. mapAnnotationsToComments + submitBatchReview
 * 3. KV persistence (metadata, sync state, annotation-comment mappings)
 *
 * Rolls back created branch on failure (D-17).
 * Retry logic is NOT here -- it lives in the client hook (D-18/D-20).
 */
export async function exportPlanWithAnnotations(
  pasteId: string,
  planMarkdown: string,
  annotations: ExportAnnotation[],
  blocks: ExportBlock[],
  token: string,
  config: Pick<GitHubConfig, "defaultRepo" | "prBaseBranch">,
  kv: any,
  ttlSeconds?: number
): Promise<PRMetadataWithSync> {
  const ttl = ttlSeconds || DEFAULT_TTL_SECONDS;
  const repo = config.defaultRepo;
  if (!repo) {
    throw new Error("No default repository configured");
  }

  const [owner, repoName] = repo.split("/");
  if (!owner || !repoName) {
    throw new Error("Invalid repository format. Expected: owner/repo");
  }

  const branchName = `plan/${pasteId}`;
  const createdResources: Array<{ type: string; ref: string }> = [];

  try {
    // Step 1: Create branch + commit + PR
    const prMetadata = await exportToPR(pasteId, planMarkdown, token, config);
    createdResources.push({ type: "branch", ref: branchName });

    // Step 2: Map annotations to review comments
    const filePath = `plans/${pasteId}.md`;
    const lineComments = mapAnnotationsToComments(annotations, blocks, filePath);

    // Collect GLOBAL_COMMENT text for review body
    const globalComments = annotations
      .filter((a) => a.type === "GLOBAL_COMMENT")
      .map((a) => a.text || "")
      .filter(Boolean);

    const globalBody = globalComments.length > 0
      ? globalComments.join("\n\n")
      : undefined;

    // Step 3: Submit batch review (if any annotations exist)
    let reviewResponse: any = null;
    if (lineComments.length > 0 || globalBody) {
      reviewResponse = await submitBatchReview(
        owner,
        repoName,
        prMetadata.pr_number,
        token,
        lineComments,
        globalBody
      );
    }

    // Step 4: Generate plan hash and build extended metadata
    const planHash = await generatePlanHash(planMarkdown);
    const metadataWithSync: PRMetadataWithSync = {
      ...prMetadata,
      planHash,
    };

    // Step 5: Store to KV (D-09 key pattern)
    await kv.put(
      `sync:${pasteId}:pr`,
      JSON.stringify(metadataWithSync),
      { expirationTtl: ttl }
    );

    // Step 6: Store sync state
    await setSyncState(pasteId, Date.now(), "outbound", kv, ttl);

    // Step 7: Store annotation-comment mappings (if review was submitted with comments)
    if (reviewResponse?.comments && Array.isArray(reviewResponse.comments)) {
      const responseComments = reviewResponse.comments as Array<{ id: number }>;
      // Map each submitted line comment to its response comment ID
      for (let i = 0; i < Math.min(lineComments.length, responseComments.length); i++) {
        // Find the annotation that produced this line comment
        const lineAnnotations = annotations.filter((a) => a.type !== "GLOBAL_COMMENT");
        if (lineAnnotations[i]) {
          await setMapping(
            pasteId,
            lineAnnotations[i].id,
            String(responseComments[i].id),
            kv,
            ttl
          );
        }
      }
    }

    return metadataWithSync;
  } catch (error) {
    // Rollback: delete created branches in reverse order (D-17, pitfall 4: use plural refs)
    for (const resource of createdResources.reverse()) {
      if (resource.type === "branch") {
        await githubRequest(
          `DELETE /repos/${owner}/${repoName}/git/refs/heads/${resource.ref}`,
          token
        ).catch(() => {});
      }
    }
    throw error;
  }
}
