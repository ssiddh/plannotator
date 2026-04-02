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

// --- Sync infrastructure types (Phase 3: DATA-01 through DATA-05) ---

/** Extended PR metadata with plan hash for drift detection (D-08) */
export interface PRMetadataWithSync extends PRMetadata {
  planHash: string; // SHA-256 of full plan markdown at PR creation time
}

/** Sync state for a paste-PR pair (D-10) */
export interface SyncState {
  lastSyncTimestamp: number; // milliseconds since epoch
  lastSyncDirection: "inbound" | "outbound";
}

/** Bidirectional mapping between annotation ID and GitHub comment ID (D-05) */
export interface SyncMapping {
  annotationId: string;
  commentId: string;
  pasteId: string;
}

/** Conflict information when both sides modified since last sync (D-11, D-12) */
export interface ConflictInfo {
  annotationId: string;
  commentId: string;
  localText: string; // Current Plannotator annotation text
  remoteText: string; // Current GitHub comment body
  localModifiedAt: number; // Annotation createdA (milliseconds)
  remoteModifiedAt: number; // GitHub comment updated_at (converted to ms)
  lastSyncAt: number; // Last sync timestamp (milliseconds)
}

/** User's resolution choice for a conflict (D-12) */
export type ConflictResolution = "keep-local" | "keep-remote" | "abort";
