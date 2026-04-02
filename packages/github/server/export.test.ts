import { describe, test, expect } from "bun:test";
import { generatePlanHash } from "../shared/planHash.ts";
import { mapAnnotationsToComments } from "./export.ts";

describe("generatePlanHash (integration)", () => {
  test("returns 64-char hex string", async () => {
    const hash = await generatePlanHash("# Test Plan");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("is deterministic", async () => {
    const hash1 = await generatePlanHash("# Test Plan");
    const hash2 = await generatePlanHash("# Test Plan");
    expect(hash1).toBe(hash2);
  });
});

describe("mapAnnotationsToComments", () => {
  const blocks = [
    { id: "block-0", startLine: 1 },
    { id: "block-1", startLine: 5 },
    { id: "block-2", startLine: 10 },
  ];

  test("COMMENT annotation maps to line comment with text", () => {
    const annotations = [
      {
        id: "ann-1",
        blockId: "block-1",
        type: "COMMENT" as const,
        text: "This needs clarification",
        originalText: "some selected text",
      },
    ];

    const result = mapAnnotationsToComments(annotations, blocks, "plans/abc.md");

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      path: "plans/abc.md",
      line: 5,
      side: "RIGHT",
      body: "This needs clarification",
    });
  });

  test("DELETION annotation produces suggestion block", () => {
    const annotations = [
      {
        id: "ann-2",
        blockId: "block-1",
        type: "DELETION" as const,
        originalText: "text to delete",
      },
    ];

    const result = mapAnnotationsToComments(annotations, blocks, "plans/abc.md");

    expect(result).toHaveLength(1);
    expect(result[0].body).toContain("```suggestion");
    expect(result[0].body).toContain("text to delete");
    expect(result[0].line).toBe(5);
    expect(result[0].side).toBe("RIGHT");
  });

  test("GLOBAL_COMMENT annotation is filtered out", () => {
    const annotations = [
      {
        id: "ann-3",
        blockId: "block-0",
        type: "GLOBAL_COMMENT" as const,
        text: "General feedback",
        originalText: "",
      },
    ];

    const result = mapAnnotationsToComments(annotations, blocks, "plans/abc.md");

    expect(result).toHaveLength(0);
  });

  test("missing block defaults to line 1", () => {
    const annotations = [
      {
        id: "ann-4",
        blockId: "nonexistent-block",
        type: "COMMENT" as const,
        text: "Comment on missing block",
        originalText: "some text",
      },
    ];

    const result = mapAnnotationsToComments(annotations, blocks, "plans/abc.md");

    expect(result).toHaveLength(1);
    expect(result[0].line).toBe(1);
  });

  test("annotation with images exports text only (D-07)", () => {
    const annotations = [
      {
        id: "ann-5",
        blockId: "block-2",
        type: "COMMENT" as const,
        text: "See the attached image",
        originalText: "some text",
        images: [{ path: "/tmp/screenshot.png", name: "screenshot" }],
      },
    ];

    const result = mapAnnotationsToComments(annotations, blocks, "plans/abc.md");

    expect(result).toHaveLength(1);
    expect(result[0].body).toBe("See the attached image");
    expect(result[0].line).toBe(10);
    expect(result[0].body).not.toContain("screenshot");
    expect(result[0].body).not.toContain("/tmp/");
  });

  test("multiple annotations on same line each get their own comment (D-08)", () => {
    const annotations = [
      {
        id: "ann-6",
        blockId: "block-1",
        type: "COMMENT" as const,
        text: "First comment",
        originalText: "text",
      },
      {
        id: "ann-7",
        blockId: "block-1",
        type: "COMMENT" as const,
        text: "Second comment",
        originalText: "text",
      },
    ];

    const result = mapAnnotationsToComments(annotations, blocks, "plans/abc.md");

    expect(result).toHaveLength(2);
    expect(result[0].body).toBe("First comment");
    expect(result[1].body).toBe("Second comment");
  });
});

describe("submitBatchReview", () => {
  test("placeholder for Task 2", () => {
    expect(true).toBe(true);
  });
});

describe("exportPlanWithAnnotations", () => {
  test("placeholder for Task 2", () => {
    expect(true).toBe(true);
  });
});
