/**
 * GitHub Pull Request integration for the @plannotator/github plugin.
 *
 * Extracted from apps/paste-service/github/pr.ts.
 *
 * Exports plans as GitHub PRs and syncs review comments back as annotations.
 * All configuration is injected via GitHubConfig -- no process.env references.
 */

import type { PRMetadata, PRComment, GitHubConfig } from "../shared/types.ts";

const GITHUB_API_BASE = "https://api.github.com";

/**
 * Export a plan as a GitHub PR.
 * Creates a branch, commits the plan, and opens a PR.
 *
 * @param config - GitHub configuration with defaultRepo and prBaseBranch
 */
export async function exportToPR(
  pasteId: string,
  planMarkdown: string,
  token: string,
  config: Pick<GitHubConfig, "defaultRepo" | "prBaseBranch">
): Promise<PRMetadata> {
  const repo = config.defaultRepo;
  if (!repo) {
    throw new Error("No default repository configured");
  }

  const [owner, repoName] = repo.split("/");
  if (!owner || !repoName) {
    throw new Error("Invalid repository format. Expected: owner/repo");
  }

  // Extract plan title from first heading
  const titleMatch = planMarkdown.match(/^#\s+(.+)$/m);
  const title = titleMatch
    ? `Plan Review: ${titleMatch[1]}`
    : `Plan Review: ${pasteId}`;

  const branchName = `plan/${pasteId}`;
  const baseBranch = config.prBaseBranch || "main";

  try {
    // 1. Get the base branch SHA
    const baseRef = await githubRequest(
      `GET /repos/${owner}/${repoName}/git/ref/heads/${baseBranch}`,
      token
    );
    const baseSha = baseRef.object.sha;

    // 2. Create a blob for the plan content
    const blob = await githubRequest(
      `POST /repos/${owner}/${repoName}/git/blobs`,
      token,
      {
        content: planMarkdown,
        encoding: "utf-8",
      }
    );

    // 3. Get the base tree
    const baseCommit = await githubRequest(
      `GET /repos/${owner}/${repoName}/git/commits/${baseSha}`,
      token
    );
    const baseTreeSha = baseCommit.tree.sha;

    // 4. Create a new tree with the plan file
    const tree = await githubRequest(
      `POST /repos/${owner}/${repoName}/git/trees`,
      token,
      {
        base_tree: baseTreeSha,
        tree: [
          {
            path: `plans/${pasteId}.md`,
            mode: "100644",
            type: "blob",
            sha: blob.sha,
          },
        ],
      }
    );

    // 5. Create a commit
    const commit = await githubRequest(
      `POST /repos/${owner}/${repoName}/git/commits`,
      token,
      {
        message: `Add plan review: ${pasteId}\n\nGenerated via Plannotator`,
        tree: tree.sha,
        parents: [baseSha],
      }
    );

    // 6. Create or update the branch reference
    try {
      await githubRequest(
        `POST /repos/${owner}/${repoName}/git/refs`,
        token,
        {
          ref: `refs/heads/${branchName}`,
          sha: commit.sha,
        }
      );
    } catch (error) {
      // If branch exists, update it
      await githubRequest(
        `PATCH /repos/${owner}/${repoName}/git/refs/heads/${branchName}`,
        token,
        {
          sha: commit.sha,
          force: true,
        }
      );
    }

    // 7. Create the pull request
    const pr = await githubRequest(
      `POST /repos/${owner}/${repoName}/pulls`,
      token,
      {
        title,
        head: branchName,
        base: baseBranch,
        body: `# Plan Review\n\n${planMarkdown}\n\n---\n\nGenerated via [Plannotator](https://plannotator.ai)\nPaste ID: \`${pasteId}\``,
      }
    );

    return {
      repo,
      pr_number: pr.number,
      pr_url: pr.html_url,
      created_at: pr.created_at,
    };
  } catch (error) {
    throw new Error(`Failed to create PR: ${error}`);
  }
}

/**
 * Fetch all pages from a paginated GitHub API endpoint.
 * Uses raw fetch() instead of githubRequest() for header access and error handling.
 */
async function fetchAllPages(
  baseUrl: string,
  token: string,
  since?: string,
  perPage: number = 100
): Promise<{ data: any[]; failedPages: number[] }> {
  const allData: any[] = [];
  const failedPages: number[] = [];
  let page = 1;

  while (true) {
    let url = `${baseUrl}?per_page=${perPage}&page=${page}`;
    if (since) {
      url += `&since=${since}`;
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "Plannotator-Paste-Service",
      },
    });

    // Extract headers BEFORE checking response.ok
    const linkHeader = response.headers.get("Link");
    const rateLimitRemaining = response.headers.get("X-RateLimit-Remaining");
    const rateLimitReset = response.headers.get("X-RateLimit-Reset");

    // Now check status
    if (response.status === 401) {
      throw new Error("token_expired");
    }
    if (response.status === 403 && rateLimitRemaining === "0") {
      throw new Error(`rate_limited:${rateLimitReset}`);
    }
    if (!response.ok) {
      failedPages.push(page);
      // If we had a successful prior page with a next link, continue
      const hasNext = linkHeader?.includes('rel="next"') ?? false;
      if (!hasNext && allData.length === 0) break;
      page++;
      continue;
    }

    // Parse body and check for next page
    const data = await response.json();
    allData.push(...(data as any[]));

    const hasNext = linkHeader?.includes('rel="next"') ?? false;
    if (!hasNext) break;
    page++;
  }

  return { data: allData, failedPages };
}

