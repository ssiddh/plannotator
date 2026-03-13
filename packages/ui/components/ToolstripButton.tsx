import React, { useState, useRef, useLayoutEffect } from 'react';

/* ─── Color system ─── */

export const toolstripColorStyles = {
  primary: {
    active: 'bg-background text-foreground shadow-sm',
    hover: 'text-primary/80 bg-primary/8',
    inactive: 'text-muted-foreground hover:text-foreground',
  },
  secondary: {
    active: 'bg-background text-foreground shadow-sm',
    hover: 'text-secondary/80 bg-secondary/8',
    inactive: 'text-muted-foreground hover:text-foreground',
  },
  accent: {
    active: 'bg-background text-foreground shadow-sm',
    hover: 'text-accent/80 bg-accent/8',
    inactive: 'text-muted-foreground hover:text-foreground',
  },
  destructive: {
    active: 'bg-background text-foreground shadow-sm',
    hover: 'text-destructive/80 bg-destructive/8',
    inactive: 'text-muted-foreground hover:text-foreground',
  },
} as const;

export type ToolstripButtonColor = keyof typeof toolstripColorStyles;

/* ─── Constants ─── */

export const ICON_SIZE = 28;       // collapsed button width (px)
const H_PAD = 10;           // horizontal padding when expanded (px) — matches px-2.5
const GAP = 6;              // gap between icon and label (px) — matches gap-1.5
const ICON_INNER = 14;      // icon element width (px)
export const DURATION = 180;       // transition ms

/* ─── Button ─── */

export interface ToolstripButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  color: ToolstripButtonColor;
  mounted: boolean;
}

export const ToolstripButton: React.FC<ToolstripButtonProps> = ({ active, onClick, icon, label, color, mounted }) => {
  const [hovered, setHovered] = useState(false);
  const [labelWidth, setLabelWidth] = useState(0);
  const measureRef = useRef<HTMLSpanElement>(null);
  const styles = toolstripColorStyles[color];

  // Measure label text width synchronously before first paint
  useLayoutEffect(() => {
    if (measureRef.current) {
      setLabelWidth(measureRef.current.offsetWidth);
    }
  }, [label]);

  const expanded = active || hovered;
  const expandedWidth = H_PAD + ICON_INNER + GAP + labelWidth + H_PAD;
  const currentWidth = expanded ? expandedWidth : ICON_SIZE;

  const colorClass = active
    ? styles.active
    : hovered
      ? styles.hover
      : styles.inactive;

  const transition = mounted
    ? `width ${DURATION}ms cubic-bezier(0.25, 0.46, 0.45, 0.94), background-color ${DURATION}ms ease, color ${DURATION}ms ease, box-shadow ${DURATION}ms ease`
    : 'none';

  const innerTransition = mounted
    ? `padding-left ${DURATION}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`
    : 'none';

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`relative flex items-center h-7 rounded-md overflow-hidden ${colorClass}`}
      style={{ width: currentWidth, transition }}
    >
      {/* Inner flex container — fixed layout, no layout-shifting properties animated */}
      <div
        className="flex items-center whitespace-nowrap"
        style={{ paddingLeft: expanded ? H_PAD : (ICON_SIZE - ICON_INNER) / 2, gap: GAP, transition: innerTransition }}
      >
        {icon}
        <span
          className="text-xs font-medium"
          style={{
            opacity: expanded ? 1 : 0,
            transition: mounted ? `opacity ${expanded ? DURATION : DURATION * 0.6}ms ease ${expanded ? '60ms' : '0ms'}` : 'none',
          }}
        >
          {label}
        </span>
      </div>

      {/* Hidden measurement span — rendered offscreen to get label pixel width */}
      <span
        ref={measureRef}
        className="text-xs font-medium absolute pointer-events-none"
        style={{ visibility: 'hidden', position: 'absolute', left: -9999 }}
        aria-hidden
      >
        {label}
      </span>
    </button>
  );
};
