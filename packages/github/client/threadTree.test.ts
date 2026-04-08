import { describe, test, expect } from "bun:test";
import { buildThreadTree, formatGitHubTimestamp } from "./threadTree.ts";
import { AnnotationType } from "../../ui/types.ts";
import type { Block } from "../../ui/types.ts";
import type { PRCommentForClient } from "../shared/types.ts";

/** Helper to create a PRCommentForClient with sensible defaults */
function makeComment(
  overrides: Partial<PRCommentForClient> & {
    githubCommentId: string;
    id: string;
  }
): PRCommentForClient {
  return {
    blockId: "block-1",
    type: "COMMENT",
    text: "Comment body",
    originalText: "[Line 1]",
    author: "testuser",
    avatarUrl: "https://avatars.githubusercontent.com/u/1",
    githubCommentUrl: "https://github.com/org/repo/pull/1#comment-1",
    createdAt: "2026-04-01T10:00:00Z",
    updatedAt: "2026-04-01T10:00:00Z",
    inReplyToId: null,
    commentType: "review",
    line: 5,
    ...overrides,
  };
}

const testBlocks: Block[] = [
  {
    id: "block-1",
    type: "heading",
    content: "# Title",
    level: 1,
    order: 0,
    startLine: 1,
  },
  {
    id: "block-2",
    type: "paragraph",
    content: "Some content",
    order: 1,
    startLine: 3,
  },
  {
    id: "block-3",
    type: "paragraph",
    content: "More content",
    order: 2,
    startLine: 6,
  },
];

