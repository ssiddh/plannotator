import { mkdirSync, readdirSync, readFileSync, unlinkSync } from "fs";
import { join, resolve } from "path";
import type { PasteStore } from "../core/storage";
import type { PasteMetadata, PRMetadata } from "../auth/types";

interface PasteFile {
  data: string;
  expiresAt: number;
}

interface PasteFileWithMetadata {
  metadata: PasteMetadata;
  expiresAt: number;
}

interface PRMetadataFile {
  metadata: PRMetadata;
  expiresAt: number;
}

export class FsPasteStore implements PasteStore {
  private resolvedDir: string;

  constructor(private dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    this.resolvedDir = resolve(dataDir);
    this.sweep();
  }

  private safePath(id: string): string {
    const filePath = resolve(join(this.dataDir, `${id}.json`));
    if (!filePath.startsWith(this.resolvedDir)) {
      throw new Error("Invalid paste ID");
    }
    return filePath;
  }

  async put(id: string, data: string, ttlSeconds: number): Promise<void> {
    const entry: PasteFile = {
      data,
      expiresAt: Date.now() + ttlSeconds * 1000,
    };
    await Bun.write(this.safePath(id), JSON.stringify(entry));
  }

  async get(id: string): Promise<string | null> {
    const path = this.safePath(id);
    try {
      const entry: PasteFile = await Bun.file(path).json();
      if (Date.now() > entry.expiresAt) {
        unlinkSync(path);
        return null;
      }
      return entry.data;
    } catch {
      return null;
    }
  }

  async putMetadata(
    metadata: PasteMetadata,
    ttlSeconds: number
  ): Promise<void> {
    const entry: PasteFileWithMetadata = {
      metadata,
      expiresAt: Date.now() + ttlSeconds * 1000,
    };
    await Bun.write(this.safePath(metadata.id), JSON.stringify(entry));
  }

  async getMetadata(id: string): Promise<PasteMetadata | null> {
    const path = this.safePath(id);
    try {
      const raw: any = await Bun.file(path).json();
      if (Date.now() > raw.expiresAt) {
        unlinkSync(path);
        return null;
      }

      // Check if this is new format (has metadata field)
      if (raw.metadata) {
        return raw.metadata as PasteMetadata;
      }

      // Legacy format: plain data string
      // Auto-migrate to metadata format
      return {
        id,
        data: raw.data,
        acl: { type: "public" },
        createdAt: new Date().toISOString(),
      };
    } catch {
      return null;
    }
  }

  /** Store PR metadata for a paste (30-day TTL) */
  async putPRMetadata(pasteId: string, metadata: PRMetadata): Promise<void> {
    const entry: PRMetadataFile = {
      metadata,
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
    };
    const prPath = resolve(join(this.dataDir, `pr-${pasteId}.json`));
    if (!prPath.startsWith(this.resolvedDir)) {
      throw new Error("Invalid paste ID");
    }
    await Bun.write(prPath, JSON.stringify(entry));
  }

  /** Retrieve PR metadata for a paste */
  async getPRMetadata(pasteId: string): Promise<PRMetadata | null> {
    const prPath = resolve(join(this.dataDir, `pr-${pasteId}.json`));
    if (!prPath.startsWith(this.resolvedDir)) {
      throw new Error("Invalid paste ID");
    }

    try {
      const entry: PRMetadataFile = await Bun.file(prPath).json();
      if (Date.now() > entry.expiresAt) {
        unlinkSync(prPath);
        return null;
      }
      return entry.metadata;
    } catch {
      return null;
    }
  }

  /** Delete expired pastes and PR metadata on startup */
  private sweep(): void {
    try {
      const files = readdirSync(this.dataDir).filter((f) => f.endsWith(".json"));
      const now = Date.now();
      for (const file of files) {
        const path = join(this.dataDir, file);
        try {
          const raw = readFileSync(path, "utf-8");
          const entry: PasteFile | PRMetadataFile | PasteFileWithMetadata = JSON.parse(raw);
          if (now > entry.expiresAt) {
            unlinkSync(path);
          }
        } catch {
          // skip malformed files
        }
      }
    } catch {
      // dataDir might not exist yet
    }
  }
}
