/**
 * Outbound sync orchestration: classifies Plannotator annotations as
 * new/edited/skipped, posts new annotations via batch review, posts
 * edited annotations as threaded replies, recovers comment IDs from
 * the review response for KV mapping, and tracks sync state.
 *
 * Created as part of Phase 06, Plan 01 (SYNC-OUT-01 through SYNC-OUT-08).
 */

import type { PRMetadataWithSync, PRComment } from "../shared/types.ts";
import { generatePlanHash } from "../shared/planHash.ts";
import {
  mapAnnotationsToComments,
  submitBatchReview,
  type ExportAnnotation,
  type ExportBlock,
  type ReviewComment,
} from "./export.ts";
import { getCommentId, setMapping } from "./syncMappings.ts";
import { setSyncState } from "./syncState.ts";
import { fetchPRComments, githubRequest } from "./pr.ts";

const KV_TTL = 30 * 24 * 60 * 60; // 30 days in seconds

/** Result returned by performOutboundSync. */
export interface OutboundSyncResult {
  syncedCount: number;   // New annotations posted
  editCount: number;     // Edited annotations posted as replies
  skippedCount: number;  // Already-synced unchanged annotations
  warnings: string[];    // e.g., "N global annotations skipped (no line position)"
  hasDrift: boolean;     // true when plan hash differs from prMetadata.planHash
}

/** Classification of a single annotation for outbound sync. */
interface ClassifiedAnnotation {
  annotation: ExportAnnotation;
  status: "new" | "edited" | "skipped";
  githubCommentId?: string; // For edited annotations: the existing comment ID
}

/**
 * Classify annotations as new, edited, or skipped based on KV state
 * and current GitHub comment bodies.
 */
export async function classifyAnnotations(
  pasteId: string,
  annotations: ExportAnnotation[],
  blocks: ExportBlock[],
  commentBodyMap: Map<string, string>,
  kv: any
): Promise<ClassifiedAnnotation[]> {
  const classified: ClassifiedAnnotation[] = [];

  for (const annotation of annotations) {
    const existingCommentId = await getCommentId(pasteId, annotation.id, kv);

    if (!existingCommentId) {
      // No KV mapping -> new annotation
      classified.push({ annotation, status: "new" });
    } else {
      // KV mapping exists -> check if edited or skipped
      const githubBody = commentBodyMap.get(existingCommentId);

      // Determine expected body for comparison
      let expectedBody: string;
      if (annotation.type === "DELETION") {
        expectedBody = `> ${annotation.originalText}\n\n\`\`\`suggestion\n\n\`\`\``;
      } else {
        expectedBody = annotation.text || "";
      }

      if (githubBody !== undefined && githubBody !== expectedBody) {
        // Text differs -> edited
        classified.push({
          annotation,
          status: "edited",
          githubCommentId: existingCommentId,
        });
      } else {
        // Text matches or comment not found -> skipped
        classified.push({ annotation, status: "skipped" });
      }
    }
  }

  return classified;
}

/**
 * Perform outbound sync: classify annotations, post new ones as batch review,
 * post edits as threaded replies, recover comment IDs, update KV and sync state.
 *
 * All external calls are injectable via options for testing.
 */
