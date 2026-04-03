/**
 * Custom hook that encapsulates all GitHub PR export logic for the ExportModal.
 *
 * Self-contained: includes the export API call, drift detection, image warning,
 * and toast notification logic. Takes a GitHub token parameter rather than
 * calling useGitHub() to avoid coupling to @plannotator/github.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { ToastPayload } from "../utils/callback";

// --- Local type definitions (avoids @plannotator/github dependency) ---

interface PRMetadataLike {
  repo: string;
  pr_number: number;
  pr_url: string;
  planHash?: string;
}

interface ExportAnnotation {
  id: string;
  blockId: string;
  type: string;
  text?: string;
  originalText: string;
  images?: Array<{ path: string; name: string }>;
}

interface ExportBlock {
  id: string;
  startLine: number;
}

const MAX_RETRIES = 3;

// --- Hook params ---

interface UseGitHubPRExportParams {
  /** Paste ID for the current plan */
  pasteId: string | null;
  /** Current plan markdown */
  markdown: string;
  /** Annotations array for export */
  annotations: ExportAnnotation[];
  /** Parsed blocks for line mapping */
  blocks: ExportBlock[];
  /** Toast setter from App.tsx */
  setToast: (toast: ToastPayload) => void;
  /** Paste API URL for login redirect */
  pasteApiUrl?: string;
  /** GitHub auth token */
  githubToken: string | null;
  /** PR metadata if PR already exists */
  prMetadata: PRMetadataLike | null;
  /** Setter for PR metadata */
  setPrMetadata: (metadata: PRMetadataLike | null) => void;
  /** Async function to generate plan hash (optional -- drift detection disabled if not provided) */
  generatePlanHash?: (planMarkdown: string) => Promise<string>;
}

export function useGitHubPRExport({
  pasteId,
  markdown,
  annotations,
  blocks,
  setToast,
  pasteApiUrl,
  githubToken,
  prMetadata,
  setPrMetadata,
  generatePlanHash,
}: UseGitHubPRExportParams) {
  const [hasDrift, setHasDrift] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const retryRef = useRef(0);

  // Drift detection: compare current plan hash with stored PR hash
  useEffect(() => {
    if (!prMetadata?.planHash || !markdown || !generatePlanHash) {
      setHasDrift(false);
      return;
    }

    let cancelled = false;

    generatePlanHash(markdown).then((currentHash) => {
      if (!cancelled) {
        setHasDrift(currentHash !== prMetadata.planHash);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [prMetadata?.planHash, markdown, generatePlanHash]);

  // Whether any annotations have images
  const hasImageAnnotations = useMemo(
    () => annotations.some((a) => a.images && a.images.length > 0),
    [annotations]
  );

  // GitHub login URL derived from paste API URL
  const githubLoginUrl = useMemo(
    () => (pasteApiUrl ? `${pasteApiUrl}/api/auth/github/login` : undefined),
    [pasteApiUrl]
  );

  // Internal export function with retry logic (mirrors useGitHubExport)
  const doExport = useCallback(
    async (retryCount = 0, effectivePasteId?: string): Promise<PRMetadataLike | null> => {
      const pid = effectivePasteId || pasteId;
      if (!pid || !markdown || !githubToken) return null;

      setIsExporting(true);
      setExportError(null);

      try {
        const res = await fetch("/api/pr/create", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + githubToken,
          },
          body: JSON.stringify({
            pasteId: pid,
            planMarkdown: markdown,
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

        // Rate limit retry with exponential backoff
        if (res.status === 429 && retryCount < MAX_RETRIES) {
          const retryAfter = res.headers.get("Retry-After");
          const delay = retryAfter
            ? parseInt(retryAfter, 10) * 1000
            : Math.pow(2, retryCount) * 1000;
          retryRef.current = retryCount + 1;
          setRetryAttempt(retryCount + 1);
          await new Promise((r) => setTimeout(r, delay));
          return doExport(retryCount + 1, pid);
        }

        // Auth expiry
        if (res.status === 401) {
          localStorage.removeItem("plannotator_github_token");
          setExportError("Authentication expired. Please sign in again.");
          setIsExporting(false);
          retryRef.current = 0;
          setRetryAttempt(0);
          return null;
        }

        // Success
        if (res.ok) {
          const data = (await res.json()) as PRMetadataLike;
          setIsExporting(false);
          retryRef.current = 0;
          setRetryAttempt(0);
          return data;
        }

        // Other errors
        const errorText = await res.text().catch(() => `HTTP ${res.status}`);
        setExportError(errorText);
        setIsExporting(false);
        retryRef.current = 0;
        setRetryAttempt(0);
        return null;
      } catch {
        // Network errors retry with exponential backoff
        if (retryCount < MAX_RETRIES) {
          const delay = Math.pow(2, retryCount) * 1000;
          retryRef.current = retryCount + 1;
          setRetryAttempt(retryCount + 1);
          await new Promise((r) => setTimeout(r, delay));
          return doExport(retryCount + 1, pid);
        }

        setExportError("Network error. Please check your connection and try again.");
        setIsExporting(false);
        retryRef.current = 0;
        setRetryAttempt(0);
        return null;
      }
    },
    [pasteId, markdown, githubToken, annotations, blocks]
  );

  // Create a paste if we don't have one yet (needed before PR export)
  const ensurePasteId = useCallback(async (): Promise<string | null> => {
    if (pasteId) return pasteId;
    if (!markdown || !githubToken || !pasteApiUrl) return null;

    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(markdown);
      const base64Data = btoa(String.fromCharCode(...data));

      const res = await fetch(`${pasteApiUrl}/api/paste`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${githubToken}`,
        },
        body: JSON.stringify({
          data: base64Data,
          acl: { type: "public" },
        }),
      });

      if (res.ok) {
        const result = (await res.json()) as { id: string };
        return result.id;
      }
      return null;
    } catch {
      return null;
    }
  }, [pasteId, markdown, githubToken, pasteApiUrl]);

  // Export handler with toast notifications
  const handleExportToPR = useCallback(async () => {
    if (!markdown) return;

    // Ensure we have a paste ID (create one if needed)
    const effectivePasteId = await ensurePasteId();
    if (!effectivePasteId) {
      setToast({
        type: "error",
        message: "Failed to create paste for PR export",
      });
      return;
    }

    const result = await doExport(0, effectivePasteId);

    if (result) {
      // Success
      setPrMetadata(result);
      setToast({
        type: "success",
        message: "PR created successfully",
        action: {
          label: "View PR",
          onClick: () => window.open(result.pr_url, "_blank"),
        },
      });
    } else {
      // Read the error after doExport completes
      // Note: using a ref-like approach since exportError state may not be updated yet
      setToast({
        type: "error",
        message: "Failed to create PR",
        action: {
          label: "Retry",
          onClick: () => { handleExportToPR(); },
        },
      });
    }
  }, [markdown, ensurePasteId, doExport, setPrMetadata, setToast]);

  return {
    // Props for ExportModal (spread directly)
    isGitHubAuthenticated: !!githubToken,
    prMetadata,
    onExportToPR: handleExportToPR,
    isExporting,
    retryAttempt,
    exportError,
    hasDrift,
    hasImageAnnotations,
    githubLoginUrl,
  };
}
