import { useContext } from "react";
import { GitHubContext, type GitHubContextValue } from "./GitHubProvider.tsx";

export function useGitHub(): GitHubContextValue {
  const ctx = useContext(GitHubContext);
  if (!ctx) {
    throw new Error("useGitHub must be used within a GitHubProvider");
  }
  return ctx;
}
