import { handleRequest } from "../core/handler";
import { corsHeaders, getAllowedOrigins } from "../core/cors";
import { KvPasteStore } from "../stores/kv";

interface Env {
  PASTE_KV: KVNamespace;
  ALLOWED_ORIGINS?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  OAUTH_REDIRECT_URI?: string;
  PORTAL_URL?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin") ?? "";
    const allowed = getAllowedOrigins(env.ALLOWED_ORIGINS);
    const cors = corsHeaders(origin, allowed);
    const store = new KvPasteStore(env.PASTE_KV);

    // Auth configuration from environment variables
    const authConfig = {
      githubClientId: env.GITHUB_CLIENT_ID,
      githubClientSecret: env.GITHUB_CLIENT_SECRET,
      oauthRedirectUri: env.OAUTH_REDIRECT_URI,
      portalUrl: env.PORTAL_URL || "https://share.plannotator.ai",
    };

    // Pass KV namespace for token caching and auth config
    return handleRequest(request, store, cors, undefined, env.PASTE_KV, authConfig);
  },
};
