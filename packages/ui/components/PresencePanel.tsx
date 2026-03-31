/**
 * Presence panel showing active viewers.
 *
 * Displays GitHub avatars of users currently viewing the plan.
 */

import { usePresence, type ViewerPresence } from "../hooks/usePresence";

interface PresencePanelProps {
  pasteId: string;
  token: string | null;
  pasteServiceUrl?: string;
  className?: string;
}

/**
 * Display active viewers with GitHub avatars.
 * Shows in top-right corner of the plan viewer.
 */
export function PresencePanel({
  pasteId,
  token,
  pasteServiceUrl,
  className = "",
}: PresencePanelProps) {
  const { viewers, isConnected, error } = usePresence({
    pasteId,
    token,
    pasteServiceUrl,
    enabled: !!token, // Only enable if authenticated
  });

  // Don't show panel if not connected or no viewers
  if (!isConnected || viewers.length === 0) {
    return null;
  }

  // Show error state if present
  if (error) {
    return (
      <div
        className={`presence-panel presence-error ${className}`}
        title={`Presence error: ${error}`}
      >
        <span className="presence-icon">⚠️</span>
      </div>
    );
  }

  // Sort viewers by username for consistent display
  const sortedViewers = [...viewers].sort((a, b) =>
    a.username.localeCompare(b.username)
  );

  return (
    <div className={`presence-panel ${className}`}>
      <div className="presence-avatars">
        {sortedViewers.map((viewer) => (
          <ViewerAvatar key={viewer.username} viewer={viewer} />
        ))}
      </div>
      <span className="presence-count">
        {viewers.length} {viewers.length === 1 ? "viewer" : "viewers"}
      </span>
    </div>
  );
}

/**
 * Individual viewer avatar with tooltip.
 */
function ViewerAvatar({ viewer }: { viewer: ViewerPresence }) {
  const timeSinceLastSeen = Date.now() - viewer.lastSeen;
  const isStale = timeSinceLastSeen > 30000; // 30 seconds

  return (
    <div
      className={`viewer-avatar ${isStale ? "viewer-stale" : ""}`}
      title={`@${viewer.username}${isStale ? " (inactive)" : ""}`}
    >
      <img
        src={viewer.avatar}
        alt={`@${viewer.username}`}
        className="viewer-avatar-image"
        loading="lazy"
      />
      {!isStale && <div className="viewer-active-indicator" />}
    </div>
  );
}

/**
 * CSS for presence panel (to be added to theme.css):
 *
 * .presence-panel {
 *   position: fixed;
 *   top: 20px;
 *   right: 20px;
 *   display: flex;
 *   align-items: center;
 *   gap: 12px;
 *   background: var(--color-bg);
 *   border: 1px solid var(--color-border);
 *   border-radius: 24px;
 *   padding: 8px 16px;
 *   box-shadow: var(--shadow-sm);
 *   z-index: 100;
 * }
 *
 * .presence-avatars {
 *   display: flex;
 *   gap: -8px; /* Overlap avatars slightly *\/
 * }
 *
 * .viewer-avatar {
 *   position: relative;
 *   width: 32px;
 *   height: 32px;
 *   border-radius: 50%;
 *   border: 2px solid var(--color-bg);
 *   overflow: hidden;
 *   transition: transform 0.2s;
 * }
 *
 * .viewer-avatar:hover {
 *   transform: scale(1.1);
 *   z-index: 10;
 * }
 *
 * .viewer-avatar-image {
 *   width: 100%;
 *   height: 100%;
 *   object-fit: cover;
 * }
 *
 * .viewer-active-indicator {
 *   position: absolute;
 *   bottom: 0;
 *   right: 0;
 *   width: 10px;
 *   height: 10px;
 *   background: var(--color-success);
 *   border: 2px solid var(--color-bg);
 *   border-radius: 50%;
 * }
 *
 * .viewer-stale {
 *   opacity: 0.5;
 * }
 *
 * .presence-count {
 *   font-size: 14px;
 *   color: var(--color-text-muted);
 *   white-space: nowrap;
 * }
 *
 * .presence-error {
 *   background: var(--color-danger-bg);
 *   border-color: var(--color-danger);
 * }
 *
 * .presence-icon {
 *   font-size: 18px;
 * }
 */
