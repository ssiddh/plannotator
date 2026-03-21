/**
 * Claude Agent SDK provider — the first concrete AIProvider implementation.
 *
 * Uses @anthropic-ai/claude-agent-sdk to create sessions that can:
 * - Start fresh with Plannotator context as the system prompt
 * - Fork from a parent Claude Code session (preserving full history)
 * - Resume a previous Plannotator inline chat session
 * - Stream text deltas back to the UI in real time
 *
 * Sessions are read-only by default (tools limited to Read, Glob, Grep)
 * to keep inline chat safe and cost-bounded.
 */

import { buildSystemPrompt, buildForkPreamble } from "../context.ts";
import type {
  AIProvider,
  AIProviderCapabilities,
  AISession,
  AIMessage,
  AIContext,
  CreateSessionOptions,
  ClaudeAgentSDKConfig,
} from "../types.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROVIDER_NAME = "claude-agent-sdk";

/** Default read-only tools for inline chat. */
const DEFAULT_ALLOWED_TOOLS = ["Read", "Glob", "Grep", "WebSearch"];

/** Sensible defaults for inline chat — keep it fast and cheap. */
const DEFAULT_MAX_TURNS = 3;
const DEFAULT_MODEL = "claude-sonnet-4-6";

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class ClaudeAgentSDKProvider implements AIProvider {
  readonly name = PROVIDER_NAME;
  readonly capabilities: AIProviderCapabilities = {
    fork: true,
    resume: true,
    streaming: true,
    tools: true,
  };

  private config: ClaudeAgentSDKConfig;

  constructor(config: ClaudeAgentSDKConfig) {
    this.config = config;
  }

  async createSession(options: CreateSessionOptions): Promise<AISession> {
    const systemPrompt = buildSystemPrompt(options.context);
    return new ClaudeAgentSDKSession({
      systemPrompt,
      context: options.context,
      model: options.model ?? this.config.model ?? DEFAULT_MODEL,
      maxTurns: options.maxTurns ?? DEFAULT_MAX_TURNS,
      maxBudgetUsd: options.maxBudgetUsd,
      allowedTools: this.config.allowedTools ?? DEFAULT_ALLOWED_TOOLS,
      permissionMode: this.config.permissionMode ?? "plan",
      cwd: this.config.cwd ?? process.cwd(),
      abortController: options.abortController ?? new AbortController(),
      parentSessionId: null,
      forkFromSession: null,
    });
  }

  async forkSession(options: CreateSessionOptions): Promise<AISession> {
    const parent = options.context.parent;
    if (!parent) {
      throw new Error(
        "Cannot fork: no parent session provided in context. " +
          "Use createSession() for standalone sessions."
      );
    }

    const preamble = buildForkPreamble(options.context);

    return new ClaudeAgentSDKSession({
      systemPrompt: null, // forked sessions inherit the parent's system prompt
      forkPreamble: preamble,
      context: options.context,
      model: options.model ?? this.config.model ?? DEFAULT_MODEL,
      maxTurns: options.maxTurns ?? DEFAULT_MAX_TURNS,
      maxBudgetUsd: options.maxBudgetUsd,
      allowedTools: this.config.allowedTools ?? DEFAULT_ALLOWED_TOOLS,
      permissionMode: this.config.permissionMode ?? "plan",
      cwd: parent.cwd,
      abortController: options.abortController ?? new AbortController(),
      parentSessionId: parent.sessionId,
      forkFromSession: parent.sessionId,
    });
  }

  async resumeSession(
    sessionId: string,
    abortController?: AbortController
  ): Promise<AISession> {
    return new ClaudeAgentSDKSession({
      systemPrompt: null,
      context: null,
      model: this.config.model ?? DEFAULT_MODEL,
      maxTurns: DEFAULT_MAX_TURNS,
      maxBudgetUsd: undefined,
      allowedTools: this.config.allowedTools ?? DEFAULT_ALLOWED_TOOLS,
      permissionMode: this.config.permissionMode ?? "plan",
      cwd: this.config.cwd ?? process.cwd(),
      abortController: abortController ?? new AbortController(),
      parentSessionId: null,
      forkFromSession: null,
      resumeSessionId: sessionId,
    });
  }

  dispose(): void {
    // No persistent resources to clean up
  }
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

interface SessionConfig {
  systemPrompt: string | null;
  forkPreamble?: string;
  context: AIContext | null;
  model: string;
  maxTurns: number;
  maxBudgetUsd?: number;
  allowedTools: string[];
  permissionMode: string;
  cwd: string;
  abortController: AbortController;
  parentSessionId: string | null;
  forkFromSession: string | null;
  resumeSessionId?: string;
}

class ClaudeAgentSDKSession implements AISession {
  readonly id: string;
  readonly parentSessionId: string | null;

  private config: SessionConfig;
  private _isActive = false;
  private _sessionId: string | null = null;

  constructor(config: SessionConfig) {
    this.config = config;
    this.parentSessionId = config.parentSessionId;
    // Generate a temporary ID; will be replaced by the real session ID from the SDK
    this.id = config.resumeSessionId ?? crypto.randomUUID();
  }

  get isActive(): boolean {
    return this._isActive;
  }

  async *query(prompt: string): AsyncIterable<AIMessage> {
    this._isActive = true;

    try {
      // Dynamic import — the SDK is an optional peer dependency.
      // This allows the package to be imported in environments where
      // the SDK isn't installed (e.g., OpenCode runtime) without failing.
      const { query } = await import("@anthropic-ai/claude-agent-sdk");

      const queryPrompt = this.buildQueryPrompt(prompt);
      const options = this.buildQueryOptions();

      const stream = query({ prompt: queryPrompt, options });

      for await (const message of stream) {
        // Map SDK messages to our AIMessage types
        const mapped = mapSDKMessage(message);
        if (mapped) {
          // Capture the real session ID from the SDK
          if (
            "session_id" in message &&
            message.session_id &&
            !this._sessionId
          ) {
            this._sessionId = message.session_id as string;
            // Update the public ID to match the real one
            (this as { id: string }).id = this._sessionId;
          }
          yield mapped;
        }
      }
    } catch (err) {
      yield {
        type: "error",
        error: err instanceof Error ? err.message : String(err),
        code: "provider_error",
      };
    } finally {
      this._isActive = false;
    }
  }

  abort(): void {
    if (this._isActive) {
      this.config.abortController.abort();
      this._isActive = false;
    }
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  /**
   * Build the prompt string, prepending the fork preamble if this is a forked session.
   */
  private buildQueryPrompt(userPrompt: string): string {
    if (this.config.forkPreamble) {
      return `${this.config.forkPreamble}\n\n---\n\nUser question: ${userPrompt}`;
    }
    return userPrompt;
  }

  /**
   * Build the Options object for the SDK query() call.
   */
  private buildQueryOptions(): Record<string, unknown> {
    const opts: Record<string, unknown> = {
      model: this.config.model,
      maxTurns: this.config.maxTurns,
      allowedTools: this.config.allowedTools,
      cwd: this.config.cwd,
      abortController: this.config.abortController,
      includePartialMessages: true,
      persistSession: true,
    };

    if (this.config.maxBudgetUsd) {
      opts.maxBudgetUsd = this.config.maxBudgetUsd;
    }

    // System prompt — only for fresh sessions (not forks/resumes)
    if (this.config.systemPrompt) {
      opts.systemPrompt = this.config.systemPrompt;
    }

    // Fork: resume the parent session with forkSession: true
    if (this.config.forkFromSession) {
      opts.resume = this.config.forkFromSession;
      opts.forkSession = true;
    }

    // Resume: pick up an existing Plannotator session
    if (this.config.resumeSessionId) {
      opts.resume = this.config.resumeSessionId;
    }

    // Permission mode
    if (this.config.permissionMode === "bypassPermissions") {
      opts.permissionMode = "bypassPermissions";
      opts.allowDangerouslySkipPermissions = true;
    } else if (this.config.permissionMode === "plan") {
      opts.permissionMode = "plan";
    }

    return opts;
  }
}

// ---------------------------------------------------------------------------
// Message mapping
// ---------------------------------------------------------------------------

/**
 * Map an SDK message to an AIMessage, or null if it's not relevant.
 */
function mapSDKMessage(msg: Record<string, unknown>): AIMessage | null {
  const type = msg.type as string;

  switch (type) {
    case "assistant": {
      // Full assistant message — extract text content
      const message = msg.message as Record<string, unknown> | undefined;
      if (!message) return null;
      const content = message.content as Array<Record<string, unknown>>;
      if (!content) return null;

      const textParts: string[] = [];
      for (const block of content) {
        if (block.type === "text" && typeof block.text === "string") {
          textParts.push(block.text);
        } else if (block.type === "tool_use") {
          return {
            type: "tool_use",
            toolName: block.name as string,
            toolInput: block.input as Record<string, unknown>,
            toolUseId: block.id as string,
          };
        }
      }
      if (textParts.length > 0) {
        return { type: "text", text: textParts.join("") };
      }
      return null;
    }

    case "stream_event": {
      // Partial streaming — extract text deltas
      const event = msg.event as Record<string, unknown> | undefined;
      if (!event) return null;
      const eventType = event.type as string;

      if (eventType === "content_block_delta") {
        const delta = event.delta as Record<string, unknown>;
        if (delta?.type === "text_delta" && typeof delta.text === "string") {
          return { type: "text_delta", delta: delta.text };
        }
      }
      return null;
    }

    case "result": {
      const sessionId = (msg.session_id as string) ?? "";
      const subtype = msg.subtype as string;
      return {
        type: "result",
        sessionId,
        success: subtype === "success",
        result: (msg.result as string) ?? undefined,
        costUsd: msg.total_cost_usd as number | undefined,
        turns: msg.num_turns as number | undefined,
      };
    }

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Factory registration
// ---------------------------------------------------------------------------

import { registerProviderFactory } from "../provider.ts";

registerProviderFactory(
  PROVIDER_NAME,
  async (config) => new ClaudeAgentSDKProvider(config as ClaudeAgentSDKConfig)
);
