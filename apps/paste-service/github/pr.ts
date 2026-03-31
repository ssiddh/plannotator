/**
 * GitHub Pull Request integration for collaborative plan reviews.
 *
 * Exports plans as GitHub PRs and syncs review comments back as annotations.
 */

const GITHUB_API_BASE = "https://api.github.com";

export interface PRMetadata {
  repo: string;           // "owner/repo" format
  pr_number: number;
  pr_url: string;
  created_at: string;
}

export interface PRComment {
  id: string;
  author: {
    username: string;
    avatar: string;
  };
  body: string;
  line?: number;          // Line number for review comments
  path?: string;          // File path for review comments
  created_at: string;
  github_url: string;
  comment_type: "review" | "issue";  // Review comment vs issue comment
}

/**
 * Export a plan as a GitHub PR.
 * Creates a branch, commits the plan, and opens a PR.
 */
export async function exportToPR(
  pasteId: string,
  planMarkdown: string,
  token: string,
  defaultRepo?: string
): Promise<PRMetadata> {
  const repo = defaultRepo || process.env.GITHUB_DEFAULT_REPO;
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
  const baseBranch = process.env.GITHUB_PR_BASE_BRANCH || "main";

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
        body: `# Plan Review\n\n${planMarkdown}\n\n---\n\n🤖 Generated via [Plannotator](https://plannotator.ai)\nPaste ID: \`${pasteId}\``,
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
 * Fetch all comments (review + issue) from a GitHub PR.
 */
export async function fetchPRComments(
  prMetadata: PRMetadata,
  token: string
): Promise<PRComment[]> {
  const [owner, repoName] = prMetadata.repo.split("/");

  try {
    // Fetch review comments (inline, with line numbers)
    const reviewCommentsPromise = githubRequest(
      `GET /repos/${owner}/${repoName}/pulls/${prMetadata.pr_number}/comments`,
      token
    );

    // Fetch issue comments (general, no line numbers)
    const issueCommentsPromise = githubRequest(
      `GET /repos/${owner}/${repoName}/issues/${prMetadata.pr_number}/comments`,
      token
    );

    const [reviewComments, issueComments] = await Promise.all([
      reviewCommentsPromise,
      issueCommentsPromise,
    ]);

    const allComments: PRComment[] = [];

    // Process review comments (have line numbers)
    for (const comment of reviewComments as any[]) {
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
      });
    }

    // Process issue comments (general comments)
    for (const comment of issueComments as any[]) {
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
      });
    }

    // Sort by creation time
    allComments.sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    return allComments;
  } catch (error) {
    throw new Error(`Failed to fetch PR comments: ${error}`);
  }
}

/**
 * Helper: Make authenticated GitHub API request.
 */
async function githubRequest(
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
