import React, { useState, useEffect } from 'react';
import { ToolstripButton } from '@plannotator/ui/components/ToolstripButton';
import type { ChecklistViewMode } from '@plannotator/shared/checklist-types';

interface ViewModeToggleProps {
  mode: ChecklistViewMode;
  onModeChange: (mode: ChecklistViewMode) => void;
}

export const ViewModeToggle: React.FC<ViewModeToggleProps> = ({ mode, onModeChange }) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);

  return (
    <div className="inline-flex items-center gap-0.5 bg-muted/50 rounded-lg p-0.5 border border-border/30">
      <ToolstripButton
        active={mode === 'checklist'}
        onClick={() => onModeChange('checklist')}
        label="Checklist"
        color="primary"
        mounted={mounted}
        icon={
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
          </svg>
        }
      />
      <ToolstripButton
        active={mode === 'coverage'}
        onClick={() => onModeChange('coverage')}
        label="Coverage"
        color="secondary"
        mounted={mounted}
        icon={
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
        }
      />
    </div>
  );
};
