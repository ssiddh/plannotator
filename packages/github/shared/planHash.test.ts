import { describe, test, expect } from "bun:test";
import { generatePlanHash } from "./planHash.ts";

describe("generatePlanHash", () => {
  test("returns a 64-char lowercase hex string (full SHA-256)", async () => {
    const hash = await generatePlanHash("# Hello World");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("is deterministic (same input returns same hash)", async () => {
    const hash1 = await generatePlanHash("# Hello World");
    const hash2 = await generatePlanHash("# Hello World");
    expect(hash1).toBe(hash2);
  });

  test("different input produces different hash", async () => {
    const hash1 = await generatePlanHash("# Hello World");
    const hash2 = await generatePlanHash("# Different Plan");
    expect(hash1).not.toBe(hash2);
  });

  test("handles empty string without throwing", async () => {
    const hash = await generatePlanHash("");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
