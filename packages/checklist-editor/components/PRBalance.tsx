import React, { useMemo, useState, useRef, useCallback } from 'react';
import type { FileDiffInfo } from '@plannotator/shared/checklist-types';

interface PRBalanceProps {
  fileDiffs: Record<string, number | FileDiffInfo>;
}

// --- Helpers ---

interface FileEntry {
  file: string;
  lines: number;
  status: 'new' | 'modified';
}

function toEntries(fileDiffs: Record<string, number | FileDiffInfo>): FileEntry[] {
  return Object.entries(fileDiffs).map(([file, val]) => {
    if (typeof val === 'number') {
      return { file, lines: val, status: 'modified' as const };
    }
    return { file, lines: val.lines, status: val.status };
  });
}

interface TreemapRect extends FileEntry {
  tx: number; ty: number; tw: number; th: number;
}

function squarify(items: FileEntry[], x: number, y: number, w: number, h: number): TreemapRect[] {
  const rects: TreemapRect[] = [];
  const total = items.reduce((s, i) => s + i.lines, 0);
  if (!total || !items.length) return rects;

  let remaining = [...items].sort((a, b) => b.lines - a.lines);
  let cx = x, cy = y, cw = w, ch = h;

  while (remaining.length) {
    const isWide = cw >= ch;
    const side = isWide ? ch : cw;
    const areaLeft = remaining.reduce((s, i) => s + i.lines, 0);
    const scale = (cw * ch) / areaLeft;
    let row = [remaining[0]];
    let rowArea = remaining[0].lines * scale;

    for (let i = 1; i < remaining.length; i++) {
      const newRow = [...row, remaining[i]];
      const newRowArea = rowArea + remaining[i].lines * scale;
      const worstNew = newRow.reduce((worst, item) => {
        const a = item.lines * scale;
        const rl = newRowArea / side;
        const is2 = a / rl;
        return Math.max(worst, Math.max(rl / is2, is2 / rl));
      }, 0);
      const worstOld = row.reduce((worst, item) => {
        const a = item.lines * scale;
        const rl = rowArea / side;
        const is2 = a / rl;
        return Math.max(worst, Math.max(rl / is2, is2 / rl));
      }, 0);
      if (worstNew <= worstOld) { row = newRow; rowArea = newRowArea; }
      else break;
    }

    const rowLen = rowArea / side;
    let offset = 0;
    for (const item of row) {
      const itemArea = item.lines * scale;
      const itemLen = itemArea / rowLen;
      if (isWide) rects.push({ ...item, tx: cx, ty: cy + offset, tw: rowLen, th: itemLen });
      else rects.push({ ...item, tx: cx + offset, ty: cy, tw: itemLen, th: rowLen });
      offset += itemLen;
    }
    if (isWide) { cx += rowLen; cw -= rowLen; }
    else { cy += rowLen; ch -= rowLen; }
    remaining = remaining.slice(row.length);
  }

  return rects;
}

// --- Constants ---
const SVG_W = 680;
const MARGIN_L = 30;
const MARGIN_R = 30;
const BEAM_Y = 420;
const BAR_FLOOR = BEAM_Y - 6;
const MAX_BAR_H = 350;
const BIN_TOP = 50;
const BIN_BOT = BEAM_Y - 16;
const BIN_H = BIN_BOT - BIN_TOP;
const BIN_GAP = 24;

// --- Component ---

