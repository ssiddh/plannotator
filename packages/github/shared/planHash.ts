/**
 * Plan hash generation using SHA-256.
 * Used for drift detection: compare hash at PR creation time vs current plan content.
 * Per D-10: full 64-char hex (not truncated like stableId).
 */
export async function generatePlanHash(
  planMarkdown: string
): Promise<string> {
  const msgBuffer = new TextEncoder().encode(planMarkdown);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
