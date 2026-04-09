import React, { useEffect } from 'react';

interface ThreadItem {
  id: string;
  label: string;
  replyCount: number;
  lastActivity: number;
}

interface ThreadPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  threads: ThreadItem[];
  onSelect: (threadId: string) => void;
}

export const ThreadPickerModal: React.FC<ThreadPickerModalProps> = ({
  isOpen,
  onClose,
  threads,
  onSelect,
}) => {
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

  return (
    <div
      className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-start justify-center"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-lg shadow-lg max-w-md w-full mx-auto mt-24"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">
            Select Thread to Summarize
          </h3>
        </div>

        <div className="max-h-[400px] overflow-y-auto">
          {threads.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-xs text-muted-foreground">
              No active threads to summarize
            </div>
          ) : (
            threads.map(thread => (
              <div
                key={thread.id}
                className="flex items-center justify-between p-4 border-b border-border/50 hover:bg-muted/50 cursor-pointer transition-colors"
                onClick={() => onSelect(thread.id)}
              >
                <div className="flex-1 min-w-0 mr-3">
                  <div className="text-sm text-foreground truncate">
                    {thread.label}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {thread.replyCount} {thread.replyCount === 1 ? 'reply' : 'replies'}
                  </div>
                </div>
                <span className="text-xs font-semibold text-accent hover:underline flex-shrink-0">
                  Summarize
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
