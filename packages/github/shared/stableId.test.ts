import { describe, test, expect } from "bun:test";
import { generateStableId, resolveCollision } from "./stableId.ts";

describe("generateStableId", () => {
  test("returns a 12-char lowercase hex string", async () => {
    const id = await generateStableId("block-0", "hello world");
    expect(id).toMatch(/^[0-9a-f]{12}$/);
  });

  test("is deterministic (same inputs return same output)", async () => {
    const id1 = await generateStableId("block-0", "hello world");
    const id2 = await generateStableId("block-0", "hello world");
    expect(id1).toBe(id2);
  });

  test("different blockId produces different ID", async () => {
    const id1 = await generateStableId("block-0", "hello world");
    const id2 = await generateStableId("block-1", "hello world");
    expect(id1).not.toBe(id2);
  });

  test("different text produces different ID", async () => {
    const id1 = await generateStableId("block-0", "hello world");
    const id2 = await generateStableId("block-0", "different text");
    expect(id1).not.toBe(id2);
  });

  test("handles empty text without throwing", async () => {
    const id = await generateStableId("block-0", "");
    expect(id).toMatch(/^[0-9a-f]{12}$/);
  });
});

describe("resolveCollision", () => {
  test("returns baseId when no collision", () => {
    const result = resolveCollision("abc123", new Set());
    expect(result).toBe("abc123");
  });

  test("appends -1 on first collision", () => {
    const result = resolveCollision("abc123", new Set(["abc123"]));
    expect(result).toBe("abc123-1");
  });

  test("appends -2 when -1 also exists", () => {
    const result = resolveCollision("abc123", new Set(["abc123", "abc123-1"]));
    expect(result).toBe("abc123-2");
  });

  test("appends -3 when -1 and -2 also exist", () => {
    const result = resolveCollision(
      "abc123",
      new Set(["abc123", "abc123-1", "abc123-2"])
    );
    expect(result).toBe("abc123-3");
  });
});
