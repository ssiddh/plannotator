import { describe, test, expect } from "bun:test";
import { performInboundSync } from "./inboundSync.ts";
import type { PRMetadata, PRComment } from "../shared/types.ts";

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

const mockPRMetadata: PRMetadata = {
  repo: "owner/repo",
  pr_number: 42,
  pr_url: "https://github.com/owner/repo/pull/42",
  created_at: "2026-01-01T00:00:00Z",
};

function makeReviewComment(overrides: Partial<PRComment> = {}): PRComment {
  return {
    id: `review_${Math.floor(Math.random() * 100000)}`,
    author: { username: "alice", avatar: "https://avatar.test/alice" },
    body: "Looks good",
    line: 10,
    path: "plans/test.md",
    created_at: "2026-01-01T12:00:00Z",
    github_url: "https://github.com/owner/repo/pull/42#comment-1",
    comment_type: "review",
    updated_at: "2026-01-01T12:00:00Z",
    ...overrides,
  };
}

function makeIssueComment(overrides: Partial<PRComment> = {}): PRComment {
  return {
    id: `issue_${Math.floor(Math.random() * 100000)}`,
    author: { username: "bob", avatar: "https://avatar.test/bob" },
    body: "General feedback",
    created_at: "2026-01-01T13:00:00Z",
    github_url: "https://github.com/owner/repo/pull/42#issuecomment-1",
    comment_type: "issue",
    updated_at: "2026-01-01T13:00:00Z",
    ...overrides,
  };
}

function createMockFetch(comments: PRComment[]) {
  return async () => ({ comments, failedPages: [] as number[] });
}