/**
 * Fetch all comments (review + issue) from a GitHub PR with pagination.
 */
export async function fetchPRComments(
  prMetadata: PRMetadata,
  token: string,
  options?: { since?: string; perPage?: number }
): Promise<{ comments: PRComment[]; failedPages: number[] }> {
  const [owner, repoName] = prMetadata.repo.split("/");
  const since = options?.since;
  const perPage = options?.perPage ?? 100;

  const reviewUrl = `${GITHUB_API_BASE}/repos/${owner}/${repoName}/pulls/${prMetadata.pr_number}/comments`;
  const issueUrl = `${GITHUB_API_BASE}/repos/${owner}/${repoName}/issues/${prMetadata.pr_number}/comments`;

  // Fetch both in parallel with pagination
  const [reviewResult, issueResult] = await Promise.all([
    fetchAllPages(reviewUrl, token, since, perPage),
    fetchAllPages(issueUrl, token, since, perPage),
  ]);

  const allComments: PRComment[] = [];
  const failedPages = [
    ...reviewResult.failedPages,
    ...issueResult.failedPages,
  ];

  // Process review comments (have line numbers)
  for (const comment of reviewResult.data) {
    allComments.push({
      id: `review_${comment.id}`,
      author: {
        username: comment.user.login,
        avatar: comment.user.avatar_url,
      },
      body: comment.body,
      line: comment.line || comment.original_line,
      path: comment.path,
      created_at: comment.created_at,
      github_url: comment.html_url,
      comment_type: "review",
      updated_at: comment.updated_at,
      in_reply_to_id: comment.in_reply_to_id
        ? `review_${comment.in_reply_to_id}`
        : undefined,
    });
  }

  // Process issue comments (general comments)
  for (const comment of issueResult.data) {
    allComments.push({
      id: `issue_${comment.id}`,
      author: {
        username: comment.user.login,
        avatar: comment.user.avatar_url,
      },
      body: comment.body,
      created_at: comment.created_at,
      github_url: comment.html_url,
      comment_type: "issue",
      updated_at: comment.updated_at,
    });
  }

  // Sort by creation time
  allComments.sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  return { comments: allComments, failedPages };
}

/**
 * Helper: Make authenticated GitHub API request.
 */
export async function githubRequest(
  endpoint: string,
  token: string,
  body?: any
): Promise<any> {
  const [method, path] = endpoint.split(" ");
  const url = `${GITHUB_API_BASE}${path}`;

  const options: RequestInit = {
    method: method || "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "Plannotator-Paste-Service",
      "Content-Type": "application/json",
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `GitHub API error ${response.status}: ${errorText}`
    );
  }

  return response.json();
}
