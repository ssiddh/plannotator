import { handleRequest } from "../core/handler";
import { corsHeaders, getAllowedOrigins } from "../core/cors";
import { KvPasteStore } from "../stores/kv";
import { createGitHubHandler } from "@plannotator/github/server";

interface Env {
  PASTE_KV: KVNamespace;
  ALLOWED_ORIGINS?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  OAUTH_REDIRECT_URI?: string;
  PORTAL_URL?: string;
  GITHUB_DEFAULT_REPO?: string;
  GITHUB_PR_BASE_BRANCH?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin") ?? "";
    const allowed = getAllowedOrigins(env.ALLOWED_ORIGINS);
    const cors = corsHeaders(origin, allowed);
    const store = new KvPasteStore(env.PASTE_KV);

    const githubConfig = {
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
      redirectUri: env.OAUTH_REDIRECT_URI,
      portalUrl: env.PORTAL_URL || "https://share.plannotator.ai",
      defaultRepo: env.GITHUB_DEFAULT_REPO,
      prBaseBranch: env.GITHUB_PR_BASE_BRANCH,
    };

    // Create PR storage adapter from KV
    const prStorage = {
      async putPRMetadata(pasteId: string, metadata: any) {
        await env.PASTE_KV.put(`pr:${pasteId}`, JSON.stringify(metadata), { expirationTtl: 30 * 24 * 60 * 60 });
      },
      async getPRMetadata(pasteId: string) {
        const json = await env.PASTE_KV.get(`pr:${pasteId}`);
        return json ? JSON.parse(json) : null;
      },
    };

    const githubHandler = createGitHubHandler(githubConfig, prStorage, env.PASTE_KV);

    // Pass KV namespace for token caching and GitHub middleware
    return handleRequest(request, store, cors, undefined, env.PASTE_KV, [githubHandler]);
  },
};