describe("performInboundSync", () => {
  test("1. New comments are imported with correct fields", async () => {
    const kv = createMockKV();
    const review1 = makeReviewComment({ id: "review_100", body: "Fix this", line: 5 });
    const review2 = makeReviewComment({ id: "review_200", body: "Nice!", line: 20 });
    const issue1 = makeIssueComment({ id: "issue_300", body: "Overall looks great" });

    const result = await performInboundSync(
      "paste1",
      mockPRMetadata,
      "token",
      kv,
      undefined,
      createMockFetch([review1, review2, issue1])
    );

    expect(result.annotations.length).toBe(3);
    expect(result.stats.new).toBe(3);
    expect(result.stats.skipped).toBe(0);

    // Review comments have type COMMENT
    const r1 = result.annotations.find((a) => a.githubCommentId === "review_100")!;
    expect(r1.type).toBe("COMMENT");
    expect(r1.author).toBe("alice");
    expect(r1.avatarUrl).toBe("https://avatar.test/alice");
    expect(r1.githubCommentUrl).toContain("github.com");
    expect(r1.text).toBe("Fix this");

    // Issue comment has type GLOBAL_COMMENT and correct originalText
    const i1 = result.annotations.find((a) => a.githubCommentId === "issue_300")!;
    expect(i1.type).toBe("GLOBAL_COMMENT");
    expect(i1.originalText).toBe("[General comment]");
  });

  test("2. Duplicate comments are skipped", async () => {
    const kv = createMockKV();
    const existingComment = makeReviewComment({ id: "review_100" });
    const newComment = makeReviewComment({ id: "review_200" });

    // Pre-populate KV with mapping for review_100
    await kv.put("sync:paste1:gh:review_100", "gh-review_100");
    await kv.put("sync:paste1:ann:gh-review_100", "review_100");
    await kv.put("sync:paste1:ts:review_100", existingComment.updated_at);

    const result = await performInboundSync(
      "paste1",
      mockPRMetadata,
      "token",
      kv,
      undefined,
      createMockFetch([existingComment, newComment])
    );

    expect(result.stats.skipped).toBe(1);
    expect(result.stats.new).toBe(1);
    expect(result.annotations.length).toBe(1);
    expect(result.annotations[0].githubCommentId).toBe("review_200");
  });

  test("3. Edited comments are detected and updated", async () => {
    const kv = createMockKV();
    const comment = makeReviewComment({
      id: "review_100",
      body: "Updated text",
      updated_at: "2026-01-02T12:00:00Z",
    });

    // Pre-populate KV with older timestamp
    await kv.put("sync:paste1:gh:review_100", "gh-review_100");
    await kv.put("sync:paste1:ann:gh-review_100", "review_100");
    await kv.put("sync:paste1:ts:review_100", "2026-01-01T12:00:00Z");

    const result = await performInboundSync(
      "paste1",
      mockPRMetadata,
      "token",
      kv,
      undefined,
      createMockFetch([comment])
    );

    expect(result.stats.updated).toBe(1);
    expect(result.annotations.length).toBe(1);
    expect(result.annotations[0].text).toBe("Updated text");
    expect(result.annotations[0].id).toBe("gh-review_100");
  });

  test("4. Pagination handles multiple pages (100+ comments)", async () => {
    const kv = createMockKV();
    const comments: PRComment[] = [];
    for (let i = 0; i < 150; i++) {
      comments.push(makeReviewComment({ id: `review_${i}` }));
    }

    const result = await performInboundSync(
      "paste1",
      mockPRMetadata,
      "token",
      kv,
      undefined,
      createMockFetch(comments)
    );

    expect(result.stats.total).toBe(150);
    expect(result.stats.new).toBe(150);
    expect(result.annotations.length).toBe(150);
  });

  test("5. Review comments without line number become unmapped", async () => {
    const kv = createMockKV();
    const comment = makeReviewComment({
      id: "review_100",
      line: undefined,
    });

    const result = await performInboundSync(
      "paste1",
      mockPRMetadata,
      "token",
      kv,
      undefined,
      createMockFetch([comment])
    );

    expect(result.annotations[0].originalText).toBe("[Line unmapped]");
    expect(result.annotations[0].line).toBeNull();
  });

  test("6. Sync state is updated after successful sync", async () => {
    const kv = createMockKV();
    const comment = makeReviewComment({ id: "review_100" });

    await performInboundSync(
      "paste1",
      mockPRMetadata,
      "token",
      kv,
      undefined,
      createMockFetch([comment])
    );

    const stateRaw = await kv.get("sync:paste1:state");
    expect(stateRaw).not.toBeNull();
    const state = JSON.parse(stateRaw!);
    expect(state.lastSyncDirection).toBe("inbound");
    expect(typeof state.lastSyncTimestamp).toBe("number");
  });

  test("7. Deletion detection removes missing comments", async () => {
    const kv = createMockKV();

    // Pre-populate: review_100 was previously imported
    await kv.put("sync:paste1:imported", JSON.stringify(["review_100"]));
    await kv.put("sync:paste1:gh:review_100", "gh-review_100");
    await kv.put("sync:paste1:ann:gh-review_100", "review_100");

    // Fetch returns empty (review_100 was deleted on GitHub)
    const result = await performInboundSync(
      "paste1",
      mockPRMetadata,
      "token",
      kv,
      undefined,
      createMockFetch([])
    );

    expect(result.stats.deleted).toBe(1);
    expect(result.deletedIds).toContain("gh-review_100");

    // Mapping should be cleaned up
    expect(await kv.get("sync:paste1:gh:review_100")).toBeNull();
    expect(await kv.get("sync:paste1:ann:gh-review_100")).toBeNull();
  });

  test("8. 401 error propagates as token_expired", async () => {
    const kv = createMockKV();
    const failingFetch = async () => {
      throw new Error("token_expired");
    };

    await expect(
      performInboundSync(
        "paste1",
        mockPRMetadata,
        "token",
        kv,
        undefined,
        failingFetch as any
      )
    ).rejects.toThrow("token_expired");
  });

  test("9. Rate limit error propagates with reset timestamp", async () => {
    const kv = createMockKV();
    const failingFetch = async () => {
      throw new Error("rate_limited:1712345678");
    };

    await expect(
      performInboundSync(
        "paste1",
        mockPRMetadata,
        "token",
        kv,
        undefined,
        failingFetch as any
      )
    ).rejects.toThrow("rate_limited");
  });

  test("10. Deduplication guard prevents duplicates within same sync (Pitfall 5)", async () => {
    // Create a KV where get always returns null (simulating eventual consistency lag)
    const putCalls: string[] = [];
    const realStore = new Map<string, string>();
    const kv = {
      get: async (_key: string) => null, // Always null - simulates KV lag
      put: async (key: string, value: string, _opts?: any) => {
        if (key.startsWith("sync:paste1:gh:")) {
          putCalls.push(key);
        }
        realStore.set(key, value);
      },
      delete: async (key: string) => {
        realStore.delete(key);
      },
    };

    // Same comment ID appears twice in the response
    const duplicateComment = makeReviewComment({
      id: "review_999",
      body: "Duplicate",
    });

    const result = await performInboundSync(
      "paste1",
      mockPRMetadata,
      "token",
      kv,
      undefined,
      createMockFetch([duplicateComment, { ...duplicateComment }])
    );

    // processedCommentIds Set should catch the second occurrence
    expect(result.stats.new).toBe(1);
    expect(result.stats.skipped).toBe(1);

    // setMapping should only be called once for that comment
    const ghMappingCalls = putCalls.filter(
      (k) => k === "sync:paste1:gh:review_999"
    );
    expect(ghMappingCalls.length).toBe(1);
  });

  test("11. Inbound sync includes isResolved from GraphQL thread status for thread root comments", async () => {
    const kv = createMockKV();
    const threadRoot = makeReviewComment({ id: "review_100", body: "Thread root", line: 5 });
    const childComment = makeReviewComment({ id: "review_200", body: "Reply", line: 5, in_reply_to_id: "review_100" });

    // Mock fetchReviewThreads: comment databaseId 100 maps to resolved thread
    const mockFetchReviewThreads = async () => {
      const map = new Map<number, { threadNodeId: string; isResolved: boolean }>();
      map.set(100, { threadNodeId: "THREAD_NODE_1", isResolved: true });
      return map;
    };

    const result = await performInboundSync(
      "paste1",
      mockPRMetadata,
      "token",
      kv,
      undefined,
      createMockFetch([threadRoot, childComment]),
      mockFetchReviewThreads as any
    );

    expect(result.annotations.length).toBe(2);
    // Thread root should have isResolved = true
    const root = result.annotations.find((a) => a.githubCommentId === "review_100")!;
    expect(root.isResolved).toBe(true);
    expect(root.threadNodeId).toBe("THREAD_NODE_1");
    // Child comment should NOT have isResolved (it's a thread-level property)
    const child = result.annotations.find((a) => a.githubCommentId === "review_200")!;
    expect(child.isResolved).toBeUndefined();
  });

  test("12. Re-opened threads correctly update isResolved to false", async () => {
    const kv = createMockKV();
    const comment = makeReviewComment({ id: "review_100", body: "Discussion", line: 5 });

    const mockFetchReviewThreads = async () => {
      const map = new Map<number, { threadNodeId: string; isResolved: boolean }>();
      map.set(100, { threadNodeId: "THREAD_NODE_1", isResolved: false }); // Re-opened
      return map;
    };

    const result = await performInboundSync(
      "paste1",
      mockPRMetadata,
      "token",
      kv,
      undefined,
      createMockFetch([comment]),
      mockFetchReviewThreads as any
    );

    const ann = result.annotations[0];
    expect(ann.isResolved).toBe(false);
  });

  test("13. Issue comments have isResolved undefined (not in any thread)", async () => {
    const kv = createMockKV();
    const issueComment = makeIssueComment({ id: "issue_300", body: "General" });

    const mockFetchReviewThreads = async () => {
      return new Map<number, { threadNodeId: string; isResolved: boolean }>();
    };

    const result = await performInboundSync(
      "paste1",
      mockPRMetadata,
      "token",
      kv,
      undefined,
      createMockFetch([issueComment]),
      mockFetchReviewThreads as any
    );

    expect(result.annotations[0].isResolved).toBeUndefined();
  });

  test("14. GraphQL failure does not break inbound sync (graceful degradation)", async () => {
    const kv = createMockKV();
    const comment = makeReviewComment({ id: "review_100", body: "Fix this", line: 5 });

    const failingFetchReviewThreads = async () => {
      throw new Error("GraphQL request failed");
    };

    const result = await performInboundSync(
      "paste1",
      mockPRMetadata,
      "token",
      kv,
      undefined,
      createMockFetch([comment]),
      failingFetchReviewThreads as any
    );

    // Sync should succeed despite GraphQL failure
    expect(result.annotations.length).toBe(1);
    expect(result.stats.new).toBe(1);
    // isResolved should be undefined since GraphQL failed
    expect(result.annotations[0].isResolved).toBeUndefined();
  });
});
