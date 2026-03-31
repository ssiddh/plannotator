import type { PasteStore } from "./storage";
import { corsHeaders } from "./cors";
import type { PasteACL, PasteMetadata, PRMetadata } from "../auth/types";
import { extractToken, validateGitHubToken, checkAccess } from "../auth/middleware";
import {
  handleLogin,
  handleCallback,
  handleTokenValidate,
  handleTokenRefresh,
} from "../auth/github";
import { exportToPR, fetchPRComments } from "../github/pr";
import { handlePresenceStream, handleHeartbeat } from "../presence/handler";

export interface PasteOptions {
  maxSize: number;
  ttlSeconds: number;
}

const DEFAULT_OPTIONS: PasteOptions = {
  maxSize: 524_288, // 512 KB
  ttlSeconds: 7 * 24 * 60 * 60, // 7 days
};

const ID_PATTERN = /^\/api\/paste\/([A-Za-z0-9]{6,16})$/;
const PR_COMMENTS_PATTERN = /^\/api\/pr\/([A-Za-z0-9]{6,16})\/comments$/;

/**
 * Generate a short URL-safe ID (8 chars, ~47.6 bits of entropy).
 * Uses Web Crypto with rejection sampling to avoid modulo bias.
 */
function generateId(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const limit = 256 - (256 % chars.length); // 248 — largest multiple of 62 that fits in a byte
  const id: string[] = [];
  while (id.length < 8) {
    const bytes = new Uint8Array(16); // oversample to minimize rounds
    crypto.getRandomValues(bytes);
    for (const b of bytes) {
      if (b < limit) {
        id.push(chars[b % chars.length]);
        if (id.length === 8) break;
      }
    }
  }
  return id.join("");
}

export async function createPaste(
  data: string,
  store: PasteStore,
  options: Partial<PasteOptions> = {}
): Promise<{ id: string }> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (!data || typeof data !== "string") {
    throw new PasteError('Missing or invalid "data" field', 400);
  }

  if (data.length > opts.maxSize) {
    throw new PasteError(
      `Payload too large (max ${Math.round(opts.maxSize / 1024)} KB compressed)`,
      413
    );
  }

  const id = generateId();
  await store.put(id, data, opts.ttlSeconds);
  return { id };
}

/**
 * Create a paste with ACL metadata.
 * Requires authentication if ACL type is "whitelist".
 */
export async function createPasteWithACL(
  data: string,
  acl: PasteACL | undefined,
  createdBy: string | undefined,
  store: PasteStore,
  options: Partial<PasteOptions> = {}
): Promise<{ id: string }> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (!data || typeof data !== "string") {
    throw new PasteError('Missing or invalid "data" field', 400);
  }

  if (data.length > opts.maxSize) {
    throw new PasteError(
      `Payload too large (max ${Math.round(opts.maxSize / 1024)} KB compressed)`,
      413
    );
  }

  const id = generateId();
  const metadata: PasteMetadata = {
    id,
    data,
    acl: acl || { type: "public" },
    createdBy,
    createdAt: new Date().toISOString(),
  };

  await store.putMetadata(metadata, opts.ttlSeconds);
  return { id };
}

export async function getPaste(
  id: string,
  store: PasteStore
): Promise<string | null> {
  return store.get(id);
}

export class PasteError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

export interface AuthConfig {
  githubClientId?: string;
  githubClientSecret?: string;
  oauthRedirectUri?: string;
  portalUrl?: string;
}

/**
 * Shared HTTP request handler for the paste service.
 * Both Bun and Cloudflare targets delegate to this after wiring up their store.
 */
