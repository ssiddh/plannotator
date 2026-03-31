/**
 * Presence tracking for collaborative plan viewing.
 *
 * Implements Server-Sent Events (SSE) to track and broadcast active viewers.
 * Viewers send heartbeats every 20s, auto-removed after 30s of inactivity.
 */

import type { GitHubUser } from "../auth/types";

const HEARTBEAT_TIMEOUT = 30_000; // 30 seconds
const CLEANUP_INTERVAL = 10_000; // 10 seconds

interface ViewerPresence {
  user: GitHubUser;
  lastSeen: number; // Timestamp
  streamController?: ReadableStreamDefaultController;
}

interface PresenceStore {
  [pasteId: string]: Map<string, ViewerPresence>; // username -> presence
}

// In-memory store (per-worker instance)
const presenceStore: PresenceStore = {};

/**
 * Get active viewers for a paste (excluding viewers past heartbeat timeout).
 */
function getActiveViewers(pasteId: string): ViewerPresence[] {
  const viewers = presenceStore[pasteId];
  if (!viewers) return [];

  const now = Date.now();
  const active: ViewerPresence[] = [];

  for (const [username, presence] of viewers.entries()) {
    if (now - presence.lastSeen < HEARTBEAT_TIMEOUT) {
      active.push(presence);
    } else {
      // Expired - remove
      viewers.delete(username);
    }
  }

  return active;
}

/**
 * Broadcast presence update to all connected viewers.
 */
function broadcastPresence(pasteId: string, eventType: "join" | "leave" | "update") {
  const viewers = presenceStore[pasteId];
  if (!viewers) return;

  const activeViewers = getActiveViewers(pasteId);
  const payload = JSON.stringify({
    type: eventType,
    viewers: activeViewers.map((v) => ({
      username: v.user.login,
      avatar: v.user.avatar_url,
      lastSeen: v.lastSeen,
    })),
  });

  for (const presence of viewers.values()) {
    if (presence.streamController) {
      try {
        presence.streamController.enqueue(`data: ${payload}\n\n`);
      } catch (e) {
        // Stream closed
        console.error("Failed to send presence update:", e);
      }
    }
  }
}

/**
 * Start periodic cleanup of expired viewers.
 */
function startCleanup() {
  setInterval(() => {
    for (const pasteId in presenceStore) {
      const viewers = presenceStore[pasteId];
      const now = Date.now();

      for (const [username, presence] of viewers.entries()) {
        if (now - presence.lastSeen >= HEARTBEAT_TIMEOUT) {
          viewers.delete(username);
          broadcastPresence(pasteId, "leave");
        }
      }

      // Remove empty paste entries
      if (viewers.size === 0) {
        delete presenceStore[pasteId];
      }
    }
  }, CLEANUP_INTERVAL);
}

// Start cleanup on module load
startCleanup();

/**
 * Handle presence SSE stream connection.
 * Sends presence updates when viewers join/leave.
 */
export function handlePresenceStream(
  pasteId: string,
  user: GitHubUser
): Response {
  if (!presenceStore[pasteId]) {
    presenceStore[pasteId] = new Map();
  }

  const viewers = presenceStore[pasteId];
  const username = user.login;

  // Create SSE stream
  const stream = new ReadableStream({
    start(controller) {
      // Store controller for broadcasting
      const presence: ViewerPresence = {
        user,
        lastSeen: Date.now(),
        streamController: controller,
      };
      viewers.set(username, presence);

      // Send initial viewer list
      const activeViewers = getActiveViewers(pasteId);
      const initialPayload = JSON.stringify({
        type: "init",
        viewers: activeViewers.map((v) => ({
          username: v.user.login,
          avatar: v.user.avatar_url,
          lastSeen: v.lastSeen,
        })),
      });
      controller.enqueue(`data: ${initialPayload}\n\n`);

      // Broadcast join event to other viewers
      broadcastPresence(pasteId, "join");

      console.log(`Viewer joined: ${username} on paste ${pasteId}`);
    },
    cancel() {
      // Clean up when client disconnects
      const presence = viewers.get(username);
      if (presence) {
        viewers.delete(username);
        broadcastPresence(pasteId, "leave");
        console.log(`Viewer left: ${username} on paste ${pasteId}`);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // Disable nginx buffering
    },
  });
}

/**
 * Handle heartbeat ping to keep viewer alive.
 */
export function handleHeartbeat(pasteId: string, username: string): Response {
  const viewers = presenceStore[pasteId];
  if (!viewers) {
    return Response.json({ error: "No active session" }, { status: 404 });
  }

  const presence = viewers.get(username);
  if (!presence) {
    return Response.json({ error: "Viewer not found" }, { status: 404 });
  }

  // Update last seen timestamp
  presence.lastSeen = Date.now();

  return Response.json({ ok: true });
}
