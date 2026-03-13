import React from 'react';
import type { ChecklistItemStatus } from '../hooks/useChecklistState';

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

const PassIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

const FailIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const SkipIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
  </svg>
);

// ---------------------------------------------------------------------------
// Status Icon (for display)
// ---------------------------------------------------------------------------

export const StatusIcon: React.FC<{ status: ChecklistItemStatus; className?: string }> = ({
  status,
  className = 'w-4 h-4',
}) => {
  switch (status) {
    case 'passed':
      return (
        <div className={`${className} rounded-full bg-success/20 text-success flex items-center justify-center`}>
          <PassIcon className="w-2.5 h-2.5" />
        </div>
      );
    case 'failed':
      return (
        <div className={`${className} rounded-full bg-destructive/20 text-destructive flex items-center justify-center`}>
          <FailIcon className="w-2.5 h-2.5" />
        </div>
      );
    case 'skipped':
      return (
        <div className={`${className} rounded-full bg-warning/20 text-warning flex items-center justify-center`}>
          <SkipIcon className="w-2.5 h-2.5" />
        </div>
      );
    default:
      return (
        <div className={`${className} rounded-full border border-border flex items-center justify-center`}>
          <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />
        </div>
      );
  }
};

// ---------------------------------------------------------------------------
// Action Buttons
// ---------------------------------------------------------------------------

interface StatusButtonProps {
  status: ChecklistItemStatus;
  currentStatus: ChecklistItemStatus;
  onClick: () => void;
  size?: 'xs' | 'sm' | 'md';
}

const CONFIG: Record<
  'passed' | 'failed' | 'skipped',
  { label: string; shortcut: string; activeClass: string; hoverClass: string; Icon: React.FC<{ className?: string }> }
> = {
  passed: {
    label: 'Pass',
    shortcut: 'P',
    activeClass: 'bg-success text-success-foreground',
    hoverClass: 'hover:bg-success/15 hover:text-success',
    Icon: PassIcon,
  },
  failed: {
    label: 'Fail',
    shortcut: 'F',
    activeClass: 'bg-destructive text-destructive-foreground',
    hoverClass: 'hover:bg-destructive/15 hover:text-destructive',
    Icon: FailIcon,
  },
  skipped: {
    label: 'Skip',
    shortcut: 'S',
    activeClass: 'bg-warning text-warning-foreground',
    hoverClass: 'hover:bg-warning/15 hover:text-warning',
    Icon: SkipIcon,
  },
};

export const StatusButton: React.FC<StatusButtonProps> = ({
  status,
  currentStatus,
  onClick,
  size = 'md',
}) => {
  if (status === 'pending') return null;
  const cfg = CONFIG[status];
  const isActive = currentStatus === status;
  const sizeClass = size === 'xs'
    ? 'p-1'
    : size === 'sm'
      ? 'px-1.5 py-0.5 text-[10px] gap-0.5'
      : 'px-2.5 py-1.5 text-xs gap-1.5';
  const iconClass = size === 'xs' ? 'w-2.5 h-2.5' : size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5';

  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center rounded-md font-medium transition-colors ${sizeClass} ${
        isActive ? cfg.activeClass : `bg-muted/50 text-muted-foreground ${cfg.hoverClass}`
      }`}
      title={`${cfg.label} (${cfg.shortcut})`}
    >
      <cfg.Icon className={iconClass} />
      {size !== 'xs' && <span>{cfg.label}</span>}
    </button>
  );
};

// ---------------------------------------------------------------------------
// Quick Action Buttons (compact row for hover)
// ---------------------------------------------------------------------------

interface QuickActionsProps {
  currentStatus: ChecklistItemStatus;
  onSetStatus: (status: ChecklistItemStatus) => void;
}

export const QuickActions: React.FC<QuickActionsProps> = ({ currentStatus, onSetStatus }) => (
  <div className="quick-actions flex items-center gap-1" onClick={e => e.stopPropagation()}>
    {(['passed', 'failed', 'skipped'] as const).map(s => (
      <StatusButton
        key={s}
        status={s}
        currentStatus={currentStatus}
        onClick={() => onSetStatus(currentStatus === s ? 'pending' : s)}
      />
    ))}
  </div>
);
