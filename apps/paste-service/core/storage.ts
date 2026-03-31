import type { PasteMetadata } from "../auth/types";

/**
 * PasteStore interface — pluggable storage backend for paste data.
 *
 * Implementations: FsPasteStore (filesystem), KvPasteStore (CF KV)
 */
export interface PasteStore {
  /** Legacy method: store plain string data */
  put(id: string, data: string, ttlSeconds: number): Promise<void>;

  /** New method: store paste with metadata (ACL, createdBy, etc.) */
  putMetadata(metadata: PasteMetadata, ttlSeconds: number): Promise<void>;

  /** Legacy method: get plain string data */
  get(id: string): Promise<string | null>;

  /** New method: get paste with metadata */
  getMetadata(id: string): Promise<PasteMetadata | null>;
}
