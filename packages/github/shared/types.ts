/**
 * Consolidated GitHub integration types for the @plannotator/github plugin.
 *
 * Extracted from apps/paste-service/auth/types.ts and apps/paste-service/github/pr.ts
 * to establish a single source of truth for all GitHub-related type definitions.
 */

// --- ACL types (from apps/paste-service/auth/types.ts) ---

export interface PasteACL {
  type: "public" | "whitelist";
  users?: string[]; // GitHub usernames
  teams?: string[]; // "org/team" format (e.g., "myorg/reviewers")
}

export interface PasteMetadata {
  id: string;
  data: string; // Encrypted plan content
  acl: PasteACL;
  createdBy?: string; // GitHub username (optional for backward compat)
  createdAt: string; // ISO timestamp
}

// --- GitHub user/auth types (from apps/paste-service/auth/types.ts) ---

export interface GitHubUser {
  login: string;
  avatar_url: string;
  name?: string;
}

export interface AuthResult {
  valid: boolean;
  user?: GitHubUser;
  error?: string;
}

// --- PR types (consolidated from auth/types.ts + github/pr.ts) ---

export interface PRMetadata {
  repo: string; // "owner/repo" format
  pr_number: number;
  pr_url: string;
  created_at: string;
}

export interface PRComment {
  id: string;
  author: {
    username: string;
    avatar: string;
  };
  body: string;
  line?: number; // Line number for review comments
  path?: string; // File path for review comments
  created_at: string;
  github_url: string;
  comment_type: "review" | "issue"; // Review comment vs issue comment
}

// --- Plugin config (replaces process.env references) ---

export interface GitHubConfig {
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  portalUrl?: string;
  defaultRepo?: string;
  prBaseBranch?: string;
}

// --- Storage adapter (decouples plugin from PasteStore) ---

export interface PRStorageAdapter {
  putPRMetadata(pasteId: string, metadata: PRMetadata): Promise<void>;
  getPRMetadata(pasteId: string): Promise<PRMetadata | null>;
}
