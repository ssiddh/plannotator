import { useState, useCallback, useMemo } from 'react';
import type { Annotation } from '../types';
import { AnnotationType } from '../types';

export interface ThreadInfo {
  id: string;
  label: string;
  replyCount: number;
  lastActivity: number;
  annotation: Annotation;
}

/**
 * Returns a truncated label for a thread (first 50 chars of originalText).
 */
export function getThreadLabel(thread: Annotation): string {
  const text = thread.originalText || thread.text || '';
  return text.length > 50 ? text.slice(0, 50) + '...' : text;
}

/**
 * Identifies thread parents: annotations with children replies.
 */
export function getThreads(annotations: Annotation[]): ThreadInfo[] {
  return annotations
    .filter(a => a.children && a.children.length > 0)
    .map(a => ({
      id: a.id,
      label: getThreadLabel(a),
      replyCount: a.children!.length,
      lastActivity: Math.max(a.createdA, ...a.children!.map(c => c.createdA)),
      annotation: a,
    }));
}

interface UseSummaryAnnotationOptions {
  annotations: Annotation[];
  onAddAnnotation?: (annotation: Annotation) => void;
}

interface UseSummaryAnnotationResult {
  summaryModalOpen: boolean;
  selectedThreadId: string | null;
  threadPickerOpen: boolean;
  selectedThreadLabel: string;
  threads: ThreadInfo[];
  openSummaryModal: (threadId: string) => void;
  openThreadPicker: () => void;
  closeSummaryModal: () => void;
  closeThreadPicker: () => void;
  submitSummary: (text: string) => void;
}

export function useSummaryAnnotation({
  annotations,
  onAddAnnotation,
}: UseSummaryAnnotationOptions): UseSummaryAnnotationResult {
  const [summaryModalOpen, setSummaryModalOpen] = useState(false);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [threadPickerOpen, setThreadPickerOpen] = useState(false);

  const threads = useMemo(() => getThreads(annotations), [annotations]);

  const selectedThreadLabel = useMemo(() => {
    if (!selectedThreadId) return '';
    const thread = annotations.find(a => a.id === selectedThreadId);
    return thread ? getThreadLabel(thread) : '';
  }, [selectedThreadId, annotations]);

  const openSummaryModal = useCallback((threadId: string) => {
    setSelectedThreadId(threadId);
    setSummaryModalOpen(true);
    setThreadPickerOpen(false);
  }, []);

  const openThreadPicker = useCallback(() => {
    setThreadPickerOpen(true);
  }, []);

  const closeSummaryModal = useCallback(() => {
    setSummaryModalOpen(false);
    setSelectedThreadId(null);
  }, []);

  const closeThreadPicker = useCallback(() => {
    setThreadPickerOpen(false);
  }, []);

  const submitSummary = useCallback((text: string) => {
    if (!selectedThreadId || !onAddAnnotation) return;

    const threadParent = annotations.find(a => a.id === selectedThreadId);
    if (!threadParent) return;

    const summary: Annotation = {
      id: crypto.randomUUID(),
      blockId: threadParent.blockId,
      startOffset: 0,
      endOffset: 0,
      type: AnnotationType.COMMENT,
      text: text,
      originalText: text,
      isSummary: true,
      summarizesThreadId: selectedThreadId,
      createdA: Date.now(),
    };

    onAddAnnotation(summary);
    setSummaryModalOpen(false);
    setSelectedThreadId(null);
  }, [selectedThreadId, annotations, onAddAnnotation]);

  return {
    summaryModalOpen,
    selectedThreadId,
    threadPickerOpen,
    selectedThreadLabel,
    threads,
    openSummaryModal,
    openThreadPicker,
    closeSummaryModal,
    closeThreadPicker,
    submitSummary,
  };
}
