/**
 * Bidirectional ID mapping between Plannotator annotations and GitHub comments.
 * Per D-04: stored in server-side KV (Cloudflare Workers KV or in-memory Map).
 * Per D-05: dual KV entries for O(1) lookups in both directions.
 * Per D-06: TTL matches paste expiry.
 *
 * Key patterns:
 *   sync:{pasteId}:ann:{annotationId} -> commentId
 *   sync:{pasteId}:gh:{commentId}     -> annotationId
 */

/** Write bidirectional mapping. Creates two KV entries for O(1) lookup in both directions. */
export async function setMapping(
  pasteId: string,
  annotationId: string,
  commentId: string,
  kv: any,
  ttlSeconds: number
): Promise<void> {
  await Promise.all([
    kv.put(`sync:${pasteId}:ann:${annotationId}`, commentId, {
      expirationTtl: ttlSeconds,
    }),
    kv.put(`sync:${pasteId}:gh:${commentId}`, annotationId, {
      expirationTtl: ttlSeconds,
    }),
  ]);
}

/** Look up GitHub comment ID for a Plannotator annotation. */
export async function getCommentId(
  pasteId: string,
  annotationId: string,
  kv: any
): Promise<string | null> {
  return kv.get(`sync:${pasteId}:ann:${annotationId}`);
}

/** Look up Plannotator annotation ID for a GitHub comment. */
export async function getAnnotationId(
  pasteId: string,
  commentId: string,
  kv: any
): Promise<string | null> {
  return kv.get(`sync:${pasteId}:gh:${commentId}`);
}

/** Remove bidirectional mapping. Deletes both KV entries. */
export async function deleteMapping(
  pasteId: string,
  annotationId: string,
  commentId: string,
  kv: any
): Promise<void> {
  await Promise.all([
    kv.delete(`sync:${pasteId}:ann:${annotationId}`),
    kv.delete(`sync:${pasteId}:gh:${commentId}`),
  ]);
}
