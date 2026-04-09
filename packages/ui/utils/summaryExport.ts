import type { Annotation } from '../types';

/**
 * Export all summary annotations as a markdown document.
 */
export function exportSummariesAsMarkdown(
  annotations: Annotation[],
  prNumber?: number,
  prTitle?: string,
): string {
  const summaries = annotations.filter(a => a.isSummary === true);
  const lines: string[] = [];

  lines.push('# PR Review Summaries\n');

  if (prNumber) {
    lines.push(`**PR:** #${prNumber}${prTitle ? ` - ${prTitle}` : ''}`);
  }
  lines.push(`**Generated:** ${new Date().toISOString()}\n`);
  lines.push('---\n');

  if (summaries.length === 0) {
    lines.push('No summaries created yet.\n');
    return lines.join('\n');
  }

  summaries.forEach((summary, idx) => {
    const threadParent = summary.summarizesThreadId
      ? annotations.find(a => a.id === summary.summarizesThreadId)
      : null;

    const threadLabel = threadParent
      ? (threadParent.originalText || threadParent.text || '').slice(0, 50) + (((threadParent.originalText || threadParent.text || '').length > 50) ? '...' : '')
      : 'Unknown thread';

    const isResolved = threadParent?.isResolved ? 'Resolved' : 'Active';

    lines.push(`## Thread ${idx + 1}\n`);
    lines.push(`**Discussion:** ${threadLabel}\n`);
    lines.push(`**Summary:** ${summary.text || summary.originalText}\n`);
    lines.push(`**Status:** ${isResolved}\n`);
    lines.push('---\n');
  });

  return lines.join('\n');
}

/**
 * Trigger a markdown file download in the browser.
 */
export function downloadSummariesMarkdown(
  markdown: string,
  prNumber?: number,
): void {
  const date = new Date().toISOString().slice(0, 10);
  const filename = prNumber
    ? `pr-${prNumber}-summaries-${date}.md`
    : `summaries-${date}.md`;

  const blob = new Blob([markdown], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
