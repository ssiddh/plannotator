import { describe, test, expect } from "bun:test";
import {
  setSyncState,
  getSyncState,
  detectConflict,
  detectConflicts,
} from "./syncState.ts";

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

describe("syncState", () => {
  describe("setSyncState", () => {
    test("writes JSON to sync:{pasteId}:state with lastSyncTimestamp and lastSyncDirection", async () => {
      const kv = createMockKV();
      await setSyncState("paste1", 1000, "inbound", kv);

      const raw = kv._store.get("sync:paste1:state");
      expect(raw).toBeDefined();
      const parsed = JSON.parse(raw!);
      expect(parsed.lastSyncTimestamp).toBe(1000);
      expect(parsed.lastSyncDirection).toBe("inbound");
    });

    test("passes TTL when provided", async () => {
      const putCalls: Array<{ key: string; opts: any }> = [];
      const kv = createMockKV();
      const originalPut = kv.put;
      kv.put = async (key: string, value: string, opts?: any) => {
        putCalls.push({ key, opts });
        return originalPut(key, value, opts);
      };

      await setSyncState("paste1", 1000, "outbound", kv, 7200);

      expect(putCalls).toHaveLength(1);
      expect(putCalls[0].opts).toEqual({ expirationTtl: 7200 });
    });
  });

  describe("getSyncState", () => {
    test("returns parsed SyncState object from KV", async () => {
      const kv = createMockKV();
      await setSyncState("paste1", 2000, "outbound", kv);

      const state = await getSyncState("paste1", kv);
      expect(state).not.toBeNull();
      expect(state!.lastSyncTimestamp).toBe(2000);
      expect(state!.lastSyncDirection).toBe("outbound");
    });

    test("returns null when no state exists for a pasteId", async () => {
      const kv = createMockKV();
      const state = await getSyncState("nonexistent", kv);
      expect(state).toBeNull();
    });
  });

  describe("detectConflict", () => {
    const lastSync = 1000;

    test("returns true when both sides modified after last sync", () => {
      const localModifiedAt = 2000; // after sync
      const remoteModifiedAt = "2026-04-01T12:00:00Z"; // after sync (>> 1000ms)
      expect(detectConflict(localModifiedAt, remoteModifiedAt, lastSync)).toBe(true);
    });

    test("returns false when only local side modified", () => {
      const localModifiedAt = 2000; // after sync
      // Remote is 500ms -- before lastSync of 1000ms
      const remoteModifiedAt = new Date(500).toISOString();
      expect(detectConflict(localModifiedAt, remoteModifiedAt, lastSync)).toBe(false);
    });

    test("returns false when only remote side modified", () => {
      const localModifiedAt = 500; // before sync
      const remoteModifiedAt = "2026-04-01T12:00:00Z"; // after sync
      expect(detectConflict(localModifiedAt, remoteModifiedAt, lastSync)).toBe(false);
    });

    test("returns false when neither side modified", () => {
      const localModifiedAt = 500; // before sync
      const remoteModifiedAt = new Date(500).toISOString(); // before sync
      expect(detectConflict(localModifiedAt, remoteModifiedAt, lastSync)).toBe(false);
    });

    test("correctly converts ISO 8601 string to milliseconds for comparison", () => {
      const isoStr = "2026-04-01T12:00:00Z";
      const expectedMs = new Date(isoStr).getTime();
      // lastSync just before this timestamp
      const lastSyncBefore = expectedMs - 1;
      const localAfter = expectedMs + 1;

      expect(detectConflict(localAfter, isoStr, lastSyncBefore)).toBe(true);

      // lastSync exactly at this timestamp -- not greater, so no conflict
      expect(detectConflict(localAfter, isoStr, expectedMs)).toBe(false);
    });
  });

  describe("detectConflicts (batch)", () => {
    test("returns ConflictInfo array for all conflicting pairs", () => {
      const lastSync = 1000;
      const pairs = [
        {
          annotationId: "ann1",
          commentId: "c1",
          localText: "local text 1",
          remoteText: "remote text 1",
          localModifiedAt: 2000,
          remoteModifiedAt: "2026-04-01T12:00:00Z",
        },
        {
          annotationId: "ann2",
          commentId: "c2",
          localText: "local text 2",
          remoteText: "remote text 2",
          localModifiedAt: 500, // before sync -- no conflict
          remoteModifiedAt: "2026-04-01T12:00:00Z",
        },
      ];

      const conflicts = detectConflicts(pairs, lastSync);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].annotationId).toBe("ann1");
      expect(conflicts[0].commentId).toBe("c1");
      expect(conflicts[0].localText).toBe("local text 1");
      expect(conflicts[0].remoteText).toBe("remote text 1");
      expect(conflicts[0].localModifiedAt).toBe(2000);
      expect(conflicts[0].remoteModifiedAt).toBe(new Date("2026-04-01T12:00:00Z").getTime());
      expect(conflicts[0].lastSyncAt).toBe(1000);
    });

    test("returns empty array when no conflicts exist", () => {
      const lastSync = 1000;
      const pairs = [
        {
          annotationId: "ann1",
          commentId: "c1",
          localText: "text",
          remoteText: "text",
          localModifiedAt: 500,
          remoteModifiedAt: new Date(500).toISOString(),
        },
      ];

      const conflicts = detectConflicts(pairs, lastSync);
      expect(conflicts).toHaveLength(0);
    });
  });
});
