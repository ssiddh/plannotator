import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  graphqlRequest,
  resolveReviewThread,
  fetchReviewThreads,
  RESOLVE_THREAD_MUTATION,
  REVIEW_THREADS_QUERY,
} from "./graphql.ts";

describe("graphqlRequest", () => {
  let originalFetch: typeof globalThis.fetch;
  let fetchCalls: Array<{ url: string; init: RequestInit }>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchCalls = [];
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockFetch(response: { status?: number; body?: any; headers?: Record<string, string> }) {
    globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      fetchCalls.push({ url, init: init! });
      return new Response(JSON.stringify(response.body ?? {}), {
        status: response.status ?? 200,
        headers: {
          "Content-Type": "application/json",
          ...(response.headers ?? {}),
        },
      });
    };
  }

  test("sends POST to https://api.github.com/graphql with Bearer token, Content-Type, User-Agent", async () => {
    mockFetch({ body: { data: { test: true } } });

    await graphqlRequest("query { viewer { login } }", {}, "my-token");

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toBe("https://api.github.com/graphql");
    expect(fetchCalls[0].init.method).toBe("POST");

    const headers = fetchCalls[0].init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer my-token");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["User-Agent"]).toBe("Plannotator-Paste-Service");
  });

  test("throws on non-ok response with status code in error message", async () => {
    mockFetch({ status: 500, body: {} });

    await expect(graphqlRequest("query {}", {}, "token"))
      .rejects.toThrow("GraphQL request failed with status 500");
  });

  test("throws with 'rate_limited:{reset}' when 403 + X-RateLimit-Remaining: 0", async () => {
    mockFetch({
      status: 403,
      body: {},
      headers: {
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": "1700000000",
      },
    });

    await expect(graphqlRequest("query {}", {}, "token"))
      .rejects.toThrow("rate_limited:1700000000");
  });

  test("throws on GraphQL errors array with first error message", async () => {
    mockFetch({
      body: {
        data: null,
        errors: [
          { message: "Could not resolve to a node" },
          { message: "Second error" },
        ],
      },
    });

    await expect(graphqlRequest("query {}", {}, "token"))
      .rejects.toThrow("Could not resolve to a node");
  });

  test("returns result.data as typed value", async () => {
    mockFetch({ body: { data: { viewer: { login: "testuser" } } } });

    const result = await graphqlRequest<{ viewer: { login: string } }>(
      "query { viewer { login } }",
      {},
      "token"
    );

    expect(result.viewer.login).toBe("testuser");
  });
});

describe("resolveReviewThread", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("calls graphqlRequest with RESOLVE_THREAD_MUTATION and threadId variable, returns true", async () => {
    let capturedBody: any;
    globalThis.fetch = async (_input: any, init?: RequestInit) => {
      capturedBody = JSON.parse(init?.body as string);
      return new Response(JSON.stringify({
        data: { resolveReviewThread: { thread: { isResolved: true } } },
      }));
    };

    const result = await resolveReviewThread("THREAD_NODE_123", "token");

    expect(result).toBe(true);
    expect(capturedBody.query).toContain("resolveReviewThread");
    expect(capturedBody.variables.threadId).toBe("THREAD_NODE_123");
  });

  test("returns false when GraphQL returns errors (D-11/D-34: graceful failure)", async () => {
    globalThis.fetch = async () => {
      return new Response(JSON.stringify({
        data: null,
        errors: [{ message: "Could not resolve thread" }],
      }));
    };

    const result = await resolveReviewThread("THREAD_NODE_123", "token");
    expect(result).toBe(false);
  });

  test("returns false on network error", async () => {
    globalThis.fetch = async () => {
      throw new Error("Network error");
    };

    const result = await resolveReviewThread("THREAD_NODE_123", "token");
    expect(result).toBe(false);
  });
});

describe("fetchReviewThreads", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function makeThreadsResponse(
    nodes: Array<{ id: string; isResolved: boolean; databaseId: number }>,
    hasNextPage: boolean = false,
    endCursor: string | null = null
  ) {
    return {
      data: {
        repository: {
          pullRequest: {
            reviewThreads: {
              pageInfo: { hasNextPage, endCursor },
              nodes: nodes.map((n) => ({
                id: n.id,
                isResolved: n.isResolved,
                comments: { nodes: [{ databaseId: n.databaseId }] },
              })),
            },
          },
        },
      },
    };
  }

  test("returns array of { threadNodeId, isResolved, firstCommentDatabaseId } objects", async () => {
    globalThis.fetch = async () => {
      return new Response(JSON.stringify(makeThreadsResponse([
        { id: "T_1", isResolved: false, databaseId: 100 },
        { id: "T_2", isResolved: true, databaseId: 200 },
      ])));
    };

    const result = await fetchReviewThreads("owner", "repo", 42, "token");

    expect(result.size).toBe(2);
    expect(result.get(100)).toEqual({ threadNodeId: "T_1", isResolved: false });
    expect(result.get(200)).toEqual({ threadNodeId: "T_2", isResolved: true });
  });

  test("paginates when hasNextPage is true (D-32: batch 50)", async () => {
    let callCount = 0;
    globalThis.fetch = async (_input: any, init?: RequestInit) => {
      callCount++;
      const body = JSON.parse(init?.body as string);

      if (callCount === 1) {
        expect(body.variables.cursor).toBeNull();
        return new Response(JSON.stringify(makeThreadsResponse(
          [{ id: "T_1", isResolved: false, databaseId: 100 }],
          true,
          "cursor_abc"
        )));
      }
      // Second page
      expect(body.variables.cursor).toBe("cursor_abc");
      return new Response(JSON.stringify(makeThreadsResponse(
        [{ id: "T_2", isResolved: true, databaseId: 200 }],
        false,
        null
      )));
    };

    const result = await fetchReviewThreads("owner", "repo", 42, "token");

    expect(callCount).toBe(2);
    expect(result.size).toBe(2);
    expect(result.get(100)).toEqual({ threadNodeId: "T_1", isResolved: false });
    expect(result.get(200)).toEqual({ threadNodeId: "T_2", isResolved: true });
  });

  test("builds Map keyed by firstCommentDatabaseId", async () => {
    globalThis.fetch = async () => {
      return new Response(JSON.stringify(makeThreadsResponse([
        { id: "T_abc", isResolved: false, databaseId: 555 },
      ])));
    };

    const result = await fetchReviewThreads("owner", "repo", 1, "token");

    expect(result).toBeInstanceOf(Map);
    const entry = result.get(555);
    expect(entry).toBeDefined();
    expect(entry!.threadNodeId).toBe("T_abc");
    expect(entry!.isResolved).toBe(false);
  });

  test("skips threads with no comments", async () => {
    globalThis.fetch = async () => {
      return new Response(JSON.stringify({
        data: {
          repository: {
            pullRequest: {
              reviewThreads: {
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: [
                  {
                    id: "T_empty",
                    isResolved: false,
                    comments: { nodes: [] },
                  },
                  {
                    id: "T_valid",
                    isResolved: true,
                    comments: { nodes: [{ databaseId: 300 }] },
                  },
                ],
              },
            },
          },
        },
      }));
    };

    const result = await fetchReviewThreads("owner", "repo", 1, "token");

    expect(result.size).toBe(1);
    expect(result.has(300)).toBe(true);
  });
});
