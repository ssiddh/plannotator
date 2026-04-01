/**
 * Re-export all types from the GitHub plugin package.
 * This file exists for backward compatibility with any code importing from paste-service auth.
 */
export type {
  PasteACL,
  PasteMetadata,
  GitHubUser,
  AuthResult,
  PRMetadata,
} from "@plannotator/github/types";
