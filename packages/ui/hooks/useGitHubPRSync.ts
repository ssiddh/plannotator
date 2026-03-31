/**
 * GitHub PR comment synchronization hook.
 *
 * Polls for PR review comments and converts them to annotations for display.
 */

import { useState, useEffect, useCallback } from "react";
import type { Annotation, Block } from "../types";
import { mapLineToBlock } from "../utils/lineMapper";

interface PRMetadata {
  repo: string;
  pr_number: number;
  pr_url: string;
  created_at: string;
}

interface PRComment {
  id: string;
  author: {
    username: string;
    avatar: string;
  };
  body: string;
  line?: number;
  path?: string;
  created_at: string;
  github_url: string;
  comment_type: "review" | "issue";
}

interface UseGitHubPRSyncOptions {
  pasteId: string;
  prMetadata: PRMetadata | null;
  blocks: Block[];
  token: string | null;
  pasteServiceUrl?: string;
  pollInterval?: number; // milliseconds, default 5000
  enabled?: boolean; // default true
}

interface UseGitHubPRSyncResult {
  annotations: Annotation[];
  isLoading: boolean;
  error: string | null;
  lastSync: Date | null;
  refresh: () => void;
}

/**
 * Hook to sync GitHub PR comments as annotations.
 *
 * Polls the paste service for PR comments at a regular interval,
 * converts them to Annotation objects, and maps line numbers to blocks.
 */
export function useGitHubPRSync({
  pasteId,
  prMetadata,
  blocks,
  token,
  pasteServiceUrl = "http://localhost:19433",
  pollInterval = 5000,
  enabled = true,
}: UseGitHubPRSyncOptions): UseGitHubPRSyncResult {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  const fetchComments = useCallback(async () => {
    if (!prMetadata || !token || !enabled) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${pasteServiceUrl}/api/pr/${pasteId}/comments`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch PR comments: ${response.status}`);
      }

      const comments: PRComment[] = await response.json();

      // Convert PR comments to Annotations
      const newAnnotations: Annotation[] = comments.map((comment) => {
        // Map line number to block ID if available
        const blockId = comment.line
          ? mapLineToBlock(comment.line, blocks) || "global"
          : "global";

        // Generate annotation ID from GitHub comment ID
        const annotationId = `github-pr-${comment.id}`;

        return {
          id: annotationId,
          blockId,
          startOffset: 0,
          endOffset: 0,
          type: "COMMENT" as const,
          text: comment.body,
          originalText: comment.line
            ? `[Line ${comment.line}]`
            : "[General comment]",
          createdA: new Date(comment.created_at).getTime(),
          author: comment.author.username,
          source: "github-pr",
          // Store GitHub metadata for UI display
          images: [
            {
              path: comment.author.avatar,
              name: `github-avatar-${comment.author.username}`,
            },
          ],
          // Store GitHub URL and comment type as data attributes
          // (will be used in AnnotationPanel for linking)
          startMeta: {
            parentTagName: "span",
            parentIndex: 0,
            textOffset: 0,
          },
          endMeta: {
            parentTagName: "span",
            parentIndex: 0,
            textOffset: 0,
          },
        };
      });

      setAnnotations(newAnnotations);
      setLastSync(new Date());
    } catch (err) {
      console.error("Failed to sync PR comments:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }, [pasteId, prMetadata, blocks, token, pasteServiceUrl, enabled]);

  // Initial fetch
  useEffect(() => {
    if (enabled && prMetadata && token) {
      fetchComments();
    }
  }, [enabled, prMetadata, token]); // Only fetch on mount or when these change

  // Polling interval
  useEffect(() => {
    if (!enabled || !prMetadata || !token) {
      return;
    }

    const interval = setInterval(() => {
      fetchComments();
    }, pollInterval);

    return () => clearInterval(interval);
  }, [fetchComments, pollInterval, enabled, prMetadata, token]);

  return {
    annotations,
    isLoading,
    error,
    lastSync,
    refresh: fetchComments,
  };
}
