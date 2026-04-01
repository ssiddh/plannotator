import React, { createContext, useState, useMemo } from "react";
import type { GitHubUser, PRMetadata } from "../shared/types.ts";

export interface GitHubContextValue {
  // Auth state (Phase 2 populates) -- per D-04: state includes isAuthenticated, user
  isAuthenticated: boolean;
  user: GitHubUser | null;
  token: string | null;

  // PR state (Phase 4 populates) -- per D-04: state includes prMetadata
  prMetadata: PRMetadata | null;

  // Actions (stubs -- implemented in later phases) -- per D-04: actions include sync + createPR
  syncFromGitHub: () => Promise<void>;
  syncToGitHub: () => Promise<void>;
  createPR: () => Promise<void>;
}

export const GitHubContext = createContext<GitHubContextValue | null>(null);

export function GitHubProvider({ children }: { children: React.ReactNode }) {
  // Per D-06: Read token from localStorage on mount
  // Per D-07: Provider reads localStorage, triggers re-renders on auth changes
  const [token, setToken] = useState<string | null>(() => {
    if (typeof localStorage !== "undefined") {
      return localStorage.getItem("github_token");
    }
    return null;
  });

  const [user, setUser] = useState<GitHubUser | null>(null);
  const [prMetadata, setPrMetadata] = useState<PRMetadata | null>(null);

  const value = useMemo<GitHubContextValue>(() => ({
    isAuthenticated: token !== null && user !== null,
    user,
    token,
    prMetadata,

    // Stub actions -- log warnings pointing to the phase that implements them
    syncFromGitHub: async () => {
      console.warn("[GitHubProvider] syncFromGitHub not implemented (Phase 5)");
    },
    syncToGitHub: async () => {
      console.warn("[GitHubProvider] syncToGitHub not implemented (Phase 6)");
    },
    createPR: async () => {
      console.warn("[GitHubProvider] createPR not implemented (Phase 4)");
    },
  }), [token, user, prMetadata]);

  // Per D-03, UI-SPEC: Provider MUST NOT render any visible DOM elements
  return <GitHubContext.Provider value={value}>{children}</GitHubContext.Provider>;
}
