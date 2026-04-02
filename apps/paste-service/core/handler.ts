import type { PasteStore } from "./storage";
import { corsHeaders } from "./cors";
import type { PasteACL, PasteMetadata, PRMetadata } from "@plannotator/github/types";
import { extractToken, validateGitHubToken, checkAccess } from "@plannotator/github/server/middleware";
import { authRequiredHtml, sessionExpiredHtml, accessDeniedHtml } from "@plannotator/github/server/auth-page";
import type { GitHubHandler } from "@plannotator/github/server";
import { exportToPR } from "@plannotator/github/server/pr";
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

/**
 * Shared HTTP request handler for the paste service.
 * Both Bun and Cloudflare targets delegate to this after wiring up their store.
 *
 * GitHub routes (OAuth, PR) are handled by middleware (GitHubHandler) per D-01.
 */
export async function handleRequest(
  request: Request,
  store: PasteStore,
  cors: Record<string, string>,
  options?: Partial<PasteOptions>,
  kv?: KVNamespace,
  middleware?: GitHubHandler[]
): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  // Try middleware first (GitHub plugin routes, per D-01)
  if (middleware) {
    for (const mw of middleware) {
      const response = await mw.handle(request, url);
      if (response) return response;
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

      // If GitHub PR export requested, create PR via plugin
      let prMetadata: PRMetadata | undefined;
      if (body.github_export && token && body.plan_markdown) {
        try {
          prMetadata = await exportToPR(
            result.id,
            body.plan_markdown,
            token,
            {
              defaultRepo: process.env.GITHUB_DEFAULT_REPO,
            }
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
    let tokenValidationFailed = false;
    if (token) {
      const authResult = await validateGitHubToken(token, kv);
      user = authResult.user;
      if (!authResult.valid) {
        tokenValidationFailed = true;
      }
    }

    const accessCheck = await checkAccess(metadata.acl, user, token, kv);
    if (!accessCheck.authorized) {
      const acceptsHtml = request.headers.get("Accept")?.includes("text/html");

      if (acceptsHtml) {
        // Per D-01: server-side gate returns HTML, not plan content
        const loginUrl = "/api/auth/github/login";
        const returnTo = url.toString();

        if (token && !tokenValidationFailed && user) {
          // Token valid, user exists, but not on ACL whitelist -> 403
          return new Response(accessDeniedHtml(), {
            status: 403,
            headers: { ...cors, "Content-Type": "text/html; charset=utf-8" },
          });
        }

        if (token && tokenValidationFailed) {
          // Token present but validation failed -> session expired (D-11)
          return new Response(sessionExpiredHtml(loginUrl, returnTo), {
            status: 401,
            headers: { ...cors, "Content-Type": "text/html; charset=utf-8" },
          });
        }

        // No token at all -> auth required
        return new Response(authRequiredHtml(loginUrl, returnTo), {
          status: 401,
          headers: { ...cors, "Content-Type": "text/html; charset=utf-8" },
        });
      }

      // API clients get JSON (unchanged behavior)
      const status = token && !tokenValidationFailed && user ? 403 : 401;
      return Response.json(
        { error: accessCheck.reason || "Access denied" },
        { status, headers: cors }
      );
    }

    // TODO(phase-4): Move PR metadata lookup to plugin. Client should query /api/pr/:id/metadata separately.
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
