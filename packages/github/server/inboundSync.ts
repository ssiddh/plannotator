/**
 * Inbound sync orchestration: fetches PR comments from GitHub,
 * deduplicates via KV mapping, detects edits and deletions,
 * and returns categorized results.
 *
 * Created as part of Phase 05, Plan 01 (SYNC-IN-02 through SYNC-IN-09).
 */

import type {
  PRMetadata,
  PRComment,
  InboundSyncResponse,
  PRCommentForClient,
} from "../shared/types.ts";
import { fetchPRComments } from "./pr.ts";
import {
  getAnnotationId,
  setMapping,
  deleteMapping,
} from "./syncMappings.ts";
import { setSyncState } from "./syncState.ts";

const KV_TTL = 30 * 24 * 60 * 60; // 30 days in seconds

/**
 * Convert a PRComment to a PRCommentForClient.
 */
function toClientComment(
  comment: PRComment,
  annotationId: string
): PRCommentForClient {
  let originalText: string;
  if (comment.comment_type === "issue") {
    originalText = "[General comment]";
  } else if (comment.line) {
    originalText = `[Line ${comment.line}]`;
  } else {
    originalText = "[Line unmapped]";
  }

  return {
    id: annotationId,
    githubCommentId: comment.id,
    blockId: "", // Client does line mapping
    type: comment.comment_type === "issue" ? "GLOBAL_COMMENT" : "COMMENT",
    text: comment.body,
    originalText,
    author: comment.author.username,
    avatarUrl: comment.author.avatar,
    githubCommentUrl: comment.github_url,
    createdAt: comment.created_at,
    updatedAt: comment.updated_at,
    inReplyToId: comment.in_reply_to_id || null,
    commentType: comment.comment_type,
    line: comment.line || null,
  };
}

/**
 * Perform inbound sync: fetch all PR comments from GitHub,
 * deduplicate via KV mapping, detect edits and deletions.
 *
 * @param fetchFn - Optional override for fetchPRComments (for testing)
 */
export async function performInboundSync(
  pasteId: string,
  prMetadata: PRMetadata,
  token: string,
  kv: any,
  options?: { since?: string },
  fetchFn?: typeof fetchPRComments
): Promise<InboundSyncResponse> {
  // Pitfall 5: In-memory deduplication guard against KV eventual consistency
  const processedCommentIds = new Set<string>();

  const _fetchPRComments = fetchFn || fetchPRComments;

  // Step 1: Fetch all comments
  const { comments } = await _fetchPRComments(prMetadata, token, {
    since: options?.since,
  });

  // Step 2: Load previously imported comment IDs for deletion detection
  const importedListKey = `sync:${pasteId}:imported`;
  const importedListRaw = await kv.get(importedListKey);
  const previouslyImported: string[] = importedListRaw
    ? JSON.parse(importedListRaw)
    : [];

  // Build a set of currently fetched comment IDs
  const fetchedCommentIds = new Set(comments.map((c) => c.id));

  // Step 3: Process each comment
  const annotations: PRCommentForClient[] = [];
  const stats = { total: comments.length, new: 0, updated: 0, deleted: 0, skipped: 0 };

  for (const comment of comments) {
    const existingAnnotationId = await getAnnotationId(pasteId, comment.id, kv);
    const alreadyProcessed = processedCommentIds.has(comment.id);

    if (existingAnnotationId) {
      // Comment was previously imported - check for edits
      // We store the updated_at timestamp alongside the mapping
      const storedTimestampKey = `sync:${pasteId}:ts:${comment.id}`;
      const storedTimestamp = await kv.get(storedTimestampKey);

      if (storedTimestamp && comment.updated_at > storedTimestamp) {
        // Edit detected
        stats.updated++;
        annotations.push(toClientComment(comment, existingAnnotationId));
        // Update stored timestamp
        await kv.put(storedTimestampKey, comment.updated_at, {
          expirationTtl: KV_TTL,
        });
      } else {
        stats.skipped++;
      }
    } else if (!alreadyProcessed) {
      // New comment
      const annotationId = `gh-${comment.id}`;
      await setMapping(pasteId, annotationId, comment.id, kv, KV_TTL);
      processedCommentIds.add(comment.id);

      // Store timestamp for future edit detection
      const storedTimestampKey = `sync:${pasteId}:ts:${comment.id}`;
      await kv.put(storedTimestampKey, comment.updated_at, {
        expirationTtl: KV_TTL,
      });

      stats.new++;
      annotations.push(toClientComment(comment, annotationId));
    } else {
      // Duplicate within same sync batch (Pitfall 5)
      stats.skipped++;
    }
  }

  // Step 4: Detect deletions
  const deletedIds: string[] = [];
  for (const prevCommentId of previouslyImported) {
    if (!fetchedCommentIds.has(prevCommentId)) {
      const annotationId = await getAnnotationId(pasteId, prevCommentId, kv);
      if (annotationId) {
        deletedIds.push(annotationId);
        await deleteMapping(pasteId, annotationId, prevCommentId, kv);
        stats.deleted++;
      }
    }
  }

  // Step 5: Update imported list with current comment IDs
  const allImportedIds = [
    ...new Set([
      ...previouslyImported.filter((id) => fetchedCommentIds.has(id)),
      ...Array.from(processedCommentIds),
    ]),
  ];
  await kv.put(importedListKey, JSON.stringify(allImportedIds), {
    expirationTtl: KV_TTL,
  });

  // Step 6: Update sync state
  const syncTimestamp = Date.now();
  await setSyncState(pasteId, syncTimestamp, "inbound", kv, KV_TTL);

  return {
    annotations,
    deletedIds,
    stats,
    syncTimestamp,
  };
}
