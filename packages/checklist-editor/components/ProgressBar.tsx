import React, { useState, useEffect } from 'react';
import type { StatusCounts } from '../hooks/useChecklistProgress';

interface ProgressBarProps {
  counts: StatusCounts;
  stopped?: boolean;
  className?: string;
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');

  if (hours > 0) {
    const hh = String(hours).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ counts, stopped, className }) => {
  const { passed, failed, skipped, pending, total } = counts;
  const [elapsed, setElapsed] = useState(0);
  const [startTime] = useState(() => Date.now());

  useEffect(() => {
    if (stopped) return;
    const interval = setInterval(() => {
      setElapsed(Date.now() - startTime);
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime, stopped]);

  if (total === 0) return null;

  const reviewed = passed + failed + skipped;
  const pctValue = Math.round((reviewed / total) * 100);
  const pct = (n: number) => `${(n / total) * 100}%`;

  return (
    <div className={`space-y-1.5${className ? ` ${className}` : ''}`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono text-muted-foreground/40">
          {formatElapsed(elapsed)}
        </span>
        <span className="text-[10px] font-mono text-muted-foreground/60">
          {pctValue}% — {reviewed}/{total} reviewed
        </span>
      </div>
      <div className="h-1.5 w-full bg-muted/30 flex overflow-hidden rounded-full flex-shrink-0">
        {passed > 0 && (
          <div
            className="progress-segment bg-success h-full"
            style={{ width: pct(passed) }}
          />
        )}
        {failed > 0 && (
          <div
            className="progress-segment bg-destructive h-full"
            style={{ width: pct(failed) }}
          />
        )}
        {skipped > 0 && (
          <div
            className="progress-segment bg-warning h-full"
            style={{ width: pct(skipped) }}
          />
        )}
        {pending > 0 && (
          <div
            className="progress-segment bg-muted h-full"
            style={{ width: pct(pending) }}
          />
        )}
      </div>
    </div>
  );
};
