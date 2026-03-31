import { homedir } from "os";
import { join } from "path";
import { handleRequest } from "../core/handler";
import { corsHeaders, getAllowedOrigins } from "../core/cors";
import { FsPasteStore } from "../stores/fs";

const port = parseInt(process.env.PASTE_PORT || "19433", 10);
const dataDir =
  process.env.PASTE_DATA_DIR || join(homedir(), ".plannotator", "pastes");
const ttlDays = parseInt(process.env.PASTE_TTL_DAYS || "7", 10);
const ttlSeconds = ttlDays * 24 * 60 * 60;
const maxSize = parseInt(process.env.PASTE_MAX_SIZE || "524288", 10);
const allowedOrigins = getAllowedOrigins(process.env.PASTE_ALLOWED_ORIGINS);

const store = new FsPasteStore(dataDir);

const authConfig = {
  githubClientId: process.env.GITHUB_CLIENT_ID,
  githubClientSecret: process.env.GITHUB_CLIENT_SECRET,
  oauthRedirectUri: process.env.OAUTH_REDIRECT_URI || `http://localhost:${port}/api/auth/github/callback`,
  portalUrl: process.env.PORTAL_URL || "http://localhost:3001",
};

Bun.serve({
  port,
  async fetch(request) {
    const origin = request.headers.get("Origin") ?? "";
    const cors = corsHeaders(origin, allowedOrigins);
    // Pass undefined for KV (no token caching in filesystem mode) and auth config
    return handleRequest(request, store, cors, { maxSize, ttlSeconds }, undefined, authConfig);
  },
});

console.log(`Plannotator paste service running on http://localhost:${port}`);
console.log(`Storage: ${dataDir}`);
console.log(`TTL: ${ttlDays} days`);