export async function handleRequest(
  request: Request,
  store: PasteStore,
  cors: Record<string, string>,
  options?: Partial<PasteOptions>,
  kv?: KVNamespace,
  authConfig?: AuthConfig
): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  // --- OAuth Routes ---

  if (url.pathname === "/api/auth/github/login" && request.method === "GET") {
    if (!authConfig?.githubClientId || !authConfig?.oauthRedirectUri) {
      return Response.json(
        { error: "OAuth not configured" },
        { status: 503, headers: cors }
      );
    }
    return handleLogin(
      request,
      authConfig.githubClientId,
      authConfig.oauthRedirectUri
    );
  }

  if (url.pathname === "/api/auth/github/callback" && request.method === "GET") {
    if (
      !authConfig?.githubClientId ||
      !authConfig?.githubClientSecret ||
      !authConfig?.oauthRedirectUri ||
      !authConfig?.portalUrl
    ) {
      return Response.json(
        { error: "OAuth not configured" },
        { status: 503, headers: cors }
      );
    }
    return handleCallback(
      request,
      authConfig.githubClientId,
      authConfig.githubClientSecret,
      authConfig.oauthRedirectUri,
      authConfig.portalUrl
    );
  }

  if (url.pathname === "/api/auth/token/validate" && request.method === "POST") {
    return handleTokenValidate(request);
  }

  if (url.pathname === "/api/auth/token/refresh" && request.method === "POST") {
    if (!authConfig?.githubClientId || !authConfig?.githubClientSecret) {
      return Response.json(
        { error: "OAuth not configured" },
        { status: 503, headers: cors }
      );
    }
    return handleTokenRefresh(
      request,
      authConfig.githubClientId,
      authConfig.githubClientSecret
    );
  }

  // --- GitHub PR Routes ---

  if (url.pathname === "/api/pr/create" && request.method === "POST") {
    let body: { pasteId?: string; planMarkdown?: string; defaultRepo?: string };
    try {
      body = (await request.json()) as { pasteId?: string; planMarkdown?: string; defaultRepo?: string };
    } catch {
      return Response.json(
        { error: "Invalid JSON body" },
        { status: 400, headers: cors }
      );
    }

    if (!body.pasteId || !body.planMarkdown) {
      return Response.json(
        { error: "Missing pasteId or planMarkdown" },
        { status: 400, headers: cors }
      );
    }

    // Extract and validate token
    const token = extractToken(request);
    if (!token) {
      return Response.json(
        { error: "Authentication required to create PR" },
        { status: 401, headers: cors }
      );
    }

    try {
      const prMetadata = await exportToPR(
        body.pasteId,
        body.planMarkdown,
        token,
        body.defaultRepo || process.env.GITHUB_DEFAULT_REPO
      );

      // Store PR metadata (KV or filesystem)
      if (kv) {
        await kv.put(
          `pr:${body.pasteId}`,
          JSON.stringify(prMetadata),
          { expirationTtl: 30 * 24 * 60 * 60 } // 30 days
        );
      } else if ('putPRMetadata' in store) {
        await (store as any).putPRMetadata(body.pasteId, prMetadata);
      }

      return Response.json(prMetadata, { status: 201, headers: cors });
    } catch (e) {
      console.error("PR export failed:", e);
      return Response.json(
        { error: e instanceof Error ? e.message : "Failed to create PR" },
        { status: 500, headers: cors }
      );
    }
  }

  const prCommentsMatch = url.pathname.match(PR_COMMENTS_PATTERN);
  if (prCommentsMatch && request.method === "GET") {
    const pasteId = prCommentsMatch[1];

    // Extract and validate token
    const token = extractToken(request);
    if (!token) {
      return Response.json(
        { error: "Authentication required to fetch PR comments" },
        { status: 401, headers: cors }
      );
    }

    // Load PR metadata (KV or filesystem)
    let prMetadata: PRMetadata | null = null;

    if (kv) {
      const prMetadataJson = await kv.get(`pr:${pasteId}`);
      if (prMetadataJson) {
        try {
          prMetadata = JSON.parse(prMetadataJson);
        } catch (e) {
          console.error("Failed to parse PR metadata from KV:", e);
        }
      }
    } else if ('getPRMetadata' in store) {
      prMetadata = await (store as any).getPRMetadata(pasteId);
    }

    if (!prMetadata) {
      return Response.json(
        { error: "No PR found for this paste" },
        { status: 404, headers: cors }
      );
    }

    try {
      const comments = await fetchPRComments(prMetadata, token);
      return Response.json(comments, { headers: cors });
    } catch (e) {
      console.error("Failed to fetch PR comments:", e);
      return Response.json(
        { error: e instanceof Error ? e.message : "Failed to fetch PR comments" },
        { status: 500, headers: cors }
      );
    }
  }

  // --- Presence Routes ---

  if (url.pathname.startsWith("/api/presence/") && url.pathname.endsWith("/stream") && request.method === "GET") {
    // Extract paste ID from path: /api/presence/{pasteId}/stream
    const pathParts = url.pathname.split("/");
    const pasteId = pathParts[3];

    if (!pasteId || pasteId === "stream") {
      return Response.json(
        { error: "Invalid paste ID" },
        { status: 400, headers: cors }
      );
    }

    // Require authentication
    // Accept token from query param (for EventSource) or Authorization header
    const tokenFromQuery = url.searchParams.get("token");
    const token = extractToken(request) || tokenFromQuery;
    if (!token) {
      return Response.json(
        { error: "Authentication required" },
        { status: 401, headers: cors }
      );
    }

    const authResult = await validateGitHubToken(token, kv);
    if (!authResult.valid || !authResult.user) {
      return Response.json(
        { error: "Invalid token" },
        { status: 401, headers: cors }
      );
    }

    // Verify user has access to this paste
    const metadata = await store.getMetadata(pasteId);
    if (!metadata) {
      return Response.json(
        { error: "Paste not found" },
        { status: 404, headers: cors }
      );
    }

    const accessCheck = await checkAccess(metadata.acl, authResult.user, token, kv);
    if (!accessCheck.authorized) {
      return Response.json(
        { error: "Access denied" },
        { status: 403, headers: cors }
      );
    }

    // Start SSE stream
    return handlePresenceStream(pasteId, authResult.user);
  }

  if (url.pathname.startsWith("/api/presence/") && url.pathname.endsWith("/heartbeat") && request.method === "POST") {
    // Extract paste ID from path: /api/presence/{pasteId}/heartbeat
    const pathParts = url.pathname.split("/");
    const pasteId = pathParts[3];

    if (!pasteId || pasteId === "heartbeat") {
      return Response.json(
        { error: "Invalid paste ID" },
        { status: 400, headers: cors }
      );
    }

    // Require authentication
    const token = extractToken(request);
    if (!token) {
      return Response.json(
        { error: "Authentication required" },
        { status: 401, headers: cors }
      );
    }

    const authResult = await validateGitHubToken(token, kv);
    if (!authResult.valid || !authResult.user) {
      return Response.json(
        { error: "Invalid token" },
        { status: 401, headers: cors }
      );
    }

    return handleHeartbeat(pasteId, authResult.user.login);
  }

  // --- Paste Routes ---

  if (url.pathname === "/api/paste" && request.method === "POST") {
    let body: { data?: unknown; acl?: PasteACL; github_export?: boolean; plan_markdown?: string };
    try {
      body = (await request.json()) as { data?: unknown; acl?: PasteACL; github_export?: boolean; plan_markdown?: string };
    } catch {
      return Response.json(
        { error: "Invalid JSON body" },
        { status: 400, headers: cors }
      );
    }

    try {
      // Extract token and validate if ACL requires auth or PR export requested
      const token = extractToken(request);
      let createdBy: string | undefined;

      if ((body.acl && body.acl.type === "whitelist") || body.github_export) {
        // Whitelist or PR export requires authentication
        if (!token) {
          return Response.json(
            { error: "Authentication required for private shares or PR export" },
            { status: 401, headers: cors }
          );
        }

        const authResult = await validateGitHubToken(token, kv);
        if (!authResult.valid) {
          return Response.json(
            { error: authResult.error || "Invalid token" },
            { status: 401, headers: cors }
          );
        }

        createdBy = authResult.user?.login;
      }

      const result = await createPasteWithACL(
        body.data as string,
        body.acl,
        createdBy,
        store,
        options
      );

      // If GitHub PR export requested, create PR
      let prMetadata: PRMetadata | undefined;
      if (body.github_export && token && body.plan_markdown) {
        try {
          prMetadata = await exportToPR(
            result.id,
            body.plan_markdown,
            token,
            process.env.GITHUB_DEFAULT_REPO
          );

          // Store PR metadata (KV or filesystem)
          if (kv) {
            await kv.put(
              `pr:${result.id}`,
              JSON.stringify(prMetadata),
              { expirationTtl: 30 * 24 * 60 * 60 } // 30 days
            );
          } else if ('putPRMetadata' in store) {
            await (store as any).putPRMetadata(result.id, prMetadata);
          }
        } catch (e) {
          console.error("PR export failed:", e);
          // Don't fail the paste creation if PR export fails
          // Return the paste ID but indicate PR creation failed
          return Response.json(
            {
              ...result,
              github_pr: null,
              pr_error: e instanceof Error ? e.message : "Failed to create PR",
            },
            { status: 201, headers: cors }
          );
        }
      }

      return Response.json(
        { ...result, github_pr: prMetadata },
        { status: 201, headers: cors }
      );
    } catch (e) {
      if (e instanceof PasteError) {
        return Response.json(
          { error: e.message },
          { status: e.status, headers: cors }
        );
      }
      return Response.json(
        { error: "Failed to store paste" },
        { status: 500, headers: cors }
      );
    }
  }

  const match = url.pathname.match(ID_PATTERN);
  if (match && request.method === "GET") {
    const pasteId = match[1];
    const metadata = await store.getMetadata(pasteId);
    if (!metadata) {
      return Response.json(
        { error: "Paste not found or expired" },
        { status: 404, headers: cors }
      );
    }

    // Validate ACL
    const token = extractToken(request);
    let user;
    if (token) {
      const authResult = await validateGitHubToken(token, kv);
      user = authResult.user;
    }

    const accessCheck = await checkAccess(metadata.acl, user, token, kv);
    if (!accessCheck.authorized) {
      const status = token ? 403 : 401; // 403 if authenticated but not authorized, 401 if not authenticated
      return Response.json(
        { error: accessCheck.reason || "Access denied" },
        { status, headers: cors }
      );
    }

    // Check if PR metadata exists (KV or filesystem)
    let prMetadata: PRMetadata | undefined;
    if (kv) {
      const prMetadataJson = await kv.get(`pr:${pasteId}`);
      if (prMetadataJson) {
        try {
          prMetadata = JSON.parse(prMetadataJson);
        } catch (e) {
          console.error("Failed to parse PR metadata:", e);
        }
      }
    } else if ('getPRMetadata' in store) {
      const fsMetadata = await (store as any).getPRMetadata(pasteId);
      if (fsMetadata) {
        prMetadata = fsMetadata;
      }
    }

    // Return the encrypted data with optional PR metadata
    return Response.json(
      { data: metadata.data, github_pr: prMetadata },
      {
        headers: {
          ...cors,
          "Cache-Control": "private, no-store",
        },
      }
    );
  }

  return Response.json(
    { error: "Not found. Valid paths: POST /api/paste, GET /api/paste/:id" },
    { status: 404, headers: cors }
  );
}