export const PRBalance: React.FC<PRBalanceProps> = ({ fileDiffs }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; content: string } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const entries = useMemo(() => toEntries(fileDiffs), [fileDiffs]);

  // Check if we have enriched data (at least one FileDiffInfo object)
  const hasEnrichedData = useMemo(
    () => Object.values(fileDiffs).some(v => typeof v === 'object'),
    [fileDiffs],
  );

  // If no enriched data, don't render — PR Balance needs lines + status
  if (!hasEnrichedData || entries.length === 0) return null;

  // All layout geometry derived from entries in one pass
  const layout = useMemo(() => {
    // U-shape: modified descending (tallest at left edge), new ascending (tallest at right edge)
    const mod = entries.filter(e => e.status === 'modified').sort((a, b) => b.lines - a.lines);
    const nw = entries.filter(e => e.status === 'new').sort((a, b) => a.lines - b.lines);
    const all = [...mod, ...nw];
    const N = all.length;
    const split = mod.length;
    const totalMod = mod.reduce((s, f) => s + f.lines, 0);
    const totalNew = nw.reduce((s, f) => s + f.lines, 0);
    const totalAll = totalMod + totalNew;
    const maxLines = Math.max(...all.map(f => f.lines));

    const chartW = SVG_W - MARGIN_L - MARGIN_R;
    const GAP = 2;
    const BAR_W = Math.max(2, Math.floor((chartW - GAP * (N - 1)) / N));
    const totalBarsW = BAR_W * N + GAP * (N - 1);
    const offsetX = MARGIN_L + (chartW - totalBarsW) / 2;
    const divXPos = offsetX + split * (BAR_W + GAP) - GAP / 2;
    const modMidX = split > 0 ? offsetX + (split * (BAR_W + GAP) - GAP) / 2 : 0;
    const newMidX = nw.length > 0
      ? offsetX + split * (BAR_W + GAP) + ((N - split) * (BAR_W + GAP) - GAP) / 2
      : 0;

    // Center of mass
    const masses = all.map((f, i) => ({ x: offsetX + i * (BAR_W + GAP) + BAR_W / 2, m: f.lines }));
    const totalM = masses.reduce((s, p) => s + p.m, 0);
    const comX = masses.reduce((s, p) => s + p.x * p.m, 0) / totalM;

    // Treemap bins
    const leftBinX = MARGIN_L;
    const leftBinW = split > 0 ? divXPos - BIN_GAP / 2 - leftBinX : 0;
    const rightBinX = divXPos + BIN_GAP / 2;
    const rightBinW = SVG_W - MARGIN_R - rightBinX;

    const modTm = squarify(mod, leftBinX, BIN_TOP, leftBinW, BIN_H);
    const newTm = squarify(nw, rightBinX, BIN_TOP, rightBinW, BIN_H);
    const tmMap = new Map<string, TreemapRect>();
    modTm.forEach(t => tmMap.set(t.file + '_mod', t));
    newTm.forEach(t => tmMap.set(t.file + '_new', t));

    const yTicks = [200, 400, 600, 800].filter(v => BAR_FLOOR - (v / maxLines) * MAX_BAR_H >= 26);
    const pctNew = totalAll > 0 ? Math.round(totalNew / totalAll * 100) : 0;

    return {
      modified: mod, newFiles: nw, allFiles: all, splitIndex: split,
      totalMod, totalNew, maxLines, BAR_W, GAP, offsetX, divXPos,
      modMidX, newMidX, comX, leftBinX, leftBinW, rightBinX, rightBinW,
      treemapMap: tmMap, yTicks, pctNew,
    };
  }, [entries]);

  const {
    modified, newFiles, allFiles, splitIndex,
    totalMod, totalNew, maxLines, BAR_W, GAP, offsetX, divXPos,
    modMidX, newMidX, comX, leftBinX, leftBinW, rightBinX, rightBinW,
    treemapMap, yTicks, pctNew,
  } = layout;

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!tooltip) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    setTooltip(prev => prev ? { ...prev, x: e.clientX - rect.left + 14, y: e.clientY - rect.top - 40 } : null);
  }, [tooltip]);

  const showTip = useCallback((e: React.MouseEvent, content: string) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    setTooltip({ x: e.clientX - rect.left + 14, y: e.clientY - rect.top - 40, content });
  }, []);

  const hideTip = useCallback(() => setTooltip(null), []);

  return (
    <div className="relative">
      {/* Toggle button */}
      <div className="flex items-center gap-2 mb-2">
        <button
          onClick={() => { setCollapsed(c => !c); setTooltip(null); }}
          className="text-[10px] font-medium px-2 py-1 rounded-md bg-muted/50 border border-border/30 text-muted-foreground hover:text-foreground transition-colors"
        >
          {collapsed ? 'Expand to files' : 'Collapse to bins'}
        </button>
        <span className="text-[10px] text-muted-foreground/50">
          {collapsed ? 'Showing binned mass' : 'Showing individual files'}
        </span>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${SVG_W} 500`}
        className="w-full"
        onMouseMove={handleMouseMove}
      >
        {/* Divider line (dashed) */}
        {splitIndex > 0 && newFiles.length > 0 && (
          <line
            x1={divXPos} y1={20} x2={divXPos} y2={BEAM_Y}
            className="stroke-border/30" strokeWidth={1} strokeDasharray="4 4"
          />
        )}

        {/* Beam line */}
        <line
          x1={MARGIN_L - 10} y1={BEAM_Y} x2={SVG_W - MARGIN_R + 10} y2={BEAM_Y}
          className="stroke-border/30" strokeWidth={1.5}
          style={{ opacity: collapsed ? 0 : 1, transition: 'opacity 0.3s ease' }}
        />

        {/* Header labels */}
        {modified.length > 0 && (
          <text x={modMidX} y={18} textAnchor="middle" className="fill-muted-foreground/40" fontSize={12} fontWeight={500}>
            Modified · {modified.length} files · {totalMod.toLocaleString()} lines
          </text>
        )}
        {newFiles.length > 0 && (
          <text x={newMidX} y={18} textAnchor="middle" className="fill-muted-foreground/40" fontSize={12} fontWeight={500}>
            New · {newFiles.length} files · {totalNew.toLocaleString()} lines
          </text>
        )}

        {/* Y-axis ticks */}
        {yTicks.map(v => {
          const y = BAR_FLOOR - (v / maxLines) * MAX_BAR_H;
          return (
            <g key={v} style={{ opacity: collapsed ? 0 : 1, transition: 'opacity 0.4s ease' }}>
              <line x1={MARGIN_L - 6} y1={y} x2={MARGIN_L} y2={y} className="stroke-muted-foreground/30" strokeWidth={0.5} />
              <text x={MARGIN_L - 9} y={y} textAnchor="end" dominantBaseline="central" className="fill-muted-foreground/30" fontSize={10}>
                {v}
              </text>
            </g>
          );
        })}

        {/* Center of mass indicator */}
        <g style={{ opacity: collapsed ? 0 : 1, transition: 'opacity 0.4s ease' }}>
          <polygon
            points={`${comX},${BEAM_Y + 4} ${comX - 10},${BEAM_Y + 22} ${comX + 10},${BEAM_Y + 22}`}
            className="fill-warning"
          />
          <rect x={comX - 16} y={BEAM_Y + 22} width={32} height={4} rx={2} className="fill-warning" opacity={0.5} />
          <line x1={comX} y1={26} x2={comX} y2={BEAM_Y} className="stroke-warning" strokeWidth={1.5} opacity={0.2} />
          <text x={comX} y={BEAM_Y + 44} textAnchor="middle" className="fill-warning" fontSize={13} fontWeight={500}>
            Center of mass
          </text>
          <text x={comX} y={BEAM_Y + 60} textAnchor="middle" className="fill-warning" fontSize={12}>
            {pctNew >= 50 ? `${pctNew}% of weight is new files` : `${100 - pctNew}% of weight is modified files`}
          </text>
        </g>

        {/* Bin outlines (treemap mode) */}
        {modified.length > 0 && (
          <rect
            x={leftBinX - 1} y={BIN_TOP - 1} width={leftBinW + 2} height={BIN_H + 2}
            rx={6} fill="none" className="stroke-blue-500/60" strokeWidth={0.5}
            strokeDasharray="4 3"
            style={{ opacity: collapsed ? 0.3 : 0, transition: 'opacity 0.4s ease 0.15s' }}
          />
        )}
        {newFiles.length > 0 && (
          <rect
            x={rightBinX - 1} y={BIN_TOP - 1} width={rightBinW + 2} height={BIN_H + 2}
            rx={6} fill="none" className="stroke-success" strokeWidth={0.5}
            strokeDasharray="4 3"
            style={{ opacity: collapsed ? 0.3 : 0, transition: 'opacity 0.4s ease 0.15s' }}
          />
        )}

        {/* Bars / Treemap rects */}
        {allFiles.map((f, i) => {
          const isMod = i < splitIndex;
          const barX = offsetX + i * (BAR_W + GAP);
          const barH = (f.lines / maxLines) * MAX_BAR_H;
          const barY = BAR_FLOOR - barH;
          const key = f.file + (isMod ? '_mod' : '_new');
          const tm = treemapMap.get(key);
          const pad = 1.5;

          // Determine position based on mode
          const rx = collapsed && tm ? tm.tx + pad : barX;
          const ry = collapsed && tm ? tm.ty + pad : barY;
          const rw = collapsed && tm ? Math.max(tm.tw - pad * 2, 1) : BAR_W;
          const rh = collapsed && tm ? Math.max(tm.th - pad * 2, 1) : barH;

          const colorClass = isMod ? 'fill-blue-500/80' : 'fill-success';

          return (
            <g key={key}>
              <rect
                x={rx} y={ry} width={rw} height={rh}
                rx={collapsed ? 3 : 2}
                className={colorClass}
                opacity={0.75}
                style={{ transition: 'all 0.55s cubic-bezier(0.4, 0, 0.2, 1)', cursor: 'default' }}
                onMouseEnter={(e) => showTip(e, `${f.file}\n${f.lines} lines · ${isMod ? 'modified' : 'new'}`)}
                onMouseLeave={hideTip}
              />
              {/* Treemap label (only in collapsed mode for large enough cells) */}
              {collapsed && tm && tm.tw > 55 && tm.th > 28 && (
                <g
                  style={{ opacity: collapsed ? 1 : 0, transition: 'opacity 0.3s ease 0.25s', pointerEvents: 'none' }}
                  clipPath={`rect(${tm.ty + pad}px, ${tm.tx + tm.tw - pad}px, ${tm.ty + tm.th - pad}px, ${tm.tx + pad}px)`}
                >
                  <text
                    x={tm.tx + 7} y={tm.ty + 16}
                    className="fill-foreground/70"
                    fontSize={11} fontWeight={500}
                  >
                    {f.file.length > Math.floor(tm.tw / 7) ? f.file.slice(0, Math.floor(tm.tw / 7) - 2) + '...' : f.file}
                  </text>
                  <text
                    x={tm.tx + 7} y={tm.ty + 30}
                    className="fill-muted-foreground/50"
                    fontSize={10}
                  >
                    {f.lines} lines
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute pointer-events-none z-50 bg-popover border border-border rounded-md px-2.5 py-1.5 text-xs text-foreground shadow-md whitespace-pre-line"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          {tooltip.content}
        </div>
      )}
    </div>
  );
};
