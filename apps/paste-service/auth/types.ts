/**
 * Authentication and ACL type definitions for the paste service.
 */

export interface PasteACL {
  type: "public" | "whitelist";
  users?: string[];        // GitHub usernames
  teams?: string[];        // "org/team" format (e.g., "myorg/reviewers")
}

export interface PasteMetadata {
  id: string;
  data: string;            // Encrypted plan content
  acl: PasteACL;
  createdBy?: string;      // GitHub username (optional for backward compat)
  createdAt: string;       // ISO timestamp
}

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
