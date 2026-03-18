import { describe, it, expect } from "bun:test";
import { exportReviewFeedback } from "./exportFeedback";
import type { CodeAnnotation } from "@plannotator/ui/types";
import type { PRMetadata } from "@plannotator/shared/pr-provider";

const ann = (overrides: Partial<CodeAnnotation> = {}): CodeAnnotation => ({
  id: "1",
  type: "comment",
  filePath: "src/index.ts",
  lineStart: 10,
  lineEnd: 10,
  side: "new",
  text: "This looks wrong",
  createdAt: Date.now(),
  ...overrides,
});

const prMeta: PRMetadata = {
  platform: "github",
  owner: "acme",
  repo: "widgets",
  number: 42,
  title: "fix: broken widget",
  author: "alice",
  baseBranch: "main",
  headBranch: "fix/widget",
  baseSha: "abc123",
  headSha: "def456",
  url: "https://github.com/acme/widgets/pull/42",
};

describe("exportReviewFeedback", () => {
  it("returns empty message for no annotations", () => {
    const result = exportReviewFeedback([]);
    expect(result).toBe("# Code Review\n\nNo feedback provided.");
  });

  it("uses local header when no prMetadata", () => {
    const result = exportReviewFeedback([ann()]);
    expect(result).toStartWith("# Code Review Feedback\n\n");
    expect(result).not.toContain("PR Review");
  });

  it("uses PR header when prMetadata provided", () => {
    const result = exportReviewFeedback([ann()], prMeta);
    expect(result).toStartWith("# PR Review: acme/widgets#42\n\n");
    expect(result).toContain("**fix: broken widget**");
    expect(result).toContain("Branch: `fix/widget` → `main`");
    expect(result).toContain("https://github.com/acme/widgets/pull/42");
  });

  it("still returns empty message with prMetadata but no annotations", () => {
    const result = exportReviewFeedback([], prMeta);
    expect(result).toBe("# Code Review\n\nNo feedback provided.");
  });

  it("groups annotations by file", () => {
    const result = exportReviewFeedback([
      ann({ filePath: "a.ts", lineStart: 5, lineEnd: 5, text: "first" }),
      ann({ filePath: "b.ts", lineStart: 1, lineEnd: 1, text: "second" }),
    ]);
    expect(result).toContain("## a.ts");
    expect(result).toContain("## b.ts");
  });

  it("sorts annotations by line number within a file", () => {
    const result = exportReviewFeedback([
      ann({ lineStart: 20, lineEnd: 20, text: "later" }),
      ann({ lineStart: 5, lineEnd: 5, text: "earlier" }),
    ]);
    const earlierIdx = result.indexOf("earlier");
    const laterIdx = result.indexOf("later");
    expect(earlierIdx).toBeLessThan(laterIdx);
  });

  it("puts file-scoped annotations before line annotations", () => {
    const result = exportReviewFeedback([
      ann({ lineStart: 1, lineEnd: 1, text: "line comment" }),
      ann({ scope: "file", text: "file comment" }),
    ]);
    const fileIdx = result.indexOf("File Comment");
    const lineIdx = result.indexOf("Line 1");
    expect(fileIdx).toBeLessThan(lineIdx);
  });

  it("renders line ranges", () => {
    const result = exportReviewFeedback([
      ann({ lineStart: 10, lineEnd: 15 }),
    ]);
    expect(result).toContain("### Lines 10-15 (new)");
  });

  it("renders single lines", () => {
    const result = exportReviewFeedback([
      ann({ lineStart: 7, lineEnd: 7 }),
    ]);
    expect(result).toContain("### Line 7 (new)");
  });

  it("renders suggested code", () => {
    const result = exportReviewFeedback([
      ann({ suggestedCode: "const x = 1;" }),
    ]);
    expect(result).toContain("**Suggested code:**");
    expect(result).toContain("const x = 1;");
  });

  it("includes side indicator", () => {
    const result = exportReviewFeedback([
      ann({ side: "old", lineStart: 3, lineEnd: 3 }),
    ]);
    expect(result).toContain("### Line 3 (old)");
  });
});
