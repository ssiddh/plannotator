import { useState, useCallback, useRef } from "react";
import { useGitHub } from "./useGitHub.ts";
import type { PRMetadataWithSync } from "../shared/types.ts";

// Local types to avoid importing from @plannotator/ui (keep plugin package independent)
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

const MAX_RETRIES = 3;

export function useGitHubExport() {
  const { token } = useGitHub();
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<PRMetadataWithSync | null>(null);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const retryRef = useRef(0);

  const exportToPR = useCallback(
    async (
      pasteId: string,
      planMarkdown: string,
      annotations: ExportAnnotation[],
      blocks: ExportBlock[],
      retryCount = 0
    ): Promise<PRMetadataWithSync | null> => {
      setIsExporting(true);
      setError(null);

      // Per D-19: require auth token
      if (!token) {
        setError("Authentication required");
        setIsExporting(false);
        return null;
      }

      try {
        const res = await fetch("/api/pr/create", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + token,
          },
          body: JSON.stringify({
            pasteId,
            planMarkdown,
            annotations: annotations.map((a) => ({
              id: a.id,
              blockId: a.blockId,
              type: a.type,
              text: a.text,
              originalText: a.originalText,
              images: a.images,
            })),
            blocks: blocks.map((b) => ({
              id: b.id,
              startLine: b.startLine,
            })),
          }),
        });

        // Per D-18: rate limit retry with exponential backoff
        if (res.status === 429 && retryCount < MAX_RETRIES) {
          const retryAfter = res.headers.get("Retry-After");
          const delay = retryAfter
            ? parseInt(retryAfter, 10) * 1000
            : Math.pow(2, retryCount) * 1000;
          retryRef.current = retryCount + 1;
          setRetryAttempt(retryCount + 1);
          await new Promise((r) => setTimeout(r, delay));
          return exportToPR(pasteId, planMarkdown, annotations, blocks, retryCount + 1);
        }

        // Per D-19: auth expiry clears token and redirects
        if (res.status === 401) {
          localStorage.removeItem("plannotator_github_token");
          setError("Authentication expired. Please sign in again.");
          setIsExporting(false);
          retryRef.current = 0;
          setRetryAttempt(0);
          return null;
        }

        // Success
        if (res.ok) {
          const data = (await res.json()) as PRMetadataWithSync;
          setLastResult(data);
          setIsExporting(false);
          retryRef.current = 0;
          setRetryAttempt(0);
          return data;
        }

        // Other errors
        const errorText = await res.text().catch(() => `HTTP ${res.status}`);
        setError(errorText);
        setIsExporting(false);
        retryRef.current = 0;
        setRetryAttempt(0);
        return null;
      } catch {
        // Per D-20: network errors retry with exponential backoff
        if (retryCount < MAX_RETRIES) {
          const delay = Math.pow(2, retryCount) * 1000;
          retryRef.current = retryCount + 1;
          setRetryAttempt(retryCount + 1);
          await new Promise((r) => setTimeout(r, delay));
          return exportToPR(pasteId, planMarkdown, annotations, blocks, retryCount + 1);
        }

        setError("Network error. Please check your connection and try again.");
        setIsExporting(false);
        retryRef.current = 0;
        setRetryAttempt(0);
        return null;
      }
    },
    [token]
  );

  return { exportToPR, isExporting, error, lastResult, retryAttempt };
}
