/**
 * GitHub handler for the @plannotator/github plugin.
 *
 * Follows the ExternalAnnotationHandler composition pattern: returns
 * Response for known routes, null for unknown routes (pass-through).
 *
 * Created as part of ARCH-01 (plugin package) and ARCH-03 (composition pattern).
 */

import type {
  GitHubConfig,
  PRStorageAdapter,
  PRMetadata,
} from "../shared/types.ts";
import {
  handleLogin,
  handleCallback,
  handleTokenValidate,
  handleTokenRefresh,
} from "./oauth.ts";
import { extractToken, validateGitHubToken } from "./middleware.ts";
import { exportToPR, fetchPRComments } from "./pr.ts";
import { exportPlanWithAnnotations } from "./export.ts";

const PR_COMMENTS_PATTERN = /^\/api\/pr\/([A-Za-z0-9]{6,16})\/comments$/;
const PR_METADATA_PATTERN = /^\/api\/pr\/([A-Za-z0-9]{6,16})\/metadata$/;

/**
 * GitHubHandler interface matching ExternalAnnotationHandler pattern.
 * Returns Response for known routes, null for unknown (pass-through).
 */
export interface GitHubHandler {
  handle: (req: Request, url: URL) => Promise<Response | null>;
}

/**
 * Create a GitHubHandler that routes GitHub-related API requests.
 *
 * @param config - GitHub configuration (clientId, clientSecret, etc.)
 * @param storage - Optional PR metadata storage adapter
 * @param kv - Optional KV namespace for token caching (typed as any to avoid Cloudflare dependency)
 */