describe("buildThreadTree", () => {
  test("flat comments become root annotations", () => {
    const comments: PRCommentForClient[] = [
      makeComment({ id: "ann-1", githubCommentId: "gc-1" }),
      makeComment({ id: "ann-2", githubCommentId: "gc-2" }),
      makeComment({ id: "ann-3", githubCommentId: "gc-3" }),
    ];

    const result = buildThreadTree(comments, testBlocks);
    expect(result).toHaveLength(3);
    // All should be roots (no children)
    for (const ann of result) {
      expect(ann.children).toBeUndefined();
    }
  });

  test("replies nested under parent (SYNC-IN-05)", () => {
    const comments: PRCommentForClient[] = [
      makeComment({ id: "ann-1", githubCommentId: "review_1" }),
      makeComment({
        id: "ann-2",
        githubCommentId: "review_2",
        inReplyToId: "review_1",
        createdAt: "2026-04-01T11:00:00Z",
      }),
    ];

    const result = buildThreadTree(comments, testBlocks);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("ann-1");
    expect(result[0].children).toHaveLength(1);
    expect(result[0].children![0].id).toBe("ann-2");
  });

  test("children sorted chronologically (SYNC-IN-06)", () => {
    const comments: PRCommentForClient[] = [
      makeComment({ id: "ann-1", githubCommentId: "parent" }),
      makeComment({
        id: "ann-3",
        githubCommentId: "child-3",
        inReplyToId: "parent",
        createdAt: "2026-04-01T14:00:00Z",
      }),
      makeComment({
        id: "ann-2",
        githubCommentId: "child-1",
        inReplyToId: "parent",
        createdAt: "2026-04-01T11:00:00Z",
      }),
      makeComment({
        id: "ann-4",
        githubCommentId: "child-2",
        inReplyToId: "parent",
        createdAt: "2026-04-01T12:00:00Z",
      }),
    ];

    const result = buildThreadTree(comments, testBlocks);
    expect(result).toHaveLength(1);
    expect(result[0].children).toHaveLength(3);
    // Should be sorted oldest first
    const children = result[0].children!;
    expect(children[0].id).toBe("ann-2"); // 11:00
    expect(children[1].id).toBe("ann-4"); // 12:00
    expect(children[2].id).toBe("ann-3"); // 14:00
  });

  test("orphaned replies become roots", () => {
    const comments: PRCommentForClient[] = [
      makeComment({
        id: "ann-1",
        githubCommentId: "gc-1",
        inReplyToId: "nonexistent_parent",
      }),
    ];

    const result = buildThreadTree(comments, testBlocks);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("ann-1");
  });

  test("issue comments become GLOBAL_COMMENT", () => {
    const comments: PRCommentForClient[] = [
      makeComment({
        id: "ann-1",
        githubCommentId: "gc-1",
        commentType: "issue",
        line: null,
      }),
    ];

    const result = buildThreadTree(comments, testBlocks);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe(AnnotationType.GLOBAL_COMMENT);
    expect(result[0].blockId).toBe("global");
  });

  test("line mapping uses mapLineToBlock", () => {
    const comments: PRCommentForClient[] = [
      makeComment({
        id: "ann-1",
        githubCommentId: "gc-1",
        line: 5,
      }),
    ];

    const result = buildThreadTree(comments, testBlocks);
    expect(result).toHaveLength(1);
    // Line 5 is between block-2 (startLine 3) and block-3 (startLine 6)
    // mapLineToBlock should return block-2
    expect(result[0].blockId).toBe("block-2");
  });

  test("unmappable lines fallback to global (D-18)", () => {
    const emptyBlocks: Block[] = [];

    const comments: PRCommentForClient[] = [
      makeComment({
        id: "ann-1",
        githubCommentId: "gc-1",
        line: 999,
      }),
    ];

    const result = buildThreadTree(comments, emptyBlocks);
    expect(result).toHaveLength(1);
    // With empty blocks, mapLineToBlock returns null, so fallback to "global"
    expect(result[0].blockId).toBe("global");
  });

  test("all annotations have source github-pr (SYNC-IN-08)", () => {
    const comments: PRCommentForClient[] = [
      makeComment({ id: "ann-1", githubCommentId: "gc-1" }),
      makeComment({
        id: "ann-2",
        githubCommentId: "gc-2",
        commentType: "issue",
        line: null,
      }),
      makeComment({
        id: "ann-3",
        githubCommentId: "gc-3",
        inReplyToId: "gc-1",
      }),
    ];

    const result = buildThreadTree(comments, testBlocks);
    // Check all roots and their children
    function checkSource(annotations: typeof result): void {
      for (const ann of annotations) {
        expect(ann.source).toBe("github-pr");
        if (ann.children) {
          checkSource(ann.children);
        }
      }
    }
    checkSource(result);
  });

  test("formatGitHubTimestamp returns non-empty string", () => {
    const result = formatGitHubTimestamp("2026-04-03T14:30:00Z");
    expect(result.length).toBeGreaterThan(0);
    // Should contain some recognizable date parts
    expect(result).toContain("Apr");
    expect(result).toContain("3");
  });

  test("duplicate githubCommentId entries deduplicated", () => {
    const comments: PRCommentForClient[] = [
      makeComment({
        id: "ann-1",
        githubCommentId: "review_1",
        text: "First version",
      }),
      makeComment({
        id: "ann-2",
        githubCommentId: "review_1",
        text: "Second version (same githubCommentId)",
      }),
    ];

    const result = buildThreadTree(comments, testBlocks);
    // Map keyed by githubCommentId deduplicates -- only 1 annotation
    expect(result).toHaveLength(1);
    // The second one overwrites the first
    expect(result[0].text).toBe("Second version (same githubCommentId)");
  });

  test("null line comments get blockId global", () => {
    const comments: PRCommentForClient[] = [
      makeComment({
        id: "ann-1",
        githubCommentId: "gc-1",
        line: null,
        commentType: "review",
      }),
    ];

    const result = buildThreadTree(comments, testBlocks);
    expect(result[0].blockId).toBe("global");
  });

  test("annotations include githubCommentUrl", () => {
    const url = "https://github.com/org/repo/pull/1#discussion_r123";
    const comments: PRCommentForClient[] = [
      makeComment({
        id: "ann-1",
        githubCommentId: "gc-1",
        githubCommentUrl: url,
      }),
    ];

    const result = buildThreadTree(comments, testBlocks);
    expect(result[0].githubCommentUrl).toBe(url);
  });
});
