/**
 * Session manager — tracks active and historical AI sessions.
 *
 * Each Plannotator server instance (plan review, code review, annotate)
 * gets its own SessionManager. It tracks:
 *
 * - Active sessions (currently streaming or idle but resumable)
 * - The lineage from forked sessions back to their parent
 * - Metadata for UI display (timestamps, mode, status)
 *
 * This is an in-memory store scoped to the server's lifetime. Sessions
 * are not persisted to disk by the manager (the underlying provider
 * handles its own persistence via the agent SDK).
 */

import type { AISession, AIContext, AIContextMode } from "./types.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SessionEntry {
  /** The live session handle (if still active). */
  session: AISession;
  /** What mode this session was created for. */
  mode: AIContextMode;
  /** The parent session ID this was forked from (null if standalone). */
  parentSessionId: string | null;
  /** When this session was created. */
  createdAt: number;
  /** When the last query was sent. */
  lastActiveAt: number;
  /** Short description for UI display (e.g., the user's first question). */
  label?: string;
}

export interface SessionManagerOptions {
  /**
   * Maximum number of sessions to keep in the manager.
   * Oldest idle sessions are evicted when the limit is reached.
   * Default: 20.
   */
  maxSessions?: number;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class SessionManager {
  private sessions = new Map<string, SessionEntry>();
  private maxSessions: number;

  constructor(options: SessionManagerOptions = {}) {
    this.maxSessions = options.maxSessions ?? 20;
  }

  /**
   * Track a newly created session.
   */
  track(session: AISession, mode: AIContextMode, label?: string): SessionEntry {
    this.evictIfNeeded();

    const entry: SessionEntry = {
      session,
      mode,
      parentSessionId: session.parentSessionId,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      label,
    };
    this.sessions.set(session.id, entry);
    return entry;
  }

  /**
   * Get a tracked session by ID.
   */
  get(sessionId: string): SessionEntry | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Mark a session as recently active (updates lastActiveAt).
   */
  touch(sessionId: string): void {
    const entry = this.sessions.get(sessionId);
    if (entry) {
      entry.lastActiveAt = Date.now();
    }
  }

  /**
   * Remove a session from tracking.
   * Does NOT abort the session — call session.abort() first if needed.
   */
  remove(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /**
   * List all tracked sessions, newest first.
   */
  list(): SessionEntry[] {
    return [...this.sessions.values()].sort(
      (a, b) => b.lastActiveAt - a.lastActiveAt
    );
  }

  /**
   * List sessions forked from a specific parent.
   */
  forksOf(parentSessionId: string): SessionEntry[] {
    return this.list().filter(
      (e) => e.parentSessionId === parentSessionId
    );
  }

  /**
   * Get the number of tracked sessions.
   */
  get size(): number {
    return this.sessions.size;
  }

  /**
   * Abort all active sessions and clear tracking.
   */
  disposeAll(): void {
    for (const entry of this.sessions.values()) {
      if (entry.session.isActive) {
        entry.session.abort();
      }
    }
    this.sessions.clear();
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private evictIfNeeded(): void {
    if (this.sessions.size < this.maxSessions) return;

    // Find the oldest idle session to evict
    let oldest: { id: string; at: number } | null = null;
    for (const [id, entry] of this.sessions) {
      if (entry.session.isActive) continue; // don't evict active sessions
      if (!oldest || entry.lastActiveAt < oldest.at) {
        oldest = { id, at: entry.lastActiveAt };
      }
    }

    if (oldest) {
      this.sessions.delete(oldest.id);
    }
  }
}
