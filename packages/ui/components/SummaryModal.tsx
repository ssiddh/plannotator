import React, { useState, useEffect, useRef } from 'react';

interface SummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  threadLabel: string;
  onSubmit: (text: string) => void;
}

export const SummaryModal: React.FC<SummaryModalProps> = ({
  isOpen,
  onClose,
  threadLabel,
  onSubmit,
}) => {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen) {
      setText('');
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = () => {
    if (text.trim()) {
      onSubmit(text.trim());
      setText('');
    }
  };

  return (
    <div
      className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-start justify-center"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-lg shadow-lg max-w-lg w-full mx-auto mt-24 p-4"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-foreground mb-1">
          Summarize Thread
        </h3>
        <div className="text-xs text-muted-foreground mb-2">
          Summary of: {threadLabel}
        </div>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Capture the decision from this discussion..."
          className="w-full min-h-[120px] bg-input border border-border rounded-md p-2 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onClose}
            className="bg-muted text-muted-foreground px-4 py-2 rounded-md text-xs font-semibold hover:bg-muted/80 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!text.trim()}
            className="bg-accent text-accent-foreground px-4 py-2 rounded-md text-xs font-semibold hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Create Summary
          </button>
        </div>
      </div>
    </div>
  );
};
