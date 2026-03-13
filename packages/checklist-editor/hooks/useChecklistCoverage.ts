import { useMemo } from 'react';
import type { ChecklistItem, ChecklistItemResult } from '@plannotator/shared/checklist-types';

export interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'dir';
  totalDiffs: number;
  passedDiffs: number;
  failedDiffs: number;
  skippedDiffs: number;
  children?: FileTreeNode[];
}

export interface CoverageData {
  tree: FileTreeNode[];
  globalCovered: number;
  globalTotal: number;
  globalPercent: number;
}

interface FileCoverageEntry {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
}

// Waffle cells are a diagnostic map, not a progress bar.
//
// Each cell represents a diff hunk. Color shows the verification outcome:
//   red    = failed (problem found)
//   yellow = skipped (acknowledged but unverified)
//   green  = passed (verified and cleared)
//   gray   = pending (not yet examined)
//
// When multiple items cover the same file, cells are allocated in severity
// order: red first, then yellow, then green. Each is clamped so the sum
// never exceeds the file's total hunks. This means failed items always
// dominate overlapping coverage — a passing check doesn't hide a failure.

function computeFileCoverage(
  fileDiffs: Record<string, number>,
  items: ChecklistItem[],
  results: Map<string, ChecklistItemResult>,
): Map<string, FileCoverageEntry> {
  const coverage = new Map<string, FileCoverageEntry>();

  for (const [file, total] of Object.entries(fileDiffs)) {
    coverage.set(file, { total, passed: 0, failed: 0, skipped: 0 });
  }

  for (const item of items) {
    if (!item.diffMap) continue;
    const result = results.get(item.id);
    const status = result?.status ?? 'pending';
    if (status === 'pending') continue;

    for (const [file, hunks] of Object.entries(item.diffMap)) {
      const entry = coverage.get(file);
      if (!entry) continue;

      if (status === 'passed') entry.passed += hunks;
      else if (status === 'failed') entry.failed += hunks;
      else if (status === 'skipped') entry.skipped += hunks;
    }
  }

  // Clamp each bucket so the sum doesn't exceed total.
  // Severity order: failed eats into capacity first, then skipped, then passed.
  for (const entry of coverage.values()) {
    entry.failed = Math.min(entry.failed, entry.total);
    entry.skipped = Math.min(entry.skipped, entry.total - entry.failed);
    entry.passed = Math.min(entry.passed, entry.total - entry.failed - entry.skipped);
  }

  return coverage;
}

function buildFileTree(
  fileCoverage: Map<string, FileCoverageEntry>,
): FileTreeNode[] {
  const root: FileTreeNode[] = [];

  for (const [filePath, entry] of fileCoverage) {
    const segments = filePath.split('/');
    let current = root;

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const isFile = i === segments.length - 1;
      const fullPath = segments.slice(0, i + 1).join('/');

      let node = current.find(n => n.name === segment);
      if (!node) {
        node = {
          name: segment,
          path: fullPath,
          type: isFile ? 'file' : 'dir',
          totalDiffs: isFile ? entry.total : 0,
          passedDiffs: isFile ? entry.passed : 0,
          failedDiffs: isFile ? entry.failed : 0,
          skippedDiffs: isFile ? entry.skipped : 0,
          ...(isFile ? {} : { children: [] }),
        };
        current.push(node);
      }

      if (isFile) {
        node.totalDiffs = entry.total;
        node.passedDiffs = entry.passed;
        node.failedDiffs = entry.failed;
        node.skippedDiffs = entry.skipped;
      } else {
        current = node.children!;
      }
    }
  }

  function aggregate(nodes: FileTreeNode[]): { total: number; passed: number; failed: number; skipped: number } {
    let total = 0, passed = 0, failed = 0, skipped = 0;
    for (const node of nodes) {
      if (node.type === 'dir' && node.children) {
        const child = aggregate(node.children);
        node.totalDiffs = child.total;
        node.passedDiffs = child.passed;
        node.failedDiffs = child.failed;
        node.skippedDiffs = child.skipped;
      }
      total += node.totalDiffs;
      passed += node.passedDiffs;
      failed += node.failedDiffs;
      skipped += node.skippedDiffs;
    }
    return { total, passed, failed, skipped };
  }

  aggregate(root);

  function sortTree(nodes: FileTreeNode[]) {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const node of nodes) {
      if (node.children) sortTree(node.children);
    }
  }
  sortTree(root);

  return root;
}

export function useChecklistCoverage(
  fileDiffs: Record<string, number> | undefined,
  items: ChecklistItem[],
  results: Map<string, ChecklistItemResult>,
): CoverageData | null {
  return useMemo(() => {
    if (!fileDiffs || Object.keys(fileDiffs).length === 0) return null;

    const fileCoverage = computeFileCoverage(fileDiffs, items, results);
    const tree = buildFileTree(fileCoverage);

    let globalCovered = 0;
    let globalTotal = 0;
    for (const entry of fileCoverage.values()) {
      globalCovered += entry.passed + entry.failed + entry.skipped;
      globalTotal += entry.total;
    }

    return {
      tree,
      globalCovered,
      globalTotal,
      globalPercent: globalTotal > 0 ? Math.round((globalCovered / globalTotal) * 100) : 0,
    };
  }, [fileDiffs, items, results]);
}
