/**
 * GitHub PR comment synchronization hook.
 *
 * Uses the server sync endpoint to fetch PR comments, builds thread trees,
 * and manages polling with Page Visibility API support.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import type { Annotation, Block } from "../../ui/types.ts";
import { buildThreadTree } from "./threadTree.ts";
import type {
  PRMetadataWithSync,
  InboundSyncResponse,
} from "../shared/types.ts";

interface UseGitHubPRSyncOptions {
  pasteId: string;
  prMetadata: PRMetadataWithSync | null;
  blocks: Block[];
  token: string | null;
  pasteServiceUrl?: string;
  pollInterval?: number; // milliseconds, default 300000 (5 minutes per D-05)
  enabled?: boolean;
  onSyncComplete?: (stats: InboundSyncResponse["stats"]) => void;
  onError?: (error: string, type: "network" | "rate_limit" | "token_expired") => void;
}

interface UseGitHubPRSyncResult {
  annotations: Annotation[];
  isLoading: boolean;
  isSyncing: boolean; // true during active sync (vs initial load)
  error: string | null;
  lastSync: Date | null;
  newCommentCount: number; // Badge count for toolbar
  syncFromGitHub: () => Promise<void>; // Manual trigger
}

const DEFAULT_POLL_INTERVAL = 300000; // 5 minutes (D-05)
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000]; // exponential backoff

/**
 * Hook to sync GitHub PR comments as annotations.
 *
 * Fetches from /api/pr/{pasteId}/sync/inbound, builds thread trees,
 * polls with Page Visibility API, and handles errors with retry.
 */
export function useGitHubPRSync({
  pasteId,
  prMetadata,
  blocks,
  token,
  pasteServiceUrl = "http://localhost:19433",
  pollInterval = DEFAULT_POLL_INTERVAL,
  enabled = true,
  onSyncComplete,
  onError,
}: UseGitHubPRSyncOptions): UseGitHubPRSyncResult {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [newCommentCount, setNewCommentCount] = useState(0);

  // Refs for stable references across closures
  const knownCommentIds = useRef<Set<string>>(new Set());
  const rateLimitResetTime = useRef<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isFirstLoad = useRef(true);
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;

  // Stable refs for callbacks to avoid stale closures
  const onSyncCompleteRef = useRef(onSyncComplete);
  onSyncCompleteRef.current = onSyncComplete;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  /**
   * Fetch with retry logic (D-12).
   * Retries network errors 3x with exponential backoff.
   * Does NOT retry 401 (token_expired) or 429 (rate_limit).
   */
  const fetchWithRetry = useCallback(async (): Promise<InboundSyncResponse> => {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(
          `${pasteServiceUrl}/api/pr/${pasteId}/sync/inbound`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        // Check response.status BEFORE parsing body
        if (response.status === 401) {
          // D-15: token expired -- do NOT retry
          throw Object.assign(new Error("token_expired"), {
            type: "token_expired" as const,
          });
        }

        if (response.status === 429) {
          // D-13: rate limited -- do NOT retry automatically
          const body = await response.json();
          throw Object.assign(
            new Error(`rate_limited:${body.resetAt || ""}`),
            { type: "rate_limit" as const }
          );
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        return (await response.json()) as InboundSyncResponse;
      } catch (err: any) {
        // Non-retryable errors: propagate immediately
        if (err.type === "token_expired" || err.type === "rate_limit") {
          throw err;
        }
        lastError = err;
        if (attempt < MAX_RETRIES - 1) {
          await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
        }
      }
    }

    throw lastError || new Error("Sync failed after 3 retries");
  }, [pasteServiceUrl, pasteId, token]);

  /**
   * Core sync function: fetch, build tree, merge annotations.
   */
  const fetchAndSync = useCallback(
    async (isManual: boolean = false) => {
      if (!prMetadata || !token || !enabled) return;

      // Rate limit check (D-13)
      if (Date.now() < rateLimitResetTime.current) return;

      if (isManual) {
        setIsSyncing(true);
      } else if (isFirstLoad.current) {
        setIsLoading(true);
      } else {
        setIsSyncing(true);
      }
      setError(null);

      try {
        const response = await fetchWithRetry();

        // Build thread tree from flat annotations
        const treeAnnotations = buildThreadTree(
          response.annotations,
          blocksRef.current
        );

        // Merge with existing state
        setAnnotations((prev) => {
          const existingById = new Map(prev.map((a) => [a.id, a]));

          // Remove deleted annotations (D-17)
          for (const deletedId of response.deletedIds) {
            existingById.delete(deletedId);
          }

          // Update or add annotations from response
          for (const ann of treeAnnotations) {
            existingById.set(ann.id, ann);
            knownCommentIds.current.add(ann.id);
          }

          return Array.from(existingById.values());
        });

        setNewCommentCount(response.stats.new);
        setLastSync(new Date());
        isFirstLoad.current = false;

        onSyncCompleteRef.current?.(response.stats);
      } catch (err: any) {
        if (err.type === "token_expired") {
          setError("token_expired");
          onErrorRef.current?.("token_expired", "token_expired");
        } else if (err.type === "rate_limit") {
          const resetAt = err.message.replace("rate_limited:", "");
          setError(`rate_limited:${resetAt}`);
          onErrorRef.current?.(`rate_limited:${resetAt}`, "rate_limit");

          // Pause polling until reset time (D-13)
          if (resetAt) {
            rateLimitResetTime.current = new Date(resetAt).getTime();
          }
        } else {
          const msg = "Sync failed. Check your connection.";
          setError(msg);
          onErrorRef.current?.(msg, "network");
        }
      } finally {
        setIsLoading(false);
        setIsSyncing(false);
      }
    },
    [prMetadata, token, enabled, fetchWithRetry]
  );

  /**
   * Manual sync trigger -- exported for toolbar button and provider registration.
   */
  const syncFromGitHub = useCallback(async () => {
    await fetchAndSync(true);
  }, [fetchAndSync]);

  /**
   * Page Visibility API polling (D-05, D-06).
   *
   * - On mount (visible): initial sync + start interval
   * - Tab hidden: clear interval (pause)
   * - Tab visible: immediate sync + restart interval
   */
  useEffect(() => {
    if (!enabled || !prMetadata || !token) return;

    const startPolling = () => {
      // Clear any existing interval
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      intervalRef.current = setInterval(() => {
        fetchAndSync(false);
      }, pollInterval);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Tab hidden: pause polling
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      } else {
        // Tab visible: immediate sync + restart interval
        fetchAndSync(false);
        startPolling();
      }
    };

    // Initial sync
    fetchAndSync(false);
    startPolling();

    // Register visibility change listener
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, prMetadata, token, pollInterval, fetchAndSync]);

  return {
    annotations,
    isLoading,
    isSyncing,
    error,
    lastSync,
    newCommentCount,
    syncFromGitHub,
  };
}
