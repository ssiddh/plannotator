import { describe, test, expect, mock } from "bun:test";
import { performOutboundSync, classifyAnnotations } from "./outboundSync.ts";
import type { PRMetadataWithSync, PRComment } from "../shared/types.ts";
import type { ExportAnnotation, ExportBlock } from "./export.ts";

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

const mockPRMetadata: PRMetadataWithSync = {
  repo: "owner/repo",
  pr_number: 42,
  pr_url: "https://github.com/owner/repo/pull/42",
  created_at: "2026-01-01T00:00:00Z",
  planHash: "abc123hash",
};

function makeAnnotation(overrides: Partial<ExportAnnotation> = {}): ExportAnnotation {
  return {
    id: `ann-${Math.floor(Math.random() * 100000)}`,
    blockId: "block-1",
    type: "COMMENT",
    text: "This looks good",
    originalText: "some original text",
    ...overrides,
  };
}

function makeBlock(overrides: Partial<ExportBlock> = {}): ExportBlock {
  return {
    id: "block-1",
    startLine: 5,
    ...overrides,
  };
}

function makeGitHubComment(overrides: Partial<PRComment> = {}): PRComment {
  return {
    id: `review_${Math.floor(Math.random() * 100000)}`,
    author: { username: "alice", avatar: "https://avatar.test/alice" },
    body: "Looks good",
    line: 5,
    path: "plans/paste1.md",
    created_at: "2026-01-01T12:00:00Z",
    github_url: "https://github.com/owner/repo/pull/42#comment-1",
    comment_type: "review",
    updated_at: "2026-01-01T12:00:00Z",
    ...overrides,
  };
}

// Mock functions
function createMockFetchPRComments(comments: PRComment[]) {
  return async () => ({ comments, failedPages: [] as number[] });
}

function createMockSubmitBatchReview(reviewId: number = 12345) {
  const calls: any[] = [];
  const fn = async (...args: any[]) => {
    calls.push(args);
    return { id: reviewId };
  };
  return { fn, calls };
}

function createMockGithubRequest(responses: Record<string, any> = {}) {
  const calls: any[] = [];
  const fn = async (endpoint: string, _token: string, body?: any) => {
    calls.push({ endpoint, body });
    // Match against registered responses
    for (const [pattern, response] of Object.entries(responses)) {
      if (endpoint.includes(pattern)) {
        return response;
      }
    }
    return {};
  };
  return { fn, calls };
}

function createMockGeneratePlanHash(hash: string = "abc123hash") {
  return async () => hash;
}

