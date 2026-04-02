import { describe, test, expect } from "bun:test";
import {
  setMapping,
  getCommentId,
  getAnnotationId,
  deleteMapping,
} from "./syncMappings.ts";

function createMockKV(): any {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string, _opts?: any) => {
      store.set(key, value);
    },
    delete: async (key: string) => {
      store.delete(key);
    },
    _store: store,
  };
}

describe("syncMappings", () => {
  describe("setMapping", () => {
    test("creates two KV entries (annotation->comment and comment->annotation)", async () => {
      const kv = createMockKV();
      await setMapping("paste1", "ann1", "comment1", kv, 3600);

      expect(kv._store.get("sync:paste1:ann:ann1")).toBe("comment1");
      expect(kv._store.get("sync:paste1:gh:comment1")).toBe("ann1");
    });

    test("passes expirationTtl to both kv.put calls", async () => {
      const putCalls: Array<{ key: string; opts: any }> = [];
      const kv = createMockKV();
      const originalPut = kv.put;
      kv.put = async (key: string, value: string, opts?: any) => {
        putCalls.push({ key, opts });
        return originalPut(key, value, opts);
      };

      await setMapping("paste1", "ann1", "comment1", kv, 7200);

      expect(putCalls).toHaveLength(2);
      expect(putCalls[0].opts).toEqual({ expirationTtl: 7200 });
      expect(putCalls[1].opts).toEqual({ expirationTtl: 7200 });
    });
  });

  describe("getCommentId", () => {
    test("returns the commentId previously set via setMapping", async () => {
      const kv = createMockKV();
      await setMapping("paste1", "ann1", "comment1", kv, 3600);

      const result = await getCommentId("paste1", "ann1", kv);
      expect(result).toBe("comment1");
    });

    test("returns null when no mapping exists", async () => {
      const kv = createMockKV();
      const result = await getCommentId("paste1", "nonexistent", kv);
      expect(result).toBeNull();
    });
  });

  describe("getAnnotationId", () => {
    test("returns the annotationId previously set via setMapping", async () => {
      const kv = createMockKV();
      await setMapping("paste1", "ann1", "comment1", kv, 3600);

      const result = await getAnnotationId("paste1", "comment1", kv);
      expect(result).toBe("ann1");
    });

    test("returns null when no mapping exists", async () => {
      const kv = createMockKV();
      const result = await getAnnotationId("paste1", "nonexistent", kv);
      expect(result).toBeNull();
    });
  });

  describe("deleteMapping", () => {
    test("removes both KV entries", async () => {
      const kv = createMockKV();
      await setMapping("paste1", "ann1", "comment1", kv, 3600);

      await deleteMapping("paste1", "ann1", "comment1", kv);

      expect(await getCommentId("paste1", "ann1", kv)).toBeNull();
      expect(await getAnnotationId("paste1", "comment1", kv)).toBeNull();
    });

    test("does not throw with non-existent mapping", async () => {
      const kv = createMockKV();
      // Should not throw
      await deleteMapping("paste1", "nonexistent-ann", "nonexistent-comment", kv);
    });
  });

  describe("isolation", () => {
    test("multiple mappings for different pasteIds are independent", async () => {
      const kv = createMockKV();
      await setMapping("paste1", "ann1", "commentA", kv, 3600);
      await setMapping("paste2", "ann1", "commentB", kv, 3600);

      expect(await getCommentId("paste1", "ann1", kv)).toBe("commentA");
      expect(await getCommentId("paste2", "ann1", kv)).toBe("commentB");
      expect(await getAnnotationId("paste1", "commentA", kv)).toBe("ann1");
      expect(await getAnnotationId("paste2", "commentB", kv)).toBe("ann1");

      // Deleting paste1 mapping should not affect paste2
      await deleteMapping("paste1", "ann1", "commentA", kv);
      expect(await getCommentId("paste1", "ann1", kv)).toBeNull();
      expect(await getCommentId("paste2", "ann1", kv)).toBe("commentB");
    });
  });
});
