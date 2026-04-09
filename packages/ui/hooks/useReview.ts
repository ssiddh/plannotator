/**
 * Hook for submitting PR reviews (approve/request changes/comment)
 * with auto-sync of unsynced annotations before submission.
 *
 * Created as part of Phase 07, Plan 03 (THREAD-05, THREAD-06).
 */

import { useState, useCallback, useRef, useMemo } from 'react';
import type { Annotation } from '../types';

export type ReviewEvent = 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
export type ReviewState = 'idle' | 'syncing' | 'submitting' | 'success' | 'error';

interface PRMetadata {
  owner: string;
  repo: string;
  prNumber: number;
  prUrl: string;
}

interface UseReviewOptions {
  prMetadata: PRMetadata | null;
  githubToken: string | null;
  annotations: Annotation[];
  onSyncAnnotations?: () => Promise<void>;
  serverOrigin: string;
}

interface UseReviewResult {
  state: ReviewState;
  pendingCount: number;
  error: string | null;
  submitReview: (event: ReviewEvent, body?: string) => Promise<void>;
}

/**
 * Hook for PR review submission with auto-sync.
 *
 * Flow per D-14:
 * 1. Set state to 'syncing'
 * 2. If pendingCount > 0 and onSyncAnnotations exists, sync first
 * 3. Set state to 'submitting'
 * 4. POST to /api/github/review with event, body, PR details
 * 5. On success: set state to 'success'
 * 6. On error: set state to 'error' with specific message
 */
export function useReview({
  prMetadata,
  githubToken,
  annotations,
  onSyncAnnotations,
  serverOrigin,
}: UseReviewOptions): UseReviewResult {
  const [state, setState] = useState<ReviewState>('idle');
  const [error, setError] = useState<string | null>(null);

  // Stable refs for callbacks
  const onSyncRef = useRef(onSyncAnnotations);
  onSyncRef.current = onSyncAnnotations;

  // Count annotations that haven't been synced to GitHub
  // (those without github-pr source and not summary annotations)
  const pendingCount = useMemo(() => {
    return annotations.filter(
      (a) => a.source !== 'github-pr' && !a.isSummary
    ).length;
  }, [annotations]);

  const submitReview = useCallback(
    async (event: ReviewEvent, body?: string): Promise<void> => {
      if (!prMetadata || !githubToken) {
        setError('No PR linked or not authenticated');
        setState('error');
        return;
      }

      setError(null);

      try {
        // Step 1: Sync unsynced annotations if any
        if (pendingCount > 0 && onSyncRef.current) {
          setState('syncing');
          await onSyncRef.current();
        }

        // Step 2: Submit the review
        setState('submitting');

        const response = await fetch(`${serverOrigin}/api/github/review`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${githubToken}`,
          },
          body: JSON.stringify({
            event,
            body: body || undefined,
            owner: prMetadata.owner,
            repo: prMetadata.repo,
            prNumber: prMetadata.prNumber,
            token: githubToken,
          }),
        });

        if (!response.ok) {
          // Handle specific error codes per D-14 / D-39
          if (response.status === 401) {
            // D-14: clear token on 401
            if (typeof localStorage !== 'undefined') {
              localStorage.removeItem('plannotator_github_token');
            }
            throw new Error('Session expired. Please re-authenticate.');
          }
          if (response.status === 403) {
            throw new Error("You don't have permission to submit reviews on this PR");
          }
          if (response.status === 422) {
            // D-39: PR state issue (closed/merged)
            const data = await response.json().catch(() => ({}));
            const msg = data.error || data.message || 'PR may be closed or merged';
            throw new Error(msg);
          }
          if (response.status === 429) {
            throw new Error('Rate limit hit. Please try again later.');
          }

          // Generic server error
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || `Review submission failed (HTTP ${response.status})`);
        }

        setState('success');
      } catch (err: any) {
        setState('error');
        const msg =
          err instanceof Error
            ? err.message
            : 'Review submission failed. Check your connection.';
        setError(msg);
      }
    },
    [prMetadata, githubToken, pendingCount, serverOrigin]
  );

  return {
    state,
    pendingCount,
    error,
    submitReview,
  };
}
