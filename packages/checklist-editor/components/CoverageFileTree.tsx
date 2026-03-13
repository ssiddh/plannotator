import React, { useState, useMemo, useCallback } from 'react';
import { WaffleCells } from './WaffleCells';
import type { FileTreeNode } from '../hooks/useChecklistCoverage';

interface CoverageFileTreeProps {
  tree: FileTreeNode[];
}

// Collect all directory paths for initial expanded state
function collectDirPaths(nodes: FileTreeNode[]): string[] {
  const paths: string[] = [];
  for (const node of nodes) {
    if (node.type === 'dir') {
      paths.push(node.path);
      if (node.children) {
        paths.push(...collectDirPaths(node.children));
      }
    }
  }
  return paths;
}

const FolderIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.06-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
  </svg>
);

const FileIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
  </svg>
);

const ChevronIcon: React.FC<{ expanded: boolean; className?: string }> = ({ expanded, className }) => (
  <svg
    className={`${className} transition-transform duration-150`}
    style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
  </svg>
);

const TreeRow: React.FC<{
  node: FileTreeNode;
  depth: number;
  expandedDirs: Set<string>;
  onToggle: (path: string) => void;
}> = ({ node, depth, expandedDirs, onToggle }) => {
  const isDir = node.type === 'dir';
  const isExpanded = isDir && expandedDirs.has(node.path);
  const coveredDiffs = node.passedDiffs + node.failedDiffs + node.skippedDiffs;
  const percent = node.totalDiffs > 0
    ? Math.round((coveredDiffs / node.totalDiffs) * 100)
    : 0;
  const isFull = percent === 100 && node.totalDiffs > 0;

  return (
    <>
      <div
        className={`flex items-center h-7 px-2 group cursor-default select-none transition-colors duration-150 ${
          isFull ? 'bg-success/[0.04]' : 'hover:bg-muted/30'
        }`}
        style={{ paddingLeft: depth * 16 + 8 }}
        onClick={() => isDir && onToggle(node.path)}
      >
        {/* Chevron for directories */}
        {isDir ? (
          <ChevronIcon
            expanded={isExpanded}
            className="w-3 h-3 text-muted-foreground/50 mr-1 shrink-0 cursor-pointer"
          />
        ) : (
          <span className="w-3 mr-1 shrink-0" />
        )}

        {/* Icon */}
        {isDir ? (
          <FolderIcon className="w-3.5 h-3.5 text-muted-foreground/60 mr-1.5 shrink-0" />
        ) : (
          <FileIcon className="w-3.5 h-3.5 text-muted-foreground/40 mr-1.5 shrink-0" />
        )}

        {/* Name */}
        <span className={`text-xs truncate min-w-0 ${
          isDir ? 'font-medium text-foreground/80' : 'font-mono text-foreground/60'
        }`}>
          {node.name}{isDir ? '/' : ''}
        </span>

        {/* Spacer */}
        <span className="flex-1 min-w-3" />

        {/* Waffle cells */}
        <WaffleCells
          total={node.totalDiffs}
          passed={node.passedDiffs}
          failed={node.failedDiffs}
          skipped={node.skippedDiffs}
          maxCells={isDir ? 20 : 30}
          cellSize={7}
        />

        {/* Percentage */}
        <span className={`text-[10px] font-mono ml-2 w-8 text-right shrink-0 ${
          isFull
            ? 'text-success/80'
            : percent > 0
              ? 'text-muted-foreground/70'
              : 'text-muted-foreground/30'
        }`}>
          {percent}%
        </span>
      </div>

      {/* Children */}
      {isDir && isExpanded && node.children?.map(child => (
        <TreeRow
          key={child.path}
          node={child}
          depth={depth + 1}
          expandedDirs={expandedDirs}
          onToggle={onToggle}
        />
      ))}
    </>
  );
};

export const CoverageFileTree: React.FC<CoverageFileTreeProps> = ({ tree }) => {
  const allDirPaths = useMemo(() => new Set(collectDirPaths(tree)), [tree]);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(allDirPaths);

  // Sync expanded dirs when tree changes (new dirs should start expanded)
  useMemo(() => {
    const newDirs = collectDirPaths(tree);
    setExpandedDirs(prev => {
      const next = new Set(prev);
      for (const d of newDirs) {
        if (!prev.has(d) && !allDirPaths.has(d)) {
          // genuinely new directory
        }
        next.add(d);
      }
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree]);

  const handleToggle = useCallback((path: string) => {
    setExpandedDirs(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  return (
    <div className="py-1">
      {tree.map(node => (
        <TreeRow
          key={node.path}
          node={node}
          depth={0}
          expandedDirs={expandedDirs}
          onToggle={handleToggle}
        />
      ))}
    </div>
  );
};
