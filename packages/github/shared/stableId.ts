/**
 * Deterministic annotation ID generation using SHA-256.
 * Per D-01: content-based hash of blockId + originalText.
 * Per D-03: excludes character offsets for stability across minor edits.
 */
export async function generateStableId(
  blockId: string,
  originalText: string
): Promise<string> {
  const input = `${blockId}:${originalText}`;
  const msgBuffer = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex.slice(0, 12); // 12 hex chars = 48 bits per discretion choice
}

/**
 * Resolve ID collisions by appending sequential suffix.
 * Per D-02: -1, -2, etc. for duplicate annotations on same text.
 */
export function resolveCollision(
  baseId: string,
  existingIds: Set<string>
): string {
  if (!existingIds.has(baseId)) return baseId;
  let suffix = 1;
  while (existingIds.has(`${baseId}-${suffix}`)) suffix++;
  return `${baseId}-${suffix}`;
}
