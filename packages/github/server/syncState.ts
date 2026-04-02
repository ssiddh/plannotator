/**
 * Sync state tracking and conflict detection.
 * Per D-10: per-paste sync metadata in KV.
 * Per D-11: conflict detection via timestamp comparison.
 * Per D-13: supports incremental sync via lastSyncTimestamp.
 */

// TODO: Import from "../shared/types.ts" once Plan 01 adds SyncState and ConflictInfo types
interface SyncState {
  lastSyncTimestamp: number;
  lastSyncDirection: "inbound" | "outbound";
}

interface ConflictInfo {
  annotationId: string;
  commentId: string;
  localText: string;
  remoteText: string;
  localModifiedAt: number;
  remoteModifiedAt: number;
  lastSyncAt: number;
}

/** Persist sync state for a paste-PR pair. */
export async function setSyncState(
  pasteId: string,
  timestamp: number,
  direction: "inbound" | "outbound",
  kv: any,
  ttlSeconds?: number
): Promise<void> {
  const state: SyncState = {
    lastSyncTimestamp: timestamp,
    lastSyncDirection: direction,
  };
  const opts = ttlSeconds ? { expirationTtl: ttlSeconds } : undefined;
  await kv.put(`sync:${pasteId}:state`, JSON.stringify(state), opts);
}

/** Read sync state for a paste-PR pair. Returns null if never synced. */
export async function getSyncState(
  pasteId: string,
  kv: any
): Promise<SyncState | null> {
  const raw = await kv.get(`sync:${pasteId}:state`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SyncState;
  } catch {
    return null;
  }
}

/**
 * Detect if a single annotation-comment pair is in conflict.
 * Per D-11: conflict when both sides modified since last sync.
 *
 * @param localModifiedAt - Annotation's createdA field (milliseconds)
 * @param remoteModifiedAt - GitHub comment's updated_at (ISO 8601 string)
 * @param lastSyncTimestamp - Last sync time (milliseconds)
 */
export function detectConflict(
  localModifiedAt: number,
  remoteModifiedAt: string,
  lastSyncTimestamp: number
): boolean {
  const remoteMs = new Date(remoteModifiedAt).getTime();
  return localModifiedAt > lastSyncTimestamp && remoteMs > lastSyncTimestamp;
}

/**
 * Batch conflict detection across multiple annotation-comment pairs.
 * Returns ConflictInfo for each pair where both sides modified since last sync.
 */
export function detectConflicts(
  pairs: Array<{
    annotationId: string;
    commentId: string;
    localText: string;
    remoteText: string;
    localModifiedAt: number;
    remoteModifiedAt: string; // ISO 8601
  }>,
  lastSyncTimestamp: number
): ConflictInfo[] {
  return pairs
    .filter((p) =>
      detectConflict(p.localModifiedAt, p.remoteModifiedAt, lastSyncTimestamp)
    )
    .map((p) => ({
      annotationId: p.annotationId,
      commentId: p.commentId,
      localText: p.localText,
      remoteText: p.remoteText,
      localModifiedAt: p.localModifiedAt,
      remoteModifiedAt: new Date(p.remoteModifiedAt).getTime(),
      lastSyncAt: lastSyncTimestamp,
    }));
}
