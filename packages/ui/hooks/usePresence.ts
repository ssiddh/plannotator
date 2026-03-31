/**
 * Presence awareness hook for collaborative viewing.
 *
 * Connects to SSE stream to track active viewers in real-time.
 */

import { useState, useEffect, useCallback, useRef } from "react";

export interface ViewerPresence {
  username: string;
  avatar: string;
  lastSeen: number;
}

interface PresenceEvent {
  type: "init" | "join" | "leave" | "update";
  viewers: ViewerPresence[];
}

interface UsePresenceOptions {
  pasteId: string;
  token: string | null;
  pasteServiceUrl?: string;
  heartbeatInterval?: number; // milliseconds, default 20000
  enabled?: boolean; // default true
}

interface UsePresenceResult {
  viewers: ViewerPresence[];
  isConnected: boolean;
  error: string | null;
  reconnect: () => void;
}

/**
 * Hook to track presence of viewers viewing the same paste.
 *
 * Establishes SSE connection to receive presence updates and sends
 * heartbeats to maintain active status.
 */
export function usePresence({
  pasteId,
  token,
  pasteServiceUrl = "http://localhost:19433",
  heartbeatInterval = 20000,
  enabled = true,
}: UsePresenceOptions): UsePresenceResult {
  const [viewers, setViewers] = useState<ViewerPresence[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  // Cleanup function
  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
    setIsConnected(false);
  }, []);

  // Send heartbeat to keep presence alive
  const sendHeartbeat = useCallback(async () => {
    if (!token) return;

    try {
      await fetch(`${pasteServiceUrl}/api/presence/${pasteId}/heartbeat`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
    } catch (err) {
      console.error("Failed to send heartbeat:", err);
    }
  }, [pasteId, token, pasteServiceUrl]);

  // Connect to SSE stream
  const connect = useCallback(() => {
    if (!enabled || !token) {
      return;
    }

    cleanup();

    try {
      // EventSource doesn't support custom headers, so pass token via query param
      const url = `${pasteServiceUrl}/api/presence/${pasteId}/stream?token=${encodeURIComponent(token)}`;
      const eventSource = new EventSource(url);

      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        console.log("Presence SSE connected");
        setIsConnected(true);
        setError(null);
        reconnectAttempts.current = 0;

        // Start heartbeat
        if (heartbeatTimerRef.current) {
          clearInterval(heartbeatTimerRef.current);
        }
        heartbeatTimerRef.current = setInterval(sendHeartbeat, heartbeatInterval);
      };

      eventSource.onmessage = (event) => {
        try {
          const presenceEvent: PresenceEvent = JSON.parse(event.data);

          // Update viewers list
          setViewers(presenceEvent.viewers);

          // Log presence events for debugging
          console.log(`Presence event: ${presenceEvent.type}`, presenceEvent.viewers);
        } catch (err) {
          console.error("Failed to parse presence event:", err);
        }
      };

      eventSource.onerror = (err) => {
        console.error("Presence SSE error:", err);
        setIsConnected(false);

        // Attempt reconnection with exponential backoff
        if (reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          reconnectAttempts.current++;

          console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current})`);
          setTimeout(connect, delay);
        } else {
          setError("Failed to connect to presence stream after multiple attempts");
          cleanup();
        }
      };
    } catch (err) {
      console.error("Failed to establish presence connection:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
      setIsConnected(false);
    }
  }, [pasteId, token, pasteServiceUrl, heartbeatInterval, enabled, cleanup, sendHeartbeat]);

  // Connect on mount and when dependencies change
  useEffect(() => {
    if (enabled && token) {
      connect();
    }

    return cleanup;
  }, [enabled, token, connect, cleanup]);

  return {
    viewers,
    isConnected,
    error,
    reconnect: connect,
  };
}
