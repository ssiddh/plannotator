import { homedir } from "os";
import { join } from "path";
import { handleRequest } from "../core/handler";
import { corsHeaders, getAllowedOrigins } from "../core/cors";
import { FsPasteStore } from "../stores/fs";
import { readFileSync, existsSync } from "fs";
import { createGitHubHandler } from "@plannotator/github/server";

// Load .dev.vars file if it exists (for local development)
const devVarsPath = join(import.meta.dir, "..", ".dev.vars");
if (existsSync(devVarsPath)) {
  const content = readFileSync(devVarsPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const [key, ...valueParts] = trimmed.split("=");
      if (key && valueParts.length > 0) {
        process.env[key.trim()] = valueParts.join("=").trim();
      }
    }
  }
  console.log("Loaded environment variables from .dev.vars");
}

const port = parseInt(process.env.PASTE_PORT || "19433", 10);
const dataDir =
  process.env.PASTE_DATA_DIR || join(homedir(), ".plannotator", "pastes");
const ttlDays = parseInt(process.env.PASTE_TTL_DAYS || "7", 10);
const ttlSeconds = ttlDays * 24 * 60 * 60;
const maxSize = parseInt(process.env.PASTE_MAX_SIZE || "524288", 10);
const allowedOrigins = getAllowedOrigins(process.env.PASTE_ALLOWED_ORIGINS);

const store = new FsPasteStore(dataDir);

const githubConfig = {
  clientId: process.env.GITHUB_CLIENT_ID,
  clientSecret: process.env.GITHUB_CLIENT_SECRET,
  redirectUri: process.env.OAUTH_REDIRECT_URI || `http://localhost:${port}/api/auth/github/callback`,
  portalUrl: process.env.PORTAL_URL || "http://localhost:3001",
  defaultRepo: process.env.GITHUB_DEFAULT_REPO,
  prBaseBranch: process.env.GITHUB_PR_BASE_BRANCH,
};

// Create PR storage adapter from filesystem store
const prStorage = {
  async putPRMetadata(pasteId: string, metadata: any) {
    if ('putPRMetadata' in store) {
      await (store as any).putPRMetadata(pasteId, metadata);
    }
  },
  async getPRMetadata(pasteId: string) {
    if ('getPRMetadata' in store) {
      return (store as any).getPRMetadata(pasteId);
    }
    return null;
  },
};

const githubHandler = createGitHubHandler(githubConfig, prStorage);

Bun.serve({
  port,
  async fetch(request) {
    const origin = request.headers.get("Origin") ?? "";
    const cors = corsHeaders(origin, allowedOrigins);
    return handleRequest(request, store, cors, { maxSize, ttlSeconds }, undefined, [githubHandler]);
  },
});

console.log(`Plannotator paste service running on http://localhost:${port}`);
console.log(`Storage: ${dataDir}`);
console.log(`TTL: ${ttlDays} days`);
