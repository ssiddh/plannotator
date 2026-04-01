import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import { exportToPR, fetchPRComments } from "./pr.ts";

describe("exportToPR", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("uses config.defaultRepo when provided (not process.env)", async () => {
    let capturedUrls: string[] = [];

    globalThis.fetch = mock(async (url: string | URL | globalThis.Request) => {
      const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
      capturedUrls.push(urlStr);

      // Mock responses for each GitHub API step
      if (urlStr.includes("/git/ref/")) {
        return Response.json({ object: { sha: "abc123" } });
      }
      if (urlStr.includes("/git/blobs")) {
        return Response.json({ sha: "blob123" });
      }
      if (urlStr.includes("/git/commits") && !urlStr.includes("/git/commits/")) {
        return Response.json({ sha: "commit123" });
      }
      if (urlStr.includes("/git/commits/")) {
        return Response.json({ tree: { sha: "tree123" } });
      }
      if (urlStr.includes("/git/trees")) {
        return Response.json({ sha: "newtree123" });
      }
      if (urlStr.includes("/git/refs")) {
        return Response.json({ ref: "refs/heads/plan/test" });
      }
      if (urlStr.includes("/pulls")) {
        return Response.json({
          number: 42,
          html_url: "https://github.com/myorg/myrepo/pull/42",
          created_at: "2026-01-01T00:00:00Z",
        });
      }
      return Response.json({});
    }) as typeof fetch;

    const result = await exportToPR("test-paste", "# Test Plan\n\nContent", "fake-token", {
      defaultRepo: "myorg/myrepo",
      prBaseBranch: "develop",
    });

    expect(result.repo).toBe("myorg/myrepo");
    expect(result.pr_number).toBe(42);
    // Verify the API was called with the config repo, not process.env
    expect(capturedUrls.some((u) => u.includes("myorg/myrepo"))).toBe(true);
  });

  test("defaults prBaseBranch to 'main' when not provided in config", async () => {
    let capturedUrls: string[] = [];

    globalThis.fetch = mock(async (url: string | URL | globalThis.Request) => {
      const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
      capturedUrls.push(urlStr);

      if (urlStr.includes("/git/ref/")) {
        return Response.json({ object: { sha: "abc123" } });
      }
      if (urlStr.includes("/git/blobs")) {
        return Response.json({ sha: "blob123" });
      }
      if (urlStr.includes("/git/commits") && !urlStr.includes("/git/commits/")) {
        return Response.json({ sha: "commit123" });
      }
      if (urlStr.includes("/git/commits/")) {
        return Response.json({ tree: { sha: "tree123" } });
      }
      if (urlStr.includes("/git/trees")) {
        return Response.json({ sha: "newtree123" });
      }
      if (urlStr.includes("/git/refs")) {
        return Response.json({ ref: "refs/heads/plan/test" });
      }
      if (urlStr.includes("/pulls")) {
        return Response.json({
          number: 1,
          html_url: "https://github.com/org/repo/pull/1",
          created_at: "2026-01-01T00:00:00Z",
        });
      }
      return Response.json({});
    }) as typeof fetch;

    await exportToPR("test", "# Plan", "token", {
      defaultRepo: "org/repo",
    });

    // Should use "main" as base branch (default)
    expect(capturedUrls.some((u) => u.includes("/git/ref/heads/main"))).toBe(true);
  });

  test("throws when no defaultRepo configured", async () => {
    expect(
      exportToPR("test", "# Plan", "token", {})
    ).rejects.toThrow("No default repository configured");
  });
});

describe("fetchPRComments", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("calls correct GitHub API URL for given repo and PR number", async () => {
    let capturedUrls: string[] = [];

    globalThis.fetch = mock(async (url: string | URL | globalThis.Request) => {
      const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
      capturedUrls.push(urlStr);
      return Response.json([]);
    }) as typeof fetch;

    await fetchPRComments(
      {
        repo: "testorg/testrepo",
        pr_number: 99,
        pr_url: "https://github.com/testorg/testrepo/pull/99",
        created_at: "2026-01-01T00:00:00Z",
      },
      "test-token"
    );

    // Should call both review comments and issue comments endpoints
    expect(
      capturedUrls.some((u) =>
        u.includes("/repos/testorg/testrepo/pulls/99/comments")
      )
    ).toBe(true);
    expect(
      capturedUrls.some((u) =>
        u.includes("/repos/testorg/testrepo/issues/99/comments")
      )
    ).toBe(true);
  });
});
