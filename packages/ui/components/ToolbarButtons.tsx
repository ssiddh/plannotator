import React from 'react';

interface FeedbackButtonProps {
  onClick: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  label?: string;
  loadingLabel?: string;
  title?: string;
  muted?: boolean;
}

export const FeedbackButton: React.FC<FeedbackButtonProps> = ({
  onClick,
  disabled = false,
  isLoading = false,
  label = 'Send Feedback',
  loadingLabel = 'Sending...',
  title = 'Send Feedback',
  muted = false,
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`p-1.5 md:px-2.5 md:py-1 rounded-md text-xs font-medium transition-all ${
      muted
        ? 'opacity-50 cursor-not-allowed bg-accent/10 text-accent/50'
        : disabled
          ? 'opacity-50 cursor-not-allowed bg-muted text-muted-foreground'
          : 'bg-accent/15 text-accent hover:bg-accent/25 border border-accent/30'
    }`}
    title={title}
  >
    <svg className="w-4 h-4 md:hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
    <span className="hidden md:inline">{isLoading ? loadingLabel : label}</span>
  </button>
);

interface ApproveButtonProps {
  onClick: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  label?: string;
  loadingLabel?: string;
  mobileLabel?: string;
  mobileLoadingLabel?: string;
  title?: string;
  dimmed?: boolean;
  muted?: boolean;
}

export const ApproveButton: React.FC<ApproveButtonProps> = ({
  onClick,
  disabled = false,
  isLoading = false,
  label = 'Approve',
  loadingLabel = 'Approving...',
  mobileLabel = 'OK',
  mobileLoadingLabel = '...',
  title,
  dimmed = false,
  muted = false,
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`px-2 py-1 md:px-2.5 rounded-md text-xs font-medium transition-all ${
      muted
        ? 'opacity-40 cursor-not-allowed bg-muted text-muted-foreground'
        : disabled
          ? 'opacity-50 cursor-not-allowed bg-muted text-muted-foreground'
          : dimmed
            ? 'bg-success/50 text-success-foreground/70 hover:bg-success hover:text-success-foreground'
            : 'bg-success text-success-foreground hover:opacity-90'
    }`}
    title={title}
  >
    <span className="md:hidden">{isLoading ? mobileLoadingLabel : mobileLabel}</span>
    <span className="hidden md:inline">{isLoading ? loadingLabel : label}</span>
  </button>
);

interface OutboundSyncButtonProps {
  onClick: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  unsyncedCount?: number;
  title?: string;
  disabledTitle?: string;
}

export const OutboundSyncButton: React.FC<OutboundSyncButtonProps> = ({
  onClick,
  disabled = false,
  isLoading = false,
  unsyncedCount = 0,
  title = "Sync to GitHub",
  disabledTitle = "Create a PR first to sync annotations",
}) => (
  <button
    onClick={onClick}
    disabled={disabled || isLoading}
    className={`relative p-1.5 md:px-2.5 md:py-1 rounded-md text-xs font-semibold transition-all ${
      disabled
        ? "opacity-50 cursor-not-allowed bg-muted text-muted-foreground"
        : "bg-accent/15 text-accent hover:bg-accent/25 border border-accent/30"
    }`}
    title={disabled ? disabledTitle : title}
  >
    {/* Upload arrow icon — 16x16px, per UI-SPEC */}
    <svg
      className={`w-4 h-4 md:hidden ${isLoading ? "animate-spin" : ""}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
      />
    </svg>
    <span className="hidden md:inline">
      {isLoading ? (
        <>
          <svg
            className="w-3.5 h-3.5 inline mr-1 animate-spin"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
            />
          </svg>
          Syncing...
        </>
      ) : (
        "Push"
      )}
    </span>
    {/* Badge -- per UI-SPEC: 16px circle, absolute positioned top-right */}
    {unsyncedCount > 0 && !isLoading && (
      <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-[16px] h-4 rounded-full bg-accent text-accent-foreground text-[10px] font-mono font-semibold px-0.5">
        {unsyncedCount > 9 ? "9+" : unsyncedCount}
      </span>
    )}
  </button>
);

interface SyncButtonProps {
  onClick: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  newCount?: number;
  title?: string;
  disabledTitle?: string;
}

export const SyncButton: React.FC<SyncButtonProps> = ({
  onClick,
  disabled = false,
  isLoading = false,
  newCount = 0,
  title = "Sync from GitHub",
  disabledTitle = "Create a PR first to sync comments",
}) => (
  <button
    onClick={onClick}
    disabled={disabled || isLoading}
    className={`relative p-1.5 md:px-2.5 md:py-1 rounded-md text-xs font-semibold transition-all ${
      disabled
        ? "opacity-50 cursor-not-allowed bg-muted text-muted-foreground"
        : "bg-accent/15 text-accent hover:bg-accent/25 border border-accent/30"
    }`}
    title={disabled ? disabledTitle : title}
  >
    {/* Sync icon - circular arrows, 16x16px, per UI-SPEC */}
    <svg
      className={`w-4 h-4 md:hidden ${isLoading ? "animate-spin" : ""}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    </svg>
    <span className="hidden md:inline">
      {isLoading ? (
        <>
          <svg
            className="w-3.5 h-3.5 inline mr-1 animate-spin"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          Syncing...
        </>
      ) : (
        "Sync"
      )}
    </span>
    {/* Badge -- per UI-SPEC: 16px circle, absolute positioned top-right */}
    {newCount > 0 && !isLoading && (
      <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-[16px] h-4 rounded-full bg-accent text-accent-foreground text-[10px] font-mono font-semibold px-0.5">
        {newCount > 9 ? "9+" : newCount}
      </span>
    )}
  </button>
);
