import { useState, useCallback, useMemo, useRef } from 'react';
import type { Annotation } from '../types';

interface UseThreadNavOptions {
  annotations: Annotation[];
  panelRef?: React.RefObject<HTMLDivElement | null>;
}

interface UseThreadNavResult {
  currentIndex: number;
  hasNext: boolean;
  hasPrev: boolean;
  goToNext: () => void;
  goToPrev: () => void;
  threadCount: number;
}

const HIGHLIGHT_CLASS = 'thread-nav-highlight';
const HIGHLIGHT_DURATION = 1500;

export function useThreadNav({ annotations }: UseThreadNavOptions): UseThreadNavResult {
  const [currentIndex, setCurrentIndex] = useState(-1);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const threadRoots = useMemo(() => {
    return annotations
      .filter(a => a.children && a.children.length > 0)
      .map(a => a.id);
  }, [annotations]);

  const scrollToThread = useCallback((id: string) => {
    const el = document.querySelector(`[data-annotation-id="${id}"]`);
    if (!el) return;

    el.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Highlight briefly
    el.classList.add(HIGHLIGHT_CLASS);
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => {
      el.classList.remove(HIGHLIGHT_CLASS);
    }, HIGHLIGHT_DURATION);
  }, []);

  const goToNext = useCallback(() => {
    if (threadRoots.length === 0) return;
    const next = currentIndex + 1 < threadRoots.length ? currentIndex + 1 : currentIndex;
    setCurrentIndex(next);
    scrollToThread(threadRoots[next]);
  }, [currentIndex, threadRoots, scrollToThread]);

  const goToPrev = useCallback(() => {
    if (threadRoots.length === 0) return;
    const prev = currentIndex - 1 >= 0 ? currentIndex - 1 : 0;
    setCurrentIndex(prev);
    scrollToThread(threadRoots[prev]);
  }, [currentIndex, threadRoots, scrollToThread]);

  return {
    currentIndex,
    hasNext: threadRoots.length > 0 && currentIndex < threadRoots.length - 1,
    hasPrev: threadRoots.length > 0 && currentIndex > 0,
    goToNext,
    goToPrev,
    threadCount: threadRoots.length,
  };
}