export function createGitHubHandler(
  config: GitHubConfig,
  storage?: PRStorageAdapter,
  kv?: any
): GitHubHandler {
  return {
    async handle(req: Request, url: URL): Promise<Response | null> {
      // --- OAuth Routes ---

      if (url.pathname === "/api/auth/github/login" && req.method === "GET") {
        if (!config.clientId || !config.redirectUri) {
          return Response.json(
            { error: "OAuth not configured" },
            { status: 503 }
          );
        }
        return handleLogin(req, config.clientId, config.redirectUri);
      }

      if (url.pathname === "/api/auth/github/callback" && req.method === "GET") {
        if (
          !config.clientId ||
          !config.clientSecret ||
          !config.redirectUri ||
          !config.portalUrl
        ) {
          return Response.json(
            { error: "OAuth not configured" },
            { status: 503 }
          );
        }
        return handleCallback(
          req,
          config.clientId,
          config.clientSecret,
          config.redirectUri,
          config.portalUrl
        );
      }

      if (url.pathname === "/api/auth/token/validate" && req.method === "POST") {
        return handleTokenValidate(req);
      }

      if (url.pathname === "/api/auth/token/refresh" && req.method === "POST") {
        if (!config.clientId || !config.clientSecret) {
          return Response.json(
            { error: "OAuth not configured" },
            { status: 503 }
          );
        }
        return handleTokenRefresh(req, config.clientId, config.clientSecret);
      }

      // --- GitHub PR Routes ---

      if (url.pathname === "/api/pr/create" && req.method === "POST") {
        interface CreatePRBody {
          pasteId?: string;
          planMarkdown?: string;
          defaultRepo?: string;
          annotations?: Array<{
            id: string;
            blockId: string;
            type: "DELETION" | "COMMENT" | "GLOBAL_COMMENT";
            text?: string;
            originalText: string;
            images?: Array<{ path: string; name: string }>;
          }>;
          blocks?: Array<{ id: string; startLine: number }>;
        }

        let body: CreatePRBody;
        try {
          body = (await req.json()) as CreatePRBody;
        } catch {
          return Response.json(
            { error: "Invalid JSON body" },
            { status: 400 }
          );
        }

        if (!body.pasteId || !body.planMarkdown) {
          return Response.json(
            { error: "Missing pasteId or planMarkdown" },
            { status: 400 }
          );
        }

        // Extract and validate token
        const token = extractToken(req);
        if (!token) {
          return Response.json(
            { error: "Authentication required to create PR" },
            { status: 401 }
          );
        }

        // AUTH-02: Validate token via GitHub API (D-09: cached in KV with 5-min TTL per D-10)
        const authResult = await validateGitHubToken(token, kv);
        if (!authResult.valid) {
          return Response.json(
            { error: authResult.error || "Invalid or expired token" },
            { status: 401 }
          );
        }

        try {
          // When annotations and blocks are provided, use the full annotation export flow
          if (body.annotations && body.blocks) {
            const result = await exportPlanWithAnnotations(
              body.pasteId,
              body.planMarkdown,
              body.annotations,
              body.blocks,
              token,
              {
                defaultRepo: body.defaultRepo || config.defaultRepo,
                prBaseBranch: config.prBaseBranch,
              },
              kv
            );
            return Response.json(result, { status: 201 });
          }

          // PR-01 backward compatibility: no annotations, use plain exportToPR
          const prMetadata = await exportToPR(
            body.pasteId,
            body.planMarkdown,
            token,
            {
              defaultRepo: body.defaultRepo || config.defaultRepo,
              prBaseBranch: config.prBaseBranch,
            }
          );

          // Store PR metadata via storage adapter
          if (storage) {
            await storage.putPRMetadata(body.pasteId, prMetadata);
          } else if (kv) {
            await kv.put(
              `pr:${body.pasteId}`,
              JSON.stringify(prMetadata),
              { expirationTtl: 30 * 24 * 60 * 60 } // 30 days
            );
          }

          return Response.json(prMetadata, { status: 201 });
        } catch (e) {
          return Response.json(
            { error: e instanceof Error ? e.message : "Failed to create PR" },
            { status: 500 }
          );
        }
      }

      const prCommentsMatch = url.pathname.match(PR_COMMENTS_PATTERN);
      if (prCommentsMatch && req.method === "GET") {
        const pasteId = prCommentsMatch[1];

        // Extract and validate token
        const token = extractToken(req);
        if (!token) {
          return Response.json(
            { error: "Authentication required to fetch PR comments" },
            { status: 401 }
          );
        }

        // AUTH-02: Validate token via GitHub API (D-09: cached in KV with 5-min TTL per D-10)
        const authResult = await validateGitHubToken(token, kv);
        if (!authResult.valid) {
          return Response.json(
            { error: authResult.error || "Invalid or expired token" },
            { status: 401 }
          );
        }

        // Load PR metadata via storage adapter or KV
        let prMetadata: PRMetadata | null = null;

        if (storage) {
          prMetadata = await storage.getPRMetadata(pasteId);
        } else if (kv) {
          const prMetadataJson = await kv.get(`pr:${pasteId}`);
          if (prMetadataJson) {
            try {
              prMetadata = JSON.parse(prMetadataJson);
            } catch {
              // Ignore parse errors
            }
          }
        }

        if (!prMetadata) {
          return Response.json(
            { error: "No PR found for this paste" },
            { status: 404 }
          );
        }

        try {
          const comments = await fetchPRComments(prMetadata, token);
          return Response.json(comments);
        } catch (e) {
          return Response.json(
            {
              error:
                e instanceof Error
                  ? e.message
                  : "Failed to fetch PR comments",
            },
            { status: 500 }
          );
        }
      }

      // --- PR Metadata Endpoint ---

      const prMetadataMatch = url.pathname.match(PR_METADATA_PATTERN);
      if (prMetadataMatch && req.method === "GET") {
        const metadataPasteId = prMetadataMatch[1];

        // No auth required for metadata read (public information)

        // Try new D-09 key pattern first (from exportPlanWithAnnotations)
        if (kv) {
          const syncPrJson = await kv.get(`sync:${metadataPasteId}:pr`);
          if (syncPrJson) {
            try {
              return Response.json(JSON.parse(syncPrJson));
            } catch {
              // Fall through to legacy lookup
            }
          }
        }

        // Fall back to storage adapter
        if (storage) {
          const prMeta = await storage.getPRMetadata(metadataPasteId);
          if (prMeta) {
            return Response.json(prMeta);
          }
        }

        // Fall back to legacy KV key pattern
        if (kv) {
          const legacyJson = await kv.get(`pr:${metadataPasteId}`);
          if (legacyJson) {
            try {
              return Response.json(JSON.parse(legacyJson));
            } catch {
              // Ignore parse errors
            }
          }
        }

        return Response.json(
          { error: "No PR found for this paste" },
          { status: 404 }
        );
      }

      // Unknown route -- pass through
      return null;
    },
  };
}
