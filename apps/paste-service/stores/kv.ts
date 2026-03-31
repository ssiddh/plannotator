import type { PasteStore } from "../core/storage";
import type { PasteMetadata } from "../auth/types";

/**
 * Cloudflare KV-backed paste store.
 * Uses KV's native expirationTtl for automatic cleanup.
 *
 * Supports both legacy (plain string) and new (JSON metadata) formats for
 * backward compatibility with existing paste entries.
 */
export class KvPasteStore implements PasteStore {
  constructor(private kv: KVNamespace) {}

  async put(id: string, data: string, ttlSeconds: number): Promise<void> {
    await this.kv.put(`paste:${id}`, data, { expirationTtl: ttlSeconds });
  }

  async putMetadata(
    metadata: PasteMetadata,
    ttlSeconds: number
  ): Promise<void> {
    await this.kv.put(`paste:${metadata.id}`, JSON.stringify(metadata), {
      expirationTtl: ttlSeconds,
    });
  }

  async get(id: string): Promise<string | null> {
    return this.kv.get(`paste:${id}`);
  }

  async getMetadata(id: string): Promise<PasteMetadata | null> {
    const raw = await this.kv.get(`paste:${id}`);
    if (!raw) return null;

    // Try to parse as JSON (new format)
    try {
      const parsed = JSON.parse(raw);
      // If it has the metadata shape, return it
      if (parsed.data && parsed.acl) {
        return parsed as PasteMetadata;
      }
    } catch {
      // Not JSON, treat as legacy plain string
    }

    // Legacy format: plain encrypted string
    // Auto-migrate to new format with public ACL
    return {
      id,
      data: raw,
      acl: { type: "public" },
      createdAt: new Date().toISOString(),
    };
  }
}
