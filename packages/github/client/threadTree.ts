/**
 * Thread tree building for GitHub PR comments.
 *
 * Converts flat PRCommentForClient[] from the server into nested Annotation[]
 * trees suitable for display in the annotation panel.
 */

import type { Annotation, Block } from "../../ui/types.ts";
import { AnnotationType } from "../../ui/types.ts";
import { mapLineToBlock } from "./lineMapper.ts";
import type { PRCommentForClient } from "../shared/types.ts";

const MAX_THREAD_DEPTH = 3;

/**
 * Build a thread tree from flat server comments.
 *
 * 1. Convert each PRCommentForClient to an Annotation (Map keyed by githubCommentId).
 * 2. Group by inReplyToId: children attach to parent, orphans become roots.
 * 3. Sort children chronologically (createdA ascending).
 * 4. Clamp depth to MAX_THREAD_DEPTH.
 */
export function buildThreadTree(
  comments: PRCommentForClient[],
  blocks: Block[]
): Annotation[] {
  // First pass: convert to Annotations, keyed by githubCommentId (deduplicates Pitfall 5)
  const annotationMap = new Map<string, Annotation>();
  const commentIdToGithubId = new Map<string, string>(); // annotation.id -> githubCommentId

  for (const comment of comments) {
    // Determine blockId via line mapping
    let blockId: string;
    if (comment.line !== null) {
      const mapped = mapLineToBlock(comment.line, blocks);
      blockId = mapped ?? "global";
    } else {
      blockId = "global";
    }

    const annotation: Annotation = {
      id: comment.id,
      blockId,
      startOffset: 0,
      endOffset: 0,
      type:
        comment.commentType === "issue"
          ? AnnotationType.GLOBAL_COMMENT
          : AnnotationType.COMMENT,
      text: comment.text,
      originalText: comment.originalText,
      createdA: new Date(comment.createdAt).getTime(),
      author: comment.author,
      source: "github-pr",
      images: [
        {
          path: comment.avatarUrl,
          name: `github-avatar-${comment.author}`,
        },
      ],
      githubCommentUrl: comment.githubCommentUrl,
      startMeta: { parentTagName: "span", parentIndex: 0, textOffset: 0 },
      endMeta: { parentTagName: "span", parentIndex: 0, textOffset: 0 },
    };

    // Map keyed by githubCommentId naturally deduplicates (Pitfall 5)
    annotationMap.set(comment.githubCommentId, annotation);
    commentIdToGithubId.set(comment.id, comment.githubCommentId);
  }

  // Build lookup: githubCommentId -> inReplyToId
  const replyToMap = new Map<string, string | null>();
  for (const comment of comments) {
    replyToMap.set(comment.githubCommentId, comment.inReplyToId);
  }

  // Second pass: group children under parents
  const roots: Annotation[] = [];

  for (const [githubCommentId, annotation] of annotationMap) {
    const inReplyToId = replyToMap.get(githubCommentId);

    if (inReplyToId === null || inReplyToId === undefined) {
      // Root annotation
      roots.push(annotation);
    } else {
      // Find parent by inReplyToId (which is a githubCommentId)
      const parent = annotationMap.get(inReplyToId);
      if (parent) {
        if (!parent.children) {
          parent.children = [];
        }
        parent.children.push(annotation);
      } else {
        // Orphaned reply -- treat as root
        roots.push(annotation);
      }
    }
  }

  // Sort children chronologically (SYNC-IN-06)
  function sortChildren(annotation: Annotation, depth: number): void {
    if (!annotation.children || annotation.children.length === 0) return;

    annotation.children.sort((a, b) => a.createdA - b.createdA);

    // Clamp depth: flatten children beyond MAX_THREAD_DEPTH
    if (depth >= MAX_THREAD_DEPTH) {
      // Move grandchildren to current level
      const flattened: Annotation[] = [];
      for (const child of annotation.children) {
        flattened.push(child);
        if (child.children) {
          flattened.push(...child.children);
          child.children = undefined;
        }
      }
      annotation.children = flattened;
      annotation.children.sort((a, b) => a.createdA - b.createdA);
    } else {
      for (const child of annotation.children) {
        sortChildren(child, depth + 1);
      }
    }
  }

  for (const root of roots) {
    sortChildren(root, 1);
  }

  return roots;
}

/**
 * Format an ISO 8601 timestamp to a human-readable string.
 * Uses Intl.DateTimeFormat for locale-aware formatting (D-11).
 *
 * Example output: "Apr 3, 2:30 PM"
 */
export function formatGitHubTimestamp(isoString: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(isoString));
}
