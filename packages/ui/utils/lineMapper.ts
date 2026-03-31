/**
 * Line-to-block mapping for GitHub PR comments.
 *
 * Maps PR review comment line numbers to plan blocks for annotation display.
 */

import type { Block } from "../types";

/**
 * Find the block that contains a given line number.
 * Uses binary search for efficiency with large plans.
 *
 * @param lineNumber - 1-based line number from PR comment
 * @param blocks - Sorted array of plan blocks with startLine field
 * @returns The block ID containing the line, or null if not found
 */
export function mapLineToBlock(
  lineNumber: number,
  blocks: Block[]
): string | null {
  if (blocks.length === 0) return null;

  // Binary search for the block containing this line
  let left = 0;
  let right = blocks.length - 1;
  let bestMatch: Block | null = null;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const block = blocks[mid];

    if (block.startLine === lineNumber) {
      // Exact match on start line
      return block.id;
    } else if (block.startLine < lineNumber) {
      // This block starts before the target line
      // Check if target line is within this block
      const nextBlock = blocks[mid + 1];
      if (!nextBlock || nextBlock.startLine > lineNumber) {
        // Target line is between this block's start and next block's start
        bestMatch = block;
        break;
      }
      // Continue searching right
      left = mid + 1;
    } else {
      // This block starts after the target line
      // Continue searching left
      right = mid - 1;
    }
  }

  // If we found a best match, return it
  if (bestMatch) {
    return bestMatch.id;
  }

  // Edge case: line is before first block
  if (lineNumber < blocks[0].startLine) {
    return blocks[0].id;
  }

  // Edge case: line is after last block
  if (lineNumber > blocks[blocks.length - 1].startLine) {
    return blocks[blocks.length - 1].id;
  }

  // Fallback: return first block
  return blocks[0]?.id || null;
}

/**
 * Map multiple PR comments to blocks in bulk.
 * More efficient than calling mapLineToBlock multiple times.
 *
 * @param comments - Array of PR comments with line numbers
 * @param blocks - Sorted array of plan blocks
 * @returns Map of comment ID to block ID
 */
export function mapCommentsToBlocks(
  comments: Array<{ id: string; line?: number }>,
  blocks: Block[]
): Map<string, string | null> {
  const mapping = new Map<string, string | null>();

  for (const comment of comments) {
    if (comment.line) {
      const blockId = mapLineToBlock(comment.line, blocks);
      mapping.set(comment.id, blockId);
    } else {
      // Comment without line number (issue comment, not review comment)
      mapping.set(comment.id, null);
    }
  }

  return mapping;
}

/**
 * Calculate a score for how well a block matches a line number.
 * Used for fuzzy matching when exact mapping fails.
 *
 * @param lineNumber - Target line number
 * @param block - Block to score
 * @returns Proximity score (lower is better, 0 = perfect match)
 */
export function calculateBlockProximity(
  lineNumber: number,
  block: Block
): number {
  return Math.abs(block.startLine - lineNumber);
}

/**
 * Find the closest N blocks to a given line number.
 * Useful for fallback when exact mapping is uncertain.
 *
 * @param lineNumber - Target line number
 * @param blocks - Array of blocks
 * @param count - Number of closest blocks to return
 * @returns Array of block IDs sorted by proximity
 */
export function findClosestBlocks(
  lineNumber: number,
  blocks: Block[],
  count: number = 3
): string[] {
  const scored = blocks.map((block) => ({
    id: block.id,
    score: calculateBlockProximity(lineNumber, block),
  }));

  scored.sort((a, b) => a.score - b.score);

  return scored.slice(0, count).map((s) => s.id);
}
