/**
 * HTTP endpoint handlers for AI features.
 *
 * These handlers are provider-agnostic — they work with whatever AIProvider
 * is registered. They're designed to be mounted into any Plannotator server
 * (plan review, code review, annotate) via the shared server infrastructure.
 *
 * Endpoints:
 *   POST /api/ai/session       — Create or fork an AI session
 *   POST /api/ai/query         — Send a message and stream the response
 *   POST /api/ai/abort         — Abort the current query
 *   GET  /api/ai/sessions      — List active sessions
 *   GET  /api/ai/capabilities  — Check if AI features are available
 */

import type { AIContext, AIMessage, CreateSessionOptions } from "./types.ts";
import { getDefaultProvider } from "./provider.ts";
import { SessionManager } from "./session-manager.ts";

// ---------------------------------------------------------------------------
// Types for request/response
// ---------------------------------------------------------------------------

export interface CreateSessionRequest {
  /** The context mode and content for the session. */
  context: AIContext;
  /** Optional model override. */
  model?: string;
  /** Max agentic turns. */
  maxTurns?: number;
  /** Max budget in USD. */
  maxBudgetUsd?: number;
}

export interface QueryRequest {
  /** The session ID to query. */
  sessionId: string;
  /** The user's prompt/question. */
  prompt: string;
}

export interface AbortRequest {
  /** The session ID to abort. */
  sessionId: string;
}

// ---------------------------------------------------------------------------
// Handler factory
// ---------------------------------------------------------------------------

export interface AIEndpointDeps {
  /** Session manager instance (one per server). */
  sessionManager: SessionManager;
}

/**
 * Create the route handler map for AI endpoints.
 *
 * Usage in a Bun server:
 * ```ts
 * const aiHandlers = createAIEndpoints({ sessionManager });
 *
 * // In your request handler:
 * if (url.pathname.startsWith('/api/ai/')) {
 *   const handler = aiHandlers[url.pathname];
 *   if (handler) return handler(req);
 * }
 * ```
 */
export function createAIEndpoints(deps: AIEndpointDeps) {
  const { sessionManager } = deps;

  return {
    "/api/ai/capabilities": async (_req: Request) => {
      const provider = getDefaultProvider();
      return Response.json({
        available: !!provider,
        provider: provider?.name ?? null,
        capabilities: provider?.capabilities ?? null,
      });
    },

    "/api/ai/session": async (req: Request) => {
      if (req.method !== "POST") {
        return new Response("Method not allowed", { status: 405 });
      }

      const provider = getDefaultProvider();
      if (!provider) {
        return Response.json(
          { error: "No AI provider available" },
          { status: 503 }
        );
      }

      const body = (await req.json()) as CreateSessionRequest;
      const { context, model, maxTurns, maxBudgetUsd } = body;

      if (!context?.mode) {
        return Response.json(
          { error: "Missing context.mode" },
          { status: 400 }
        );
      }

      try {
        const options: CreateSessionOptions = {
          context,
          model,
          maxTurns,
          maxBudgetUsd,
        };

        // Fork if parent session is provided, otherwise create fresh
        const session = context.parent
          ? await provider.forkSession(options)
          : await provider.createSession(options);

        const entry = sessionManager.track(session, context.mode);

        return Response.json({
          sessionId: session.id,
          parentSessionId: session.parentSessionId,
          mode: context.mode,
          createdAt: entry.createdAt,
        });
      } catch (err) {
        return Response.json(
          {
            error:
              err instanceof Error ? err.message : "Failed to create session",
          },
          { status: 500 }
        );
      }
    },

    "/api/ai/query": async (req: Request) => {
      if (req.method !== "POST") {
        return new Response("Method not allowed", { status: 405 });
      }

      const body = (await req.json()) as QueryRequest;
      const { sessionId, prompt } = body;

      if (!sessionId || !prompt) {
        return Response.json(
          { error: "Missing sessionId or prompt" },
          { status: 400 }
        );
      }

      const entry = sessionManager.get(sessionId);
      if (!entry) {
        return Response.json(
          { error: "Session not found" },
          { status: 404 }
        );
      }

      sessionManager.touch(sessionId);

      // Stream the response using Server-Sent Events (SSE)
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          try {
            for await (const message of entry.session.query(prompt)) {
              const data = JSON.stringify(message);
              controller.enqueue(
                encoder.encode(`data: ${data}\n\n`)
              );
            }
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          } catch (err) {
            const errorMsg: AIMessage = {
              type: "error",
              error: err instanceof Error ? err.message : String(err),
              code: "stream_error",
            };
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(errorMsg)}\n\n`)
            );
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    },

    "/api/ai/abort": async (req: Request) => {
      if (req.method !== "POST") {
        return new Response("Method not allowed", { status: 405 });
      }

      const body = (await req.json()) as AbortRequest;
      const entry = sessionManager.get(body.sessionId);
      if (!entry) {
        return Response.json(
          { error: "Session not found" },
          { status: 404 }
        );
      }

      entry.session.abort();
      return Response.json({ ok: true });
    },

    "/api/ai/sessions": async (_req: Request) => {
      const entries = sessionManager.list();
      return Response.json(
        entries.map((e) => ({
          sessionId: e.session.id,
          mode: e.mode,
          parentSessionId: e.parentSessionId,
          createdAt: e.createdAt,
          lastActiveAt: e.lastActiveAt,
          isActive: e.session.isActive,
          label: e.label,
        }))
      );
    },
  } as const;
}

export type AIEndpoints = ReturnType<typeof createAIEndpoints>;
