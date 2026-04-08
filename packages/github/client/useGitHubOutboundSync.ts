/**
 * Client hook for outbound sync: pushes Plannotator annotations to GitHub
 * as PR review comments via the server endpoint.
 *
 * User-triggered only (no polling per D-08). Handles retry, rate limit,
 * and token expiry following the same patterns as useGitHubPRSync and
 * useGitHubExport.
 *
 * Created as part of Phase 06, Plan 02 (SYNC-OUT-01 through SYNC-OUT-07).
 */

import { useState, useCallback, useRef } from "react";
import type { PRMetadataWithSync } from "../shared/types.ts";

// Local types (same as useGitHubExport -- keep plugin package independent)
interface ExportAnnotation {
  id: string;
  blockId: string;
  type: "DELETION" | "COMMENT" | "GLOBAL_COMMENT";
  text?: string;
  originalText: string;
  images?: Array<{ path: string; name: string }>;
}

interface ExportBlock {
  id: string;
  startLine: number;
}

export interface OutboundSyncResult {
  syncedCount: number;
  editCount: number;
  skippedCount: number;
  warnings: string[];
  hasDrift: boolean;
}

interface UseGitHubOutboundSyncOptions {
  pasteId: string;
  prMetadata: PRMetadataWithSync | null;
  token: string | null;
  pasteServiceUrl?: string;
  onSyncComplete?: (result: OutboundSyncResult) => void;
  onError?: (error: string, type: "network" | "rate_limit" | "token_expired") => void;
  onDriftDetected?: () => Promise<boolean>; // Returns true if user wants to proceed
}

interface UseGitHubOutboundSyncResult {
  syncToGitHub: (annotations: ExportAnnotation[], blocks: ExportBlock[], planMarkdown: string) => Promise<void>;
  isSyncing: boolean;
  error: string | null;
  lastResult: OutboundSyncResult | null;
}

const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000]; // D-12: exponential backoff

/**
 * Hook to sync Plannotator annotations to GitHub as PR review comments.
 *
 * Posts to /api/pr/{pasteId}/sync/outbound with annotations, blocks,
 * and planMarkdown. Handles 401 (token expiry), 429 (rate limit),
 * and network errors with 3x retry.
 */
export function useGitHubOutboundSync({
  pasteId,
  prMetadata,
  token,
  pasteServiceUrl = "http://localhost:19433",
  onSyncComplete,
  onError,
}: UseGitHubOutboundSyncOptions): UseGitHubOutboundSyncResult {
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<OutboundSyncResult | null>(null);

  // Stable refs for callbacks to avoid stale closures
  const onSyncCompleteRef = useRef(onSyncComplete);
  onSyncCompleteRef.current = onSyncComplete;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const syncToGitHub = useCallback(
    async (
      annotations: ExportAnnotation[],
      blocks: ExportBlock[],
      planMarkdown: string
    ): Promise<void> => {
      // Guard: require prMetadata and token
      if (!prMetadata || !token) {
        return;
      }

      setIsSyncing(true);
      setError(null);

      let lastNetworkError: Error | null = null;

      try {
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
          try {
            const response = await fetch(
              `${pasteServiceUrl}/api/pr/${pasteId}/sync/outbound`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ annotations, blocks, planMarkdown }),
              }
            );

            // 401: token expired -- do NOT retry (D-14)
            if (response.status === 401) {
              // D-14: clear token from localStorage, user must re-authenticate
              if (typeof localStorage !== "undefined") {
                localStorage.removeItem("plannotator_github_token");
              }
              setError("token_expired");
              onErrorRef.current?.("token_expired", "token_expired");
              return;
            }

            // 429: rate limited -- do NOT auto-retry
            if (response.status === 429) {
              const body = await response.json().catch(() => ({}));
              const msg = `rate_limited:${body.resetAt || ""}`;
              setError(msg);
              onErrorRef.current?.(msg, "rate_limit");
              return;
            }

            if (!response.ok) {
              const body = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
              throw new Error(body.error || `HTTP ${response.status}`);
            }

            // Success
            const result = (await response.json()) as OutboundSyncResult;
            setLastResult(result);
            onSyncCompleteRef.current?.(result);
            return;
          } catch (err: any) {
            // If we already handled 401/429 above, those return early.
            // This catch is for network errors and unexpected failures.
            lastNetworkError = err;
            if (attempt < MAX_RETRIES - 1) {
              await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
            }
          }
        }

        // All retries exhausted
        const msg = "Sync failed. Check your connection.";
        setError(msg);
        onErrorRef.current?.(msg, "network");
      } finally {
        setIsSyncing(false);
      }
    },
    [pasteId, prMetadata, token, pasteServiceUrl]
  );

  return {
    syncToGitHub,
    isSyncing,
    error,
    lastResult,
  };
}