export async function performOutboundSync(
  pasteId: string,
  annotations: ExportAnnotation[],
  blocks: ExportBlock[],
  planMarkdown: string,
  prMetadata: PRMetadataWithSync,
  token: string,
  kv: any,
  options?: {
    fetchFn?: typeof fetchPRComments;
    githubRequestFn?: typeof githubRequest;
    submitBatchReviewFn?: typeof submitBatchReview;
    generatePlanHashFn?: typeof generatePlanHash;
  }
): Promise<OutboundSyncResult> {
  const _fetchPRComments = options?.fetchFn || fetchPRComments;
  const _githubRequest = options?.githubRequestFn || githubRequest;
  const _submitBatchReview = options?.submitBatchReviewFn || submitBatchReview;
  const _generatePlanHash = options?.generatePlanHashFn || generatePlanHash;

  const [owner, repoName] = prMetadata.repo.split("/");
  const prNumber = prMetadata.pr_number;
  const warnings: string[] = [];

  // Step 1: Drift detection
  const currentHash = await _generatePlanHash(planMarkdown);
  const hasDrift = currentHash !== prMetadata.planHash;

  // Step 2: Filter GLOBAL_COMMENT annotations
  const globalAnnotations = annotations.filter((a) => a.type === "GLOBAL_COMMENT");
  const lineAnnotations = annotations.filter((a) => a.type !== "GLOBAL_COMMENT");

  if (globalAnnotations.length > 0) {
    warnings.push(
      `${globalAnnotations.length} global annotations skipped (no line position)`
    );
  }

  // Step 2b: Count annotations with images
  const imageAnnotations = lineAnnotations.filter(
    (a) => a.images && a.images.length > 0
  );
  if (imageAnnotations.length > 0) {
    warnings.push(
      `${imageAnnotations.length} annotations with images synced text only`
    );
  }

  // Step 3: Fetch current GitHub comment state for edit detection
  const { comments: ghComments } = await _fetchPRComments(prMetadata, token);

  // Build commentBodyMap: comment ID -> body
  const commentBodyMap = new Map<string, string>();
  for (const comment of ghComments) {
    commentBodyMap.set(comment.id, comment.body);
  }

  // Step 4: Classify annotations
  const classified = await classifyAnnotations(
    pasteId,
    lineAnnotations,
    blocks,
    commentBodyMap,
    kv
  );

  const newAnnotations = classified
    .filter((c) => c.status === "new")
    .map((c) => c.annotation);
  const editedAnnotations = classified.filter((c) => c.status === "edited");
  const skippedCount = classified.filter((c) => c.status === "skipped").length;

  // Step 5: Post new annotations via batch review
  if (newAnnotations.length > 0) {
    const filePath = `plans/${pasteId}.md`;
    const comments = mapAnnotationsToComments(newAnnotations, blocks, filePath);

    if (comments.length > 0) {
      const reviewResponse = await _submitBatchReview(
        owner,
        repoName,
        prNumber,
        token,
        comments,
        "Annotations synced from Plannotator"
      );

      // Step 6: Recover comment IDs from the review response
      if (reviewResponse?.id) {
        const reviewId = reviewResponse.id;
        const reviewComments = await _githubRequest(
          `GET /repos/${owner}/${repoName}/pulls/${prNumber}/reviews/${reviewId}/comments`,
          token
        );

        if (Array.isArray(reviewComments)) {
          // Match returned comments to submitted annotations by (path, line, body) or positional order
          for (let i = 0; i < Math.min(newAnnotations.length, reviewComments.length); i++) {
            const responseComment = reviewComments[i];
            await setMapping(
              pasteId,
              newAnnotations[i].id,
              String(responseComment.id),
              kv,
              KV_TTL
            );
          }
        }
      }
    }
  }

  // Step 7: Post edit replies
  let editCount = 0;
  for (const edited of editedAnnotations) {
    const githubCommentId = edited.githubCommentId!;
    // Strip "review_" prefix to get numeric ID
    const numericId = githubCommentId.replace(/^review_/, "");

    let replyBody: string;
    if (edited.annotation.type === "DELETION") {
      replyBody = `Updated: > ${edited.annotation.originalText}\n\n\`\`\`suggestion\n\n\`\`\``;
    } else {
      replyBody = `Updated: ${edited.annotation.text}`;
    }

    await _githubRequest(
      `POST /repos/${owner}/${repoName}/pulls/${prNumber}/comments/${numericId}/replies`,
      token,
      { body: replyBody }
    );
    editCount++;
  }

  // Step 8: Update sync state
  await setSyncState(pasteId, Date.now(), "outbound", kv, KV_TTL);

  return {
    syncedCount: newAnnotations.length,
    editCount,
    skippedCount,
    warnings,
    hasDrift,
  };
}