describe("performOutboundSync", () => {
  test("1. New annotations (no KV mapping) are classified as new and posted via submitBatchReview", async () => {
    const kv = createMockKV();
    const ann1 = makeAnnotation({ id: "ann-1", text: "Fix this bug", blockId: "block-1" });
    const ann2 = makeAnnotation({ id: "ann-2", text: "Nice approach", blockId: "block-2" });
    const blocks = [makeBlock({ id: "block-1", startLine: 5 }), makeBlock({ id: "block-2", startLine: 10 })];

    const mockSubmit = createMockSubmitBatchReview(12345);
    const mockGithub = createMockGithubRequest({
      "reviews/12345/comments": [
        { id: 999, body: "Fix this bug", path: "plans/paste1.md", line: 5 },
        { id: 1000, body: "Nice approach", path: "plans/paste1.md", line: 10 },
      ],
    });

    const result = await performOutboundSync(
      "paste1",
      [ann1, ann2],
      blocks,
      "# Plan",
      mockPRMetadata,
      "token",
      kv,
      {
        fetchFn: createMockFetchPRComments([]),
        submitBatchReviewFn: mockSubmit.fn as any,
        githubRequestFn: mockGithub.fn as any,
        generatePlanHashFn: createMockGeneratePlanHash("abc123hash"),
      }
    );

    expect(result.syncedCount).toBe(2);
    expect(result.editCount).toBe(0);
    expect(result.skippedCount).toBe(0);
    expect(mockSubmit.calls.length).toBe(1);
  });

  test("2. Edited annotations (KV mapping exists, text differs) are posted as threaded replies with 'Updated: ' prefix", async () => {
    const kv = createMockKV();
    // Pre-populate KV with mapping for ann-1 -> review_500
    await kv.put("sync:paste1:ann:ann-1", "review_500");
    await kv.put("sync:paste1:gh:review_500", "ann-1");

    const ann1 = makeAnnotation({ id: "ann-1", text: "new text", blockId: "block-1" });
    const blocks = [makeBlock({ id: "block-1", startLine: 5 })];

    // GitHub currently has the old text for that comment
    const ghComment = makeGitHubComment({ id: "review_500", body: "old text", line: 5 });

    const mockSubmit = createMockSubmitBatchReview();
    const mockGithub = createMockGithubRequest({});

    const result = await performOutboundSync(
      "paste1",
      [ann1],
      blocks,
      "# Plan",
      mockPRMetadata,
      "token",
      kv,
      {
        fetchFn: createMockFetchPRComments([ghComment]),
        submitBatchReviewFn: mockSubmit.fn as any,
        githubRequestFn: mockGithub.fn as any,
        generatePlanHashFn: createMockGeneratePlanHash("abc123hash"),
      }
    );

    expect(result.editCount).toBe(1);
    expect(result.syncedCount).toBe(0);
    // Check that the reply was posted with "Updated: " prefix
    const replyCalls = mockGithub.calls.filter((c: any) => c.endpoint.includes("replies"));
    expect(replyCalls.length).toBe(1);
    expect(replyCalls[0].body.body).toContain("Updated: ");
  });

  test("3. Already-synced unchanged annotations (KV mapping exists, text matches) are skipped", async () => {
    const kv = createMockKV();
    // Pre-populate KV
    await kv.put("sync:paste1:ann:ann-1", "review_500");
    await kv.put("sync:paste1:gh:review_500", "ann-1");

    const ann1 = makeAnnotation({ id: "ann-1", text: "same text", blockId: "block-1" });
    const blocks = [makeBlock({ id: "block-1", startLine: 5 })];

    // GitHub has the same text
    const ghComment = makeGitHubComment({ id: "review_500", body: "same text", line: 5 });

    const mockSubmit = createMockSubmitBatchReview();
    const mockGithub = createMockGithubRequest({});

    const result = await performOutboundSync(
      "paste1",
      [ann1],
      blocks,
      "# Plan",
      mockPRMetadata,
      "token",
      kv,
      {
        fetchFn: createMockFetchPRComments([ghComment]),
        submitBatchReviewFn: mockSubmit.fn as any,
        githubRequestFn: mockGithub.fn as any,
        generatePlanHashFn: createMockGeneratePlanHash("abc123hash"),
      }
    );

    expect(result.skippedCount).toBe(1);
    expect(result.syncedCount).toBe(0);
    expect(result.editCount).toBe(0);
    // submitBatchReview should not be called (no new annotations)
    expect(mockSubmit.calls.length).toBe(0);
  });

  test("4. GLOBAL_COMMENT annotations are filtered out with warning", async () => {
    const kv = createMockKV();
    const globalAnn1 = makeAnnotation({ id: "ann-g1", type: "GLOBAL_COMMENT", text: "General feedback" });
    const globalAnn2 = makeAnnotation({ id: "ann-g2", type: "GLOBAL_COMMENT", text: "More feedback" });
    const lineAnn = makeAnnotation({ id: "ann-1", text: "Line comment", blockId: "block-1" });
    const blocks = [makeBlock({ id: "block-1", startLine: 5 })];

    const mockSubmit = createMockSubmitBatchReview(12345);
    const mockGithub = createMockGithubRequest({
      "reviews/12345/comments": [
        { id: 999, body: "Line comment", path: "plans/paste1.md", line: 5 },
      ],
    });

    const result = await performOutboundSync(
      "paste1",
      [globalAnn1, globalAnn2, lineAnn],
      blocks,
      "# Plan",
      mockPRMetadata,
      "token",
      kv,
      {
        fetchFn: createMockFetchPRComments([]),
        submitBatchReviewFn: mockSubmit.fn as any,
        githubRequestFn: mockGithub.fn as any,
        generatePlanHashFn: createMockGeneratePlanHash("abc123hash"),
      }
    );

    expect(result.warnings.some((w: string) => w.includes("2 global annotations skipped"))).toBe(true);
    // Only the line annotation should be synced
    expect(result.syncedCount).toBe(1);
  });

  test("5. Annotations with images sync text-only with warning", async () => {
    const kv = createMockKV();
    const annWithImages = makeAnnotation({
      id: "ann-1",
      text: "See attached",
      blockId: "block-1",
      images: [{ path: "/tmp/img.png", name: "screenshot" }],
    });
    const annWithoutImages = makeAnnotation({
      id: "ann-2",
      text: "No image",
      blockId: "block-1",
    });
    const blocks = [makeBlock({ id: "block-1", startLine: 5 })];

    const mockSubmit = createMockSubmitBatchReview(12345);
    const mockGithub = createMockGithubRequest({
      "reviews/12345/comments": [
        { id: 999, body: "See attached", path: "plans/paste1.md", line: 5 },
        { id: 1000, body: "No image", path: "plans/paste1.md", line: 5 },
      ],
    });

    const result = await performOutboundSync(
      "paste1",
      [annWithImages, annWithoutImages],
      blocks,
      "# Plan",
      mockPRMetadata,
      "token",
      kv,
      {
        fetchFn: createMockFetchPRComments([]),
        submitBatchReviewFn: mockSubmit.fn as any,
        githubRequestFn: mockGithub.fn as any,
        generatePlanHashFn: createMockGeneratePlanHash("abc123hash"),
      }
    );

    expect(result.warnings.some((w: string) => w.includes("1 annotations with images synced text only"))).toBe(true);
    // Both should still be synced (text-only)
    expect(result.syncedCount).toBe(2);
  });

  test("6. Drift detection returns hasDrift=true when plan hash differs", async () => {
    const kv = createMockKV();
    const ann1 = makeAnnotation({ id: "ann-1", blockId: "block-1" });
    const blocks = [makeBlock({ id: "block-1", startLine: 5 })];

    const mockSubmit = createMockSubmitBatchReview(12345);
    const mockGithub = createMockGithubRequest({
      "reviews/12345/comments": [
        { id: 999, body: "This looks good", path: "plans/paste1.md", line: 5 },
      ],
    });

    // Plan hash is "different_hash" but prMetadata.planHash is "abc123hash"
    const result = await performOutboundSync(
      "paste1",
      [ann1],
      blocks,
      "# Modified Plan",
      mockPRMetadata,
      "token",
      kv,
      {
        fetchFn: createMockFetchPRComments([]),
        submitBatchReviewFn: mockSubmit.fn as any,
        githubRequestFn: mockGithub.fn as any,
        generatePlanHashFn: createMockGeneratePlanHash("different_hash"),
      }
    );

    expect(result.hasDrift).toBe(true);
  });

  test("7. KV mappings are stored after batch review via follow-up review comments fetch", async () => {
    const kv = createMockKV();
    const ann1 = makeAnnotation({ id: "ann-1", text: "test comment", blockId: "block-1" });
    const blocks = [makeBlock({ id: "block-1", startLine: 5 })];

    const mockSubmit = createMockSubmitBatchReview(12345);
    const mockGithub = createMockGithubRequest({
      "reviews/12345/comments": [
        { id: 999, body: "test comment", path: "plans/paste1.md", line: 5 },
      ],
    });

    await performOutboundSync(
      "paste1",
      [ann1],
      blocks,
      "# Plan",
      mockPRMetadata,
      "token",
      kv,
      {
        fetchFn: createMockFetchPRComments([]),
        submitBatchReviewFn: mockSubmit.fn as any,
        githubRequestFn: mockGithub.fn as any,
        generatePlanHashFn: createMockGeneratePlanHash("abc123hash"),
      }
    );

    // KV should now have the mapping for ann-1 -> 999
    const commentId = await kv.get("sync:paste1:ann:ann-1");
    expect(commentId).toBe("999");
    const annotationId = await kv.get("sync:paste1:gh:999");
    expect(annotationId).toBe("ann-1");
  });

  test("8. Sync state updated to 'outbound' after successful sync", async () => {
    const kv = createMockKV();
    const ann1 = makeAnnotation({ id: "ann-1", blockId: "block-1" });
    const blocks = [makeBlock({ id: "block-1", startLine: 5 })];

    const mockSubmit = createMockSubmitBatchReview(12345);
    const mockGithub = createMockGithubRequest({
      "reviews/12345/comments": [
        { id: 999, body: "This looks good", path: "plans/paste1.md", line: 5 },
      ],
    });

    await performOutboundSync(
      "paste1",
      [ann1],
      blocks,
      "# Plan",
      mockPRMetadata,
      "token",
      kv,
      {
        fetchFn: createMockFetchPRComments([]),
        submitBatchReviewFn: mockSubmit.fn as any,
        githubRequestFn: mockGithub.fn as any,
        generatePlanHashFn: createMockGeneratePlanHash("abc123hash"),
      }
    );

    const stateRaw = await kv.get("sync:paste1:state");
    expect(stateRaw).not.toBeNull();
    const state = JSON.parse(stateRaw!);
    expect(state.lastSyncDirection).toBe("outbound");
    expect(typeof state.lastSyncTimestamp).toBe("number");
  });

  test("9. DELETION annotations produce suggestion blocks (reuses mapAnnotationsToComments)", async () => {
    const kv = createMockKV();
    const deletionAnn = makeAnnotation({
      id: "ann-del-1",
      type: "DELETION",
      originalText: "delete this line",
      blockId: "block-1",
    });
    const blocks = [makeBlock({ id: "block-1", startLine: 5 })];

    const mockSubmit = createMockSubmitBatchReview(12345);
    const mockGithub = createMockGithubRequest({
      "reviews/12345/comments": [
        { id: 999, body: "> delete this line\n\n```suggestion\n\n```", path: "plans/paste1.md", line: 5 },
      ],
    });

    const result = await performOutboundSync(
      "paste1",
      [deletionAnn],
      blocks,
      "# Plan",
      mockPRMetadata,
      "token",
      kv,
      {
        fetchFn: createMockFetchPRComments([]),
        submitBatchReviewFn: mockSubmit.fn as any,
        githubRequestFn: mockGithub.fn as any,
        generatePlanHashFn: createMockGeneratePlanHash("abc123hash"),
      }
    );

    expect(result.syncedCount).toBe(1);
    // The submit call should have included a suggestion block comment
    const submitArgs = mockSubmit.calls[0];
    const comments = submitArgs[4]; // 5th arg = comments array
    expect(comments[0].body).toContain("```suggestion");
  });

  test("10. Summary annotations are separated from regular annotations and posted as thread replies", async () => {
    const kv = createMockKV();
    // Pre-populate KV: the parent annotation "ann-parent" is already synced as review_700
    await kv.put("sync:paste1:ann:ann-parent", "review_700");
    await kv.put("sync:paste1:gh:review_700", "ann-parent");

    const regularAnn = makeAnnotation({ id: "ann-1", text: "Regular comment", blockId: "block-1" });
    const summaryAnn = makeAnnotation({
      id: "ann-summary-1",
      text: "Thread resolved: decided to keep current approach",
      blockId: "block-1",
      isSummary: true,
      summarizesThreadId: "ann-parent",
    } as any);

    const blocks = [makeBlock({ id: "block-1", startLine: 5 })];

    const mockSubmit = createMockSubmitBatchReview(12345);
    const mockGithub = createMockGithubRequest({
      // Review comments fetch for regular annotation mapping
      "reviews/12345/comments": [
        { id: 999, body: "Regular comment", path: "plans/paste1.md", line: 5 },
      ],
      // Reply endpoint for summary
      "comments/700/replies": { id: 800, body: "Thread resolved: decided to keep current approach" },
    });

    // Mock fetchReviewThreads to return thread info for parent comment 700
    const mockFetchReviewThreads = async () => {
      const map = new Map<number, { threadNodeId: string; isResolved: boolean }>();
      map.set(700, { threadNodeId: "THREAD_NODE_1", isResolved: false });
      return map;
    };

    const mockResolveReviewThread = async () => true;

    const result = await performOutboundSync(
      "paste1",
      [regularAnn, summaryAnn],
      blocks,
      "# Plan",
      mockPRMetadata,
      "token",
      kv,
      {
        fetchFn: createMockFetchPRComments([]),
        submitBatchReviewFn: mockSubmit.fn as any,
        githubRequestFn: mockGithub.fn as any,
        generatePlanHashFn: createMockGeneratePlanHash("abc123hash"),
        fetchReviewThreadsFn: mockFetchReviewThreads as any,
        resolveReviewThreadFn: mockResolveReviewThread as any,
      }
    );

    // Regular annotation posted via batch review
    expect(result.syncedCount).toBe(1);
    // Summary posted as reply
    expect(result.summaryCount).toBe(1);
    // Reply endpoint called for summary
    const replyCalls = mockGithub.calls.filter((c: any) => c.endpoint.includes("comments/700/replies"));
    expect(replyCalls.length).toBe(1);
  });

  test("11. Summary reply triggers resolveReviewThread after successful post", async () => {
    const kv = createMockKV();
    await kv.put("sync:paste1:ann:ann-parent", "review_700");
    await kv.put("sync:paste1:gh:review_700", "ann-parent");

    const summaryAnn = makeAnnotation({
      id: "ann-summary-1",
      text: "Summary of discussion",
      blockId: "block-1",
      isSummary: true,
      summarizesThreadId: "ann-parent",
    } as any);

    const blocks = [makeBlock({ id: "block-1", startLine: 5 })];
    const mockSubmit = createMockSubmitBatchReview();
    const mockGithub = createMockGithubRequest({
      "comments/700/replies": { id: 800 },
    });

    let resolveCalledWith: string | null = null;
    const mockResolveReviewThread = async (threadNodeId: string) => {
      resolveCalledWith = threadNodeId;
      return true;
    };

    const mockFetchReviewThreads = async () => {
      const map = new Map<number, { threadNodeId: string; isResolved: boolean }>();
      map.set(700, { threadNodeId: "THREAD_NODE_1", isResolved: false });
      return map;
    };

    await performOutboundSync(
      "paste1",
      [summaryAnn],
      blocks,
      "# Plan",
      mockPRMetadata,
      "token",
      kv,
      {
        fetchFn: createMockFetchPRComments([]),
        submitBatchReviewFn: mockSubmit.fn as any,
        githubRequestFn: mockGithub.fn as any,
        generatePlanHashFn: createMockGeneratePlanHash("abc123hash"),
        fetchReviewThreadsFn: mockFetchReviewThreads as any,
        resolveReviewThreadFn: mockResolveReviewThread as any,
      }
    );

    expect(resolveCalledWith).toBe("THREAD_NODE_1");
  });

  test("12. Resolution failure does not roll back summary reply (D-11/D-34)", async () => {
    const kv = createMockKV();
    await kv.put("sync:paste1:ann:ann-parent", "review_700");
    await kv.put("sync:paste1:gh:review_700", "ann-parent");

    const summaryAnn = makeAnnotation({
      id: "ann-summary-1",
      text: "Summary text",
      blockId: "block-1",
      isSummary: true,
      summarizesThreadId: "ann-parent",
    } as any);

    const blocks = [makeBlock({ id: "block-1", startLine: 5 })];
    const mockSubmit = createMockSubmitBatchReview();
    const mockGithub = createMockGithubRequest({
      "comments/700/replies": { id: 800 },
    });

    const mockResolveReviewThread = async () => false; // Resolution fails
    const mockFetchReviewThreads = async () => {
      const map = new Map<number, { threadNodeId: string; isResolved: boolean }>();
      map.set(700, { threadNodeId: "THREAD_NODE_1", isResolved: false });
      return map;
    };

    const result = await performOutboundSync(
      "paste1",
      [summaryAnn],
      blocks,
      "# Plan",
      mockPRMetadata,
      "token",
      kv,
      {
        fetchFn: createMockFetchPRComments([]),
        submitBatchReviewFn: mockSubmit.fn as any,
        githubRequestFn: mockGithub.fn as any,
        generatePlanHashFn: createMockGeneratePlanHash("abc123hash"),
        fetchReviewThreadsFn: mockFetchReviewThreads as any,
        resolveReviewThreadFn: mockResolveReviewThread as any,
      }
    );

    // Summary still counted as successful
    expect(result.summaryCount).toBe(1);
    // Warning about resolution failure
    expect(result.warnings.some((w: string) => w.includes("thread not resolved"))).toBe(true);
  });

  test("13. Summary sync fails gracefully when parent has no GitHub mapping", async () => {
    const kv = createMockKV();
    // No mapping for ann-parent -- not synced to GitHub

    const summaryAnn = makeAnnotation({
      id: "ann-summary-1",
      text: "Summary text",
      blockId: "block-1",
      isSummary: true,
      summarizesThreadId: "ann-parent",
    } as any);

    const blocks = [makeBlock({ id: "block-1", startLine: 5 })];
    const mockSubmit = createMockSubmitBatchReview();
    const mockGithub = createMockGithubRequest({});

    const result = await performOutboundSync(
      "paste1",
      [summaryAnn],
      blocks,
      "# Plan",
      mockPRMetadata,
      "token",
      kv,
      {
        fetchFn: createMockFetchPRComments([]),
        submitBatchReviewFn: mockSubmit.fn as any,
        githubRequestFn: mockGithub.fn as any,
        generatePlanHashFn: createMockGeneratePlanHash("abc123hash"),
      }
    );

    // Summary not synced
    expect(result.summaryCount).toBe(0);
    // Error message about parent not synced
    expect(result.warnings.some((w: string) => w.includes("parent not synced"))).toBe(true);
  });

  test("14. Edit reply uses correct endpoint with stripped 'review_' prefix", async () => {
    const kv = createMockKV();
    // Pre-populate KV: ann-1 -> review_500
    await kv.put("sync:paste1:ann:ann-1", "review_500");
    await kv.put("sync:paste1:gh:review_500", "ann-1");

    const ann1 = makeAnnotation({ id: "ann-1", text: "updated text", blockId: "block-1" });
    const blocks = [makeBlock({ id: "block-1", startLine: 5 })];

    // GitHub has old text for review_500
    const ghComment = makeGitHubComment({ id: "review_500", body: "old text", line: 5 });

    const mockSubmit = createMockSubmitBatchReview();
    const mockGithub = createMockGithubRequest({});

    await performOutboundSync(
      "paste1",
      [ann1],
      blocks,
      "# Plan",
      mockPRMetadata,
      "token",
      kv,
      {
        fetchFn: createMockFetchPRComments([ghComment]),
        submitBatchReviewFn: mockSubmit.fn as any,
        githubRequestFn: mockGithub.fn as any,
        generatePlanHashFn: createMockGeneratePlanHash("abc123hash"),
      }
    );

    // Should call POST with numeric ID 500 (stripped "review_" prefix)
    const replyCalls = mockGithub.calls.filter((c: any) =>
      c.endpoint.includes("/replies")
    );
    expect(replyCalls.length).toBe(1);
    expect(replyCalls[0].endpoint).toContain("/comments/500/replies");
    expect(replyCalls[0].endpoint).not.toContain("review_");
    expect(replyCalls[0].body.body).toBe("Updated: updated text");
  });
});
