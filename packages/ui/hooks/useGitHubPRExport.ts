/**
 * Custom hook that encapsulates all GitHub PR export logic for the ExportModal.
 *
 * Uses dependency injection for GitHub hooks to avoid coupling @plannotator/ui
 * to @plannotator/github. App.tsx calls useGitHub() and useGitHubExport()
 * and passes their results here.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
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

  // Injected from useGitHub()
  /** Whether user is authenticated with GitHub */
  isAuthenticated: boolean;
  /** PR metadata from context */
  prMetadata: PRMetadataLike | null;
  /** Setter for PR metadata in context */
  setPrMetadata: (metadata: PRMetadataLike | null) => void;

  // Injected from useGitHubExport()
  /** Export function */
  exportToPR: (
    pasteId: string,
    planMarkdown: string,
    annotations: ExportAnnotation[],
    blocks: ExportBlock[]
  ) => Promise<PRMetadataLike | null>;
  /** Whether export is in progress */
  isExporting: boolean;
  /** Export error from last attempt */
  exportError: string | null;
  /** Current retry attempt */
  retryAttempt: number;

  // Injected: plan hash generation
  /** Async function to generate plan hash */
  generatePlanHash?: (planMarkdown: string) => Promise<string>;
}

export function useGitHubPRExport({
  pasteId,
  markdown,
  annotations,
  blocks,
  setToast,
  pasteApiUrl,
  isAuthenticated,
  prMetadata,
  setPrMetadata,
  exportToPR,
  isExporting,
  exportError,
  retryAttempt,
  generatePlanHash,
}: UseGitHubPRExportParams) {
  const [hasDrift, setHasDrift] = useState(false);

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

  // Export handler with toast notifications
  const handleExportToPR = useCallback(async () => {
    if (!pasteId || !markdown) return;

    const result = await exportToPR(pasteId, markdown, annotations, blocks);

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
    } else if (exportError) {
      // Failure -- provide retry action
      setToast({
        type: "error",
        message: exportError,
        action: {
          label: "Retry",
          onClick: () => handleExportToPR(),
        },
      });
    }
  }, [
    pasteId,
    markdown,
    annotations,
    blocks,
    exportToPR,
    setPrMetadata,
    setToast,
    exportError,
  ]);

  return {
    // Props for ExportModal (spread directly)
    isGitHubAuthenticated: isAuthenticated,
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
