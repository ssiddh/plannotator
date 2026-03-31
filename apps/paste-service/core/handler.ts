import type { PasteStore } from "./storage";
import { corsHeaders } from "./cors";
import type { PasteACL, PasteMetadata } from "../auth/types";
import { extractToken, validateGitHubToken, checkAccess } from "../auth/middleware";
import {
  handleLogin,
  handleCallback,
  handleTokenValidate,
  handleTokenRefresh,
} from "../auth/github";

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

  // --- Paste Routes ---

  if (url.pathname === "/api/paste" && request.method === "POST") {
    let body: { data?: unknown; acl?: PasteACL };
    try {
      body = (await request.json()) as { data?: unknown; acl?: PasteACL };
    } catch {
      return Response.json(
        { error: "Invalid JSON body" },
        { status: 400, headers: cors }
      );
    }

    try {
      // Extract token and validate if ACL requires auth
      const token = extractToken(request);
      let createdBy: string | undefined;

      if (body.acl && body.acl.type === "whitelist") {
        // Whitelist requires authentication
        if (!token) {
          return Response.json(
            { error: "Authentication required for private shares" },
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
      return Response.json(result, { status: 201, headers: cors });
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
    const metadata = await store.getMetadata(match[1]);
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

    // Return only the encrypted data (not the full metadata)
    return Response.json(
      { data: metadata.data },
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
