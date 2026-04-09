/**
 * GitHub GraphQL API helpers for thread management.
 *
 * Created as part of Phase 07, Plan 01 (THREAD-04, THREAD-05, THREAD-07).
 * Per D-33: no GraphQL client libraries -- inline fetch() only.
 * Per D-35: same rate limit handling as REST (check X-RateLimit-* headers).
 * Per D-36: minimal mutation structure.
 */

const GITHUB_GRAPHQL_URL = "https://api.github.com/graphql";

/** GraphQL mutation to resolve a review thread (D-36: minimal structure). */
export const RESOLVE_THREAD_MUTATION = `
  mutation ResolveReviewThread($threadId: ID!) {
    resolveReviewThread(input: { threadId: $threadId }) {
      thread {
        isResolved
      }
    }
  }
`;

/** GraphQL query for review thread resolution status and first comment IDs. */
export const REVIEW_THREADS_QUERY = `
  query ReviewThreads($owner: String!, $repo: String!, $prNumber: Int!, $cursor: String) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $prNumber) {
        reviewThreads(first: 50, after: $cursor) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            id
            isResolved
            comments(first: 1) {
              nodes {
                databaseId
              }
            }
          }
        }
      }
    }
  }
`;

/**
 * Generic GraphQL request wrapper.
 *
 * Handles:
 * - Rate limiting: checks X-RateLimit-Remaining on 403, throws "rate_limited:{reset}"
 * - Non-ok responses: throws with status code
 * - GraphQL errors array: throws with first error message
 */
export async function graphqlRequest<T>(
  query: string,
  variables: Record<string, any>,
  token: string
): Promise<T> {
  const response = await fetch(GITHUB_GRAPHQL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "Plannotator-Paste-Service",
    },
    body: JSON.stringify({ query, variables }),
  });

  // Check rate limiting on 403
  if (response.status === 403) {
    const rateLimitRemaining = response.headers.get("X-RateLimit-Remaining");
    const rateLimitReset = response.headers.get("X-RateLimit-Reset");
    if (rateLimitRemaining === "0") {
      throw new Error(`rate_limited:${rateLimitReset}`);
    }
  }

  if (!response.ok) {
    throw new Error(`GraphQL request failed with status ${response.status}`);
  }

  const result = await response.json() as { data?: T; errors?: Array<{ message: string }> };

  if (result.errors && result.errors.length > 0) {
    throw new Error(result.errors[0].message);
  }

  return result.data as T;
}

/**
 * Resolve a review thread on GitHub via GraphQL mutation.
 *
 * Per D-11/D-34: returns false on failure instead of throwing.
 * This enables graceful degradation when thread resolution fails
 * (e.g., thread already resolved, permissions issue).
 */
export async function resolveReviewThread(
  threadNodeId: string,
  token: string
): Promise<boolean> {
  try {
    await graphqlRequest(
      RESOLVE_THREAD_MUTATION,
      { threadId: threadNodeId },
      token
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Fetch all review threads for a PR with resolution status.
 *
 * Returns Map<number, { threadNodeId, isResolved }> keyed by firstCommentDatabaseId.
 * This enables mapping REST comment IDs to GraphQL thread node IDs.
 *
 * Per D-32: batch size 50, paginates via endCursor.
 */
export async function fetchReviewThreads(
  owner: string,
  repo: string,
  prNumber: number,
  token: string
): Promise<Map<number, { threadNodeId: string; isResolved: boolean }>> {
  const result = new Map<number, { threadNodeId: string; isResolved: boolean }>();
  let cursor: string | null = null;

  while (true) {
    const variables: Record<string, any> = { owner, repo, prNumber, cursor };

    interface ThreadsResponse {
      repository: {
        pullRequest: {
          reviewThreads: {
            pageInfo: { hasNextPage: boolean; endCursor: string | null };
            nodes: Array<{
              id: string;
              isResolved: boolean;
              comments: { nodes: Array<{ databaseId: number }> };
            }>;
          };
        };
      };
    }

    const data = await graphqlRequest<ThreadsResponse>(
      REVIEW_THREADS_QUERY,
      variables,
      token
    );

    const threads = data.repository.pullRequest.reviewThreads;

    for (const thread of threads.nodes) {
      const firstComment = thread.comments.nodes[0];
      if (firstComment) {
        result.set(firstComment.databaseId, {
          threadNodeId: thread.id,
          isResolved: thread.isResolved,
        });
      }
    }

    if (!threads.pageInfo.hasNextPage) {
      break;
    }
    cursor = threads.pageInfo.endCursor;
  }

  return result;
}
