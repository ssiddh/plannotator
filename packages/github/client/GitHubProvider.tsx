import React, { createContext, useState, useMemo } from "react";
import type { GitHubUser, PRMetadata } from "../shared/types.ts";

export interface GitHubContextValue {
  // Auth state (Phase 2 populates) -- per D-04: state includes isAuthenticated, user
  isAuthenticated: boolean;
  user: GitHubUser | null;
  token: string | null;

  // PR state (Phase 4 populates) -- per D-04: state includes prMetadata
  prMetadata: PRMetadata | null;

  // Actions -- per D-04: actions include sync + createPR
  syncFromGitHub: () => Promise<void>;
  syncToGitHub: () => Promise<void>;
  createPR: () => Promise<void>;

  // Sync registration -- App.tsx registers the hook's sync actions here
  registerSyncAction: (fn: (() => Promise<void>) | null) => void;
  registerOutboundSyncAction: (fn: (() => Promise<void>) | null) => void;
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
  const [syncAction, setSyncAction] = useState<(() => Promise<void>) | null>(null);
  const [outboundSyncAction, setOutboundSyncAction] = useState<(() => Promise<void>) | null>(null);

  const value = useMemo<GitHubContextValue>(() => ({
    isAuthenticated: token !== null && user !== null,
    user,
    token,
    prMetadata,

    // syncFromGitHub delegates to registered action, or warns if not registered yet
    syncFromGitHub: syncAction || (async () => {
      console.warn("[GitHubProvider] syncFromGitHub not registered yet");
    }),
    syncToGitHub: outboundSyncAction || (async () => {
      console.warn("[GitHubProvider] syncToGitHub not registered yet");
    }),
    createPR: async () => {
      console.warn("[GitHubProvider] createPR not implemented (Phase 4)");
    },

    // App.tsx calls registerSyncAction(hook.syncFromGitHub) after initializing useGitHubPRSync
    registerSyncAction: (fn) => setSyncAction(() => fn),
    registerOutboundSyncAction: (fn) => setOutboundSyncAction(() => fn),
  }), [token, user, prMetadata, syncAction, outboundSyncAction]);

  // Per D-03, UI-SPEC: Provider MUST NOT render any visible DOM elements
  return <GitHubContext.Provider value={value}>{children}</GitHubContext.Provider>;
}
