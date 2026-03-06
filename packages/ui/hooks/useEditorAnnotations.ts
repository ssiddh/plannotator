import { useState, useEffect, useCallback, useRef } from 'react';
import type { EditorAnnotation } from '../types';

const POLL_INTERVAL = 500;

interface UseEditorAnnotationsReturn {
  editorAnnotations: EditorAnnotation[];
  deleteEditorAnnotation: (id: string) => void;
}

/**
 * Polls the server for editor annotations created by the VS Code extension.
 *
 * On mount, fires a single probe request. If the endpoint doesn't exist (404 or
 * network error), disables itself permanently — zero ongoing cost for non-VS-Code
 * contexts. If the probe succeeds, starts polling every 2 seconds.
 */
export function useEditorAnnotations(): UseEditorAnnotationsReturn {
  const [annotations, setAnnotations] = useState<EditorAnnotation[]>([]);
  const disabledRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAnnotations = useCallback(async () => {
    try {
      const res = await fetch('/api/editor-annotations');
      if (!res.ok) {
        disabledRef.current = true;
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        return;
      }
      const data = await res.json();
      setAnnotations(data.annotations ?? []);
    } catch {
      disabledRef.current = true;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
  }, []);

  useEffect(() => {
    // Probe once on mount
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch('/api/editor-annotations');
        if (cancelled) return;
        if (!res.ok) {
          disabledRef.current = true;
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        setAnnotations(data.annotations ?? []);

        // Probe succeeded — start polling
        intervalRef.current = setInterval(fetchAnnotations, POLL_INTERVAL);
      } catch {
        if (!cancelled) {
          disabledRef.current = true;
        }
      }
    })();

    return () => {
      cancelled = true;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [fetchAnnotations]);

  const deleteEditorAnnotation = useCallback(async (id: string) => {
    if (disabledRef.current) return;
    try {
      await fetch(`/api/editor-annotation?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      setAnnotations((prev) => prev.filter((a) => a.id !== id));
    } catch {
      // Silently fail — next poll will reconcile
    }
  }, []);

  return { editorAnnotations: annotations, deleteEditorAnnotation };
}
