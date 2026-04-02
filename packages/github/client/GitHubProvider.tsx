import React, { createContext, useState, useEffect, useMemo } from "react";
import type { GitHubUser, PRMetadata, PRMetadataWithSync } from "../shared/types.ts";

export interface GitHubContextValue {
  // Auth state (Phase 2 populates) -- per D-04: state includes isAuthenticated, user
  isAuthenticated: boolean;
  user: GitHubUser | null;
  token: string | null;

  // PR state (Phase 4 populates) -- per D-04: state includes prMetadata
  prMetadata: PRMetadataWithSync | null;
  setPrMetadata: (metadata: PRMetadataWithSync | null) => void;
  pasteId: string | null;

  // Actions (stubs -- implemented in later phases) -- per D-04: actions include sync + createPR
  syncFromGitHub: () => Promise<void>;
  syncToGitHub: () => Promise<void>;
  createPR: () => Promise<void>;
}

export const GitHubContext = createContext<GitHubContextValue | null>(null);

export function GitHubProvider({ children, pasteId }: { children: React.ReactNode; pasteId?: string | null }) {
  // Per D-06: Read token from localStorage on mount
  // Per D-07: Provider reads localStorage, triggers re-renders on auth changes
  const [token, setToken] = useState<string | null>(() => {
    if (typeof localStorage !== "undefined") {
      return localStorage.getItem("plannotator_github_token");
    }
    return null;
  });

  const [user, setUser] = useState<GitHubUser | null>(null);
  const [prMetadata, setPrMetadata] = useState<PRMetadataWithSync | null>(null);

  // Per D-09: Validate token on mount via /api/auth/token/validate
  // Per D-11: Clear state when token is invalid or expired
  // Per D-12: No proactive refresh, reactive handling only
  useEffect(() => {
    if (!token) return;

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/auth/token/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        if (!res.ok) {
          // Token invalid or expired (D-11)
          if (!cancelled) {
            localStorage.removeItem("plannotator_github_token");
            setToken(null);
            setUser(null);
          }
          return;
        }

        const data = (await res.json()) as {
          valid: boolean;
          user?: GitHubUser;
        };
        if (!cancelled && data.valid && data.user) {
          setUser(data.user);
        } else if (!cancelled) {
          // Token reported as invalid
          localStorage.removeItem("plannotator_github_token");
          setToken(null);
          setUser(null);
        }
      } catch {
        // Network error -- don't clear token (might be offline)
        // Per D-12: reactive handling only, no proactive refresh
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  // Per D-12: Hydrate PR metadata from API when pasteId is available
  useEffect(() => {
    if (!pasteId) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/pr/${pasteId}/metadata`);
        if (res.ok && !cancelled) {
          const data = (await res.json()) as PRMetadataWithSync;
          setPrMetadata(data);
        }
      } catch {
        // Silently ignore -- PR metadata is optional
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pasteId]);

  const value = useMemo<GitHubContextValue>(() => ({
    isAuthenticated: token !== null && user !== null,
    user,
    token,
    prMetadata,
    setPrMetadata,
    pasteId: pasteId || null,

    // Stub actions -- log warnings pointing to the phase that implements them
    syncFromGitHub: async () => {
      console.warn("[GitHubProvider] syncFromGitHub not implemented (Phase 5)");
    },
    syncToGitHub: async () => {
      console.warn("[GitHubProvider] syncToGitHub not implemented (Phase 6)");
    },
    createPR: async () => {
      console.warn("[GitHubProvider] createPR stub -- use useGitHubExport hook directly");
    },
  }), [token, user, prMetadata, setPrMetadata, pasteId]);

  // Per D-03, UI-SPEC: Provider MUST NOT render any visible DOM elements
  return <GitHubContext.Provider value={value}>{children}</GitHubContext.Provider>;
}
