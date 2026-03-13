import React from 'react';

// Cells are allocated in severity order: red (failed) first, then yellow
// (skipped), then green (passed), then gray (pending). When items overlap
// on the same file, the worst outcome takes visual priority — a passing
// check never hides a failure.

interface WaffleCellsProps {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  maxCells?: number;
  cellSize?: number;
}

const CELL_CLASSES = {
  failed: 'bg-destructive rounded-[1px] transition-colors duration-200',
  skipped: 'bg-warning rounded-[1px] transition-colors duration-200',
  passed: 'bg-success rounded-[1px] transition-colors duration-200',
  pending: 'bg-muted-foreground/15 rounded-[1px] transition-colors duration-200',
} as const;

export const WaffleCells: React.FC<WaffleCellsProps> = ({
  total,
  passed,
  failed,
  skipped,
  maxCells = 20,
  cellSize = 7,
}) => {
  if (total === 0) return null;

  const covered = passed + failed + skipped;

  // When total exceeds maxCells, compress proportionally
  let cellCount: number;
  let redCount: number;
  let yellowCount: number;
  let greenCount: number;

  if (total <= maxCells) {
    cellCount = total;
    redCount = failed;
    yellowCount = skipped;
    greenCount = passed;
  } else {
    cellCount = maxCells;
    redCount = Math.round((failed / total) * maxCells);
    yellowCount = Math.round((skipped / total) * maxCells);
    greenCount = Math.round((passed / total) * maxCells);
    // Clamp so we don't exceed cellCount due to rounding
    const colorTotal = redCount + yellowCount + greenCount;
    if (colorTotal > cellCount) {
      greenCount = Math.max(0, cellCount - redCount - yellowCount);
    }
  }

  return (
    <div
      className="flex items-center shrink-0"
      style={{ gap: 2 }}
      title={`${covered} / ${total} diffs covered`}
    >
      {Array.from({ length: cellCount }, (_, i) => {
        let cls: string;
        if (i < redCount) cls = CELL_CLASSES.failed;
        else if (i < redCount + yellowCount) cls = CELL_CLASSES.skipped;
        else if (i < redCount + yellowCount + greenCount) cls = CELL_CLASSES.passed;
        else cls = CELL_CLASSES.pending;

        return (
          <div
            key={i}
            className={cls}
            style={{ width: cellSize, height: cellSize }}
          />
        );
      })}
    </div>
  );
};
