/**
 * Export Modal with tabs for Share, Annotations, and Notes
 *
 * Share tab (default): Shows shareable URL with copy button
 * Annotations tab: Shows human-readable annotations output with copy/download
 * Notes tab: Save plan to Obsidian/Bear without approving
 */

import React, { useState, useEffect } from 'react';
import { getObsidianSettings, getEffectiveVaultPath } from '../utils/obsidian';
import { getBearSettings } from '../utils/bear';
import { getOctarineSettings } from '../utils/octarine';
import { wrapFeedbackForAgent } from '../utils/parser';
import { useReview, type ReviewEvent } from '../hooks/useReview';
import type { Annotation } from '../types';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  shareUrl: string;
  shareUrlSize: string;
  /** Short share URL from the paste service (empty string when unavailable) */
  shortShareUrl?: string;
  /** Whether the short URL is currently being generated */
  isGeneratingShortUrl?: boolean;
  /** Error from the last short URL generation attempt (empty string = no error) */
  shortUrlError?: string;
  /** Generate a short URL on demand (user clicks "Create short link") */
  onGenerateShortUrl?: () => void;
  annotationsOutput: string;
  annotationCount: number;
  taterSprite?: React.ReactNode;
  sharingEnabled?: boolean;
  markdown?: string;
  isApiMode?: boolean;
  initialTab?: Tab;
  /** GitHub token for authenticated sharing */
  githubToken?: string | null;
  /** Paste service URL for creating authenticated shares */
  pasteApiUrl?: string;
  /** PR metadata if PR already exists */
  prMetadata?: { repo: string; pr_number: number; pr_url: string; planHash?: string } | null;
  /** Whether user is authenticated with GitHub */
  isGitHubAuthenticated?: boolean;
  /** Export function from useGitHubPRExport hook */
  onExportToPR?: () => Promise<void>;
  /** Whether export is in progress */
  isExporting?: boolean;
  /** Current retry attempt (0 = not retrying) */
  retryAttempt?: number;
  /** Export error message */
  exportError?: string | null;
  /** Whether plan has changed since PR creation (drift) */
  hasDrift?: boolean;
  /** Whether any annotations have images (for warning) */
  hasImageAnnotations?: boolean;
  /** GitHub OAuth login URL */
  githubLoginUrl?: string;
  /** Annotations for review submission (pending count + auto-sync) */
  annotations?: Annotation[];
  /** Outbound sync function to call before review submission */
  onOutboundSync?: () => Promise<void>;
  /** Server origin for API calls (e.g., paste service URL) */
  serverOrigin?: string;
}

type Tab = 'share' | 'annotations' | 'notes' | 'github-pr' | 'review';

type SaveTarget = 'obsidian' | 'bear' | 'octarine';
type SaveStatus = 'idle' | 'saving' | 'success' | 'error';

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  shareUrl,
  shareUrlSize,
  shortShareUrl = '',
  isGeneratingShortUrl = false,
  shortUrlError = '',
  onGenerateShortUrl,
  annotationsOutput,
  annotationCount,
  taterSprite,
  sharingEnabled = true,
  markdown,
  isApiMode = false,
  initialTab,
  githubToken,
  pasteApiUrl = 'http://localhost:19433',
  prMetadata: ghPrMetadata,
  isGitHubAuthenticated = false,
  onExportToPR,
  isExporting = false,
  retryAttempt = 0,
  exportError,
  hasDrift = false,
  hasImageAnnotations = false,
  githubLoginUrl,
  annotations = [],
  onOutboundSync,
  serverOrigin = '',
}) => {
  const defaultTab = initialTab || (sharingEnabled ? 'share' : 'annotations');
  const [activeTab, setActiveTab] = useState<Tab>(defaultTab);
  const [copied, setCopied] = useState<'short' | 'full' | 'annotations' | false>(false);
  const [saveStatus, setSaveStatus] = useState<Record<SaveTarget, SaveStatus>>({ obsidian: 'idle', bear: 'idle', octarine: 'idle' });
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({});

  // ACL controls
  const [requireAuth, setRequireAuth] = useState(false);
  const [aclUsers, setAclUsers] = useState('');
  const [aclTeams, setAclTeams] = useState('');
  const [exportToPR, setExportToPR] = useState(false);
  const [isCreatingShare, setIsCreatingShare] = useState(false);
  const [createdPrUrl, setCreatedPrUrl] = useState<string | null>(null);
  const [createdShareId, setCreatedShareId] = useState<string | null>(null);
  const [createShareError, setCreateShareError] = useState<string | null>(null);

  // Review state
  const [reviewBody, setReviewBody] = useState('');

  // Parse PR metadata into owner/repo for useReview
  const reviewPrMetadata = ghPrMetadata
    ? (() => {
        const [owner, repo] = (ghPrMetadata.repo || '').split('/');
        return owner && repo
          ? { owner, repo, prNumber: ghPrMetadata.pr_number, prUrl: ghPrMetadata.pr_url }
          : null;
      })()
    : null;

  const review = useReview({
    prMetadata: reviewPrMetadata,
    githubToken: githubToken || null,
    annotations,
    onSyncAnnotations: onOutboundSync,
    serverOrigin,
  });

  const handleReviewSubmit = async (event: ReviewEvent) => {
    await review.submitReview(event, reviewBody);
    // Check success after -- state is updated synchronously in the hook
  };

  // Reset tab when modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab || (sharingEnabled ? 'share' : 'annotations'));
    }
  }, [isOpen, initialTab, sharingEnabled]);

  // Reset save status and ACL state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSaveStatus({ obsidian: 'idle', bear: 'idle', octarine: 'idle' });
      setSaveErrors({});
      setRequireAuth(false);
      setAclUsers('');
      setAclTeams('');
      setExportToPR(false);
      setIsCreatingShare(false);
      setCreatedPrUrl(null);
      setCreatedShareId(null);
      setCreateShareError(null);
      setReviewBody('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const showNotesTab = isApiMode && !!markdown;
  const obsidianSettings = getObsidianSettings();
  const bearSettings = getBearSettings();
  const octarineSettings = getOctarineSettings();
  const effectiveVaultPath = getEffectiveVaultPath(obsidianSettings);
  const isObsidianReady = obsidianSettings.enabled && effectiveVaultPath.trim().length > 0;
  const isBearReady = bearSettings.enabled;
  const isOctarineReady = octarineSettings.enabled && octarineSettings.workspace.trim().length > 0;

  const handleCopy = async (text: string, which: 'short' | 'full' | 'annotations') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Failed to copy:', e);
    }
  };

  const handleCopyAnnotations = async () => {
    await handleCopy(wrapFeedbackForAgent(annotationsOutput), 'annotations');
  };

  // Whether the hash URL is large enough to warrant a short URL option
  const urlIsLarge = shareUrl.length > 2048;

  const handleDownloadAnnotations = () => {
    const blob = new Blob([annotationsOutput], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'annotations.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveToNotes = async (target: SaveTarget) => {
    if (!markdown) return;

    setSaveStatus(prev => ({ ...prev, [target]: 'saving' }));
    setSaveErrors(prev => { const next = { ...prev }; delete next[target]; return next; });

    const body: { obsidian?: object; bear?: object; octarine?: object } = {};

    if (target === 'obsidian') {
      body.obsidian = {
        vaultPath: effectiveVaultPath,
        folder: obsidianSettings.folder || 'plannotator',
        plan: markdown,
        ...(obsidianSettings.filenameFormat && { filenameFormat: obsidianSettings.filenameFormat }),
        ...(obsidianSettings.filenameSeparator && obsidianSettings.filenameSeparator !== 'space' && { filenameSeparator: obsidianSettings.filenameSeparator }),
      };
    }
    if (target === 'bear') {
      body.bear = { plan: markdown };
    }
    if (target === 'octarine') {
      body.octarine = {
        plan: markdown,
        workspace: octarineSettings.workspace,
        folder: octarineSettings.folder || 'plannotator',
      };
    }

    try {
      const res = await fetch('/api/save-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      const result = data.results?.[target];

      if (result?.success) {
        setSaveStatus(prev => ({ ...prev, [target]: 'success' }));
      } else {
        setSaveStatus(prev => ({ ...prev, [target]: 'error' }));
        setSaveErrors(prev => ({ ...prev, [target]: result?.error || 'Save failed' }));
      }
    } catch {
      setSaveStatus(prev => ({ ...prev, [target]: 'error' }));
      setSaveErrors(prev => ({ ...prev, [target]: 'Save failed' }));
    }
  };

  const handleSaveAll = async () => {
    const targets: SaveTarget[] = [];
    if (isObsidianReady) targets.push('obsidian');
    if (isBearReady) targets.push('bear');
    if (isOctarineReady) targets.push('octarine');
    await Promise.all(targets.map(t => handleSaveToNotes(t)));
  };

  const readyCount = [isObsidianReady, isBearReady, isOctarineReady].filter(Boolean).length;

  // Create authenticated share with ACL and optional PR export
  const handleCreateAuthenticatedShare = async () => {
    if (!markdown || !githubToken) return;

    setIsCreatingShare(true);
    setCreatedPrUrl(null);
    setCreatedShareId(null);
    setCreateShareError(null);

    try {
      // Encode plan as base64
      const encoder = new TextEncoder();
      const data = encoder.encode(markdown);
      const base64Data = btoa(String.fromCharCode(...data));

      // Build ACL
      const users = aclUsers.split(',').map(u => u.trim()).filter(Boolean);
      const teams = aclTeams.split(',').map(t => t.trim()).filter(Boolean);

      const body: any = {
        data: base64Data,
        acl: requireAuth
          ? { type: 'whitelist', users, teams }
          : { type: 'public' },
      };

      if (exportToPR) {
        body.github_export = true;
        body.plan_markdown = markdown;
      }

      const res = await fetch(`${pasteApiUrl}/api/paste`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${githubToken}`,
        },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const result = await res.json();
        setCreatedShareId(result.id);
        if (result.github_pr?.pr_url) {
          setCreatedPrUrl(result.github_pr.pr_url);
        }
      } else {
        const errorText = await res.text();
        setCreateShareError(errorText || 'Failed to create share');
      }
    } catch (error) {
      setCreateShareError(error instanceof Error ? error.message : 'Network error');
    } finally {
      setIsCreatingShare(false);
    }
  };

  // Determine which tabs to show
  const showTabs = sharingEnabled || showNotesTab;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div
        className="bg-card border border-border rounded-xl w-full max-w-2xl flex flex-col max-h-[80vh] shadow-2xl relative"
        onClick={e => e.stopPropagation()}
      >
        {taterSprite}

        {/* Header */}
        <div className="p-4 border-b border-border">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-sm">Export</h3>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                {annotationCount} annotation{annotationCount !== 1 ? 's' : ''}
              </span>
              <button
                onClick={onClose}
                className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-4">
          {/* Tabs */}
          {showTabs && (
            <div className="flex gap-1 bg-muted rounded-lg p-1 mb-4">
              {sharingEnabled && (
                <button
                  onClick={() => setActiveTab('share')}
                  className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    activeTab === 'share'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Share
                </button>
              )}
              <button
                onClick={() => setActiveTab('annotations')}
                className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  activeTab === 'annotations'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Annotations
              </button>
              {showNotesTab && (
                <button
                  onClick={() => setActiveTab('notes')}
                  className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    activeTab === 'notes'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Notes
                </button>
              )}
              {onExportToPR && (
                <button
                  onClick={() => setActiveTab('github-pr')}
                  className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    activeTab === 'github-pr'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  GitHub PR
                </button>
              )}
              {ghPrMetadata && (
                <button
                  onClick={() => setActiveTab('review')}
                  className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    activeTab === 'review'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Review
                </button>
              )}
            </div>
          )}

          {/* Tab content */}
          {activeTab === 'share' && sharingEnabled ? (
            <div className="space-y-4">
              {/* Authenticated Share Options */}
              {githubToken && (
                <div className="border border-border rounded-lg p-3 space-y-3">
                  <h4 className="text-xs font-semibold text-foreground">Authenticated Sharing</h4>

                  {/* Require Auth Checkbox */}
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={requireAuth}
                      onChange={(e) => {
                        setRequireAuth(e.target.checked);
                        if (!e.target.checked) {
                          setExportToPR(false);
                        }
                      }}
                      className="mt-0.5 w-4 h-4 rounded border-border"
                    />
                    <div>
                      <span className="text-xs font-medium">Require authentication</span>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Restrict access to specific GitHub users or teams
                      </p>
                    </div>
                  </label>

                  {/* ACL Inputs */}
                  {requireAuth && (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">
                          GitHub Usernames (comma-separated)
                        </label>
                        <input
                          type="text"
                          value={aclUsers}
                          onChange={(e) => setAclUsers(e.target.value)}
                          placeholder="alice, bob, charlie"
                          className="w-full bg-muted rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-accent/50"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">
                          GitHub Teams (org/team format)
                        </label>
                        <input
                          type="text"
                          value={aclTeams}
                          onChange={(e) => setAclTeams(e.target.value)}
                          placeholder="myorg/reviewers, myorg/team"
                          className="w-full bg-muted rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-accent/50"
                        />
                      </div>
                    </>
                  )}

                  {/* PR Export Checkbox */}
                  <label className={`flex items-start gap-2 ${requireAuth ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}>
                    <input
                      type="checkbox"
                      checked={exportToPR}
                      onChange={(e) => setExportToPR(e.target.checked)}
                      disabled={!requireAuth}
                      className="mt-0.5 w-4 h-4 rounded border-border disabled:cursor-not-allowed"
                    />
                    <div>
                      <span className="text-xs font-medium">Export to GitHub PR</span>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Create a pull request for collaborative review with comment sync
                      </p>
                    </div>
                  </label>

                  {/* Create Share Button */}
                  <button
                    onClick={handleCreateAuthenticatedShare}
                    disabled={isCreatingShare || (!requireAuth && !exportToPR)}
                    className="w-full px-3 py-2 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isCreatingShare ? 'Creating Share...' : 'Create Authenticated Share'}
                  </button>

                  {/* Show error if creation failed */}
                  {createShareError && (
                    <div className="p-2 bg-destructive/10 border border-destructive/20 rounded-md">
                      <p className="text-xs text-destructive">❌ {createShareError}</p>
                    </div>
                  )}

                  {/* Show created share URL */}
                  {createdShareId && (
                    <div className="p-2 bg-success/10 border border-success/20 rounded-md space-y-2">
                      <p className="text-xs text-success-foreground font-medium">✅ Share created successfully!</p>
                      <div>
                        <label className="block text-[10px] text-muted-foreground mb-1">Share URL:</label>
                        <div className="flex items-center gap-1">
                          <input
                            readOnly
                            value={`${window.location.origin}/p/${createdShareId}`}
                            className="flex-1 bg-muted rounded px-2 py-1 text-xs font-mono"
                            onClick={e => (e.target as HTMLInputElement).select()}
                          />
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(`${window.location.origin}/p/${createdShareId}`);
                              setCopied('short');
                              setTimeout(() => setCopied(false), 2000);
                            }}
                            className="px-2 py-1 rounded text-xs bg-background border border-border hover:bg-muted transition-colors"
                          >
                            {copied === 'short' ? '✓' : 'Copy'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Show PR URL if created */}
                  {createdPrUrl && (
                    <div className="p-2 bg-success/10 border border-success/20 rounded-md">
                      <p className="text-xs text-success-foreground font-medium mb-1">✅ PR created!</p>
                      <a
                        href={createdPrUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline break-all"
                      >
                        {createdPrUrl}
                      </a>
                    </div>
                  )}
                </div>
              )}

              {/* Sign in prompt if not authenticated */}
              {!githubToken && (
                <div className="border border-border rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-2">
                    Sign in with GitHub to create private shares with access control and PR integration.
                  </p>
                  <button
                    onClick={() => {
                      // Open OAuth in same window to avoid cross-origin issues
                      window.location.href = `${pasteApiUrl}/api/auth/github/login`;
                    }}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                    </svg>
                    Sign in with GitHub
                  </button>
                </div>
              )}
              {/* Short URL — primary copy target when available */}
              {shortShareUrl ? (
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-2">
                    Share Link
                  </label>
                  <div className="relative group">
                    <input
                      readOnly
                      value={shortShareUrl}
                      className="w-full bg-muted rounded-lg p-3 pr-20 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-accent/50"
                      onClick={e => (e.target as HTMLInputElement).select()}
                    />
                    <button
                      onClick={() => handleCopy(shortShareUrl, 'short')}
                      className="absolute top-1.5 right-2 px-2 py-1 rounded text-xs font-medium bg-background/80 hover:bg-background border border-border/50 transition-colors flex items-center gap-1"
                    >
                      {copied === 'short' ? (
                        <>
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                          Copied
                        </>
                      ) : (
                        <>
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          Copy
                        </>
                      )}
                    </button>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Encrypted short link. Your plan is end-to-end encrypted before it leaves your browser — not even the server can read it.
                  </p>
                </div>
              ) : isGeneratingShortUrl ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground p-3 bg-muted rounded-lg">
                  <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M12 2v4m0 12v4m-7.07-3.93l2.83-2.83m8.48-8.48l2.83-2.83M2 12h4m12 0h4m-3.93 7.07l-2.83-2.83M7.76 7.76L4.93 4.93" />
                  </svg>
                  Generating short link...
                </div>
              ) : urlIsLarge && onGenerateShortUrl ? (
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                  <p className="text-xs text-amber-600 dark:text-amber-400 mb-2">
                    This URL may be too long for some messaging apps.
                  </p>
                  <button
                    onClick={onGenerateShortUrl}
                    className="px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                  >
                    Create short link
                  </button>
                  {shortUrlError && (
                    <p className="text-[10px] text-amber-500 mt-1">({shortUrlError})</p>
                  )}
                </div>
              ) : null}

              {/* Full hash URL — always available */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-2">
                  {shortShareUrl ? 'Full URL (backup)' : 'Shareable URL'}
                </label>
                <div className="relative group">
                  <textarea
                    readOnly
                    value={shareUrl}
                    className="w-full h-24 bg-muted rounded-lg p-3 pr-20 text-xs font-mono resize-none focus:outline-none focus:ring-2 focus:ring-accent/50"
                    onClick={e => (e.target as HTMLTextAreaElement).select()}
                  />
                  <button
                    onClick={() => handleCopy(shareUrl, 'full')}
                    className="absolute top-2 right-2 px-2 py-1 rounded text-xs font-medium bg-background/80 hover:bg-background border border-border/50 transition-colors flex items-center gap-1"
                  >
                    {copied === 'full' ? (
                      <>
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        Copied
                      </>
                    ) : (
                      <>
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        Copy
                      </>
                    )}
                  </button>
                  <div className="absolute bottom-2 right-2 text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    {shareUrlSize}
                  </div>
                </div>
                {!shortShareUrl && !isGeneratingShortUrl && !urlIsLarge && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Your plan is encoded entirely in the URL — it never touches a server.
                  </p>
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                Only someone with this exact link can view your plan. Short links are end-to-end encrypted — the decryption key is in the URL and never sent to the server.
              </p>
            </div>
          ) : activeTab === 'notes' && showNotesTab ? (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Save this plan to your notes app without approving or denying.
              </p>

              {/* Obsidian */}
              <div className="border border-border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${isObsidianReady ? 'bg-success' : 'bg-muted-foreground/30'}`} />
                    <span className="text-sm font-medium">Obsidian</span>
                  </div>
                  {isObsidianReady ? (
                    <button
                      onClick={() => handleSaveToNotes('obsidian')}
                      disabled={saveStatus.obsidian === 'saving'}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                        saveStatus.obsidian === 'success'
                          ? 'bg-success/15 text-success'
                          : saveStatus.obsidian === 'error'
                            ? 'bg-destructive/15 text-destructive'
                            : saveStatus.obsidian === 'saving'
                              ? 'bg-muted text-muted-foreground opacity-50'
                              : 'bg-primary text-primary-foreground hover:opacity-90'
                      }`}
                    >
                      {saveStatus.obsidian === 'saving' ? 'Saving...'
                        : saveStatus.obsidian === 'success' ? 'Saved'
                        : saveStatus.obsidian === 'error' ? 'Failed'
                        : 'Save'}
                    </button>
                  ) : (
                    <span className="text-xs text-muted-foreground">Not configured</span>
                  )}
                </div>
                {isObsidianReady && (
                  <div className="text-[10px] text-muted-foreground/70">
                    {effectiveVaultPath}/{obsidianSettings.folder || 'plannotator'}/
                  </div>
                )}
                {!isObsidianReady && (
                  <div className="text-[10px] text-muted-foreground/70">
                    Enable in Settings &gt; Saving &gt; Obsidian
                  </div>
                )}
                {saveErrors.obsidian && (
                  <div className="text-[10px] text-destructive">{saveErrors.obsidian}</div>
                )}
              </div>

              {/* Bear */}
              <div className="border border-border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${isBearReady ? 'bg-success' : 'bg-muted-foreground/30'}`} />
                    <span className="text-sm font-medium">Bear</span>
                  </div>
                  {isBearReady ? (
                    <button
                      onClick={() => handleSaveToNotes('bear')}
                      disabled={saveStatus.bear === 'saving'}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                        saveStatus.bear === 'success'
                          ? 'bg-success/15 text-success'
                          : saveStatus.bear === 'error'
                            ? 'bg-destructive/15 text-destructive'
                            : saveStatus.bear === 'saving'
                              ? 'bg-muted text-muted-foreground opacity-50'
                              : 'bg-primary text-primary-foreground hover:opacity-90'
                      }`}
                    >
                      {saveStatus.bear === 'saving' ? 'Saving...'
                        : saveStatus.bear === 'success' ? 'Saved'
                        : saveStatus.bear === 'error' ? 'Failed'
                        : 'Save'}
                    </button>
                  ) : (
                    <span className="text-xs text-muted-foreground">Not configured</span>
                  )}
                </div>
                {!isBearReady && (
                  <div className="text-[10px] text-muted-foreground/70">
                    Enable in Settings &gt; Saving &gt; Bear
                  </div>
                )}
                {saveErrors.bear && (
                  <div className="text-[10px] text-destructive">{saveErrors.bear}</div>
                )}
              </div>

              {/* Octarine */}
              <div className="border border-border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${isOctarineReady ? 'bg-success' : 'bg-muted-foreground/30'}`} />
                    <span className="text-sm font-medium">Octarine</span>
                  </div>
                  {isOctarineReady ? (
                    <button
                      onClick={() => handleSaveToNotes('octarine')}
                      disabled={saveStatus.octarine === 'saving'}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                        saveStatus.octarine === 'success'
                          ? 'bg-success/15 text-success'
                          : saveStatus.octarine === 'error'
                            ? 'bg-destructive/15 text-destructive'
                            : saveStatus.octarine === 'saving'
                              ? 'bg-muted text-muted-foreground opacity-50'
                              : 'bg-primary text-primary-foreground hover:opacity-90'
                      }`}
                    >
                      {saveStatus.octarine === 'saving' ? 'Saving...'
                        : saveStatus.octarine === 'success' ? 'Saved'
                        : saveStatus.octarine === 'error' ? 'Failed'
                        : 'Save'}
                    </button>
                  ) : (
                    <span className="text-xs text-muted-foreground">Not configured</span>
                  )}
                </div>
                {isOctarineReady && (
                  <div className="text-[10px] text-muted-foreground/70">
                    {octarineSettings.workspace} / {octarineSettings.folder || 'plannotator'}/
                  </div>
                )}
                {!isOctarineReady && (
                  <div className="text-[10px] text-muted-foreground/70">
                    Enable in Settings &gt; Saving &gt; Octarine
                  </div>
                )}
                {saveErrors.octarine && (
                  <div className="text-[10px] text-destructive">{saveErrors.octarine}</div>
                )}
              </div>

              {/* Save All button */}
              {readyCount >= 2 && (
                <div className="flex justify-end">
                  <button
                    onClick={handleSaveAll}
                    disabled={saveStatus.obsidian === 'saving' || saveStatus.bear === 'saving' || saveStatus.octarine === 'saving'}
                    className="px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    Save All
                  </button>
                </div>
              )}
            </div>
          ) : activeTab === 'github-pr' ? (
            <div className="space-y-3">
              {/* Not authenticated state */}
              {!isGitHubAuthenticated ? (
                <div className="border border-border rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-2">
                    Sign in with GitHub to create pull requests.
                  </p>
                  <button
                    onClick={() => { if (githubLoginUrl) window.location.href = githubLoginUrl; }}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                    </svg>
                    Sign in with GitHub
                  </button>
                </div>
              ) : (
                <>
                  {/* PR exists -- show link */}
                  {ghPrMetadata && (
                    <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                      <span className="text-xs text-muted-foreground">Existing PR:</span>
                      <a
                        href={ghPrMetadata.pr_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline font-medium"
                      >
                        PR #{ghPrMetadata.pr_number}
                      </a>
                    </div>
                  )}

                  {/* Drift warning */}
                  {hasDrift && (
                    <div className="p-2 bg-warning/10 border border-warning/20 rounded-md flex items-start gap-2">
                      <svg className="w-4 h-4 text-warning shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                      </svg>
                      <p className="text-xs text-warning">
                        Plan changed since PR was created -- line numbers may be incorrect
                      </p>
                    </div>
                  )}

                  {/* Image annotations warning */}
                  {hasImageAnnotations && (
                    <p className="text-xs text-muted-foreground">
                      Annotations with images will be exported as text only
                    </p>
                  )}

                  {/* Annotation count */}
                  {annotationCount > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {annotationCount} annotation{annotationCount !== 1 ? 's' : ''} will be exported as review comments
                    </p>
                  ) : (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">No annotations to export</p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Add annotations to your plan, then export them as PR review comments.
                      </p>
                    </div>
                  )}

                  {/* Export error */}
                  {exportError && (
                    <div className="p-2 bg-destructive/10 border border-destructive/20 rounded-md">
                      <p className="text-xs text-destructive">{exportError}</p>
                    </div>
                  )}

                  {/* Export button */}
                  <button
                    onClick={onExportToPR}
                    disabled={isExporting || annotationCount === 0}
                    className="w-full px-3 py-2 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isExporting
                      ? retryAttempt > 0
                        ? `Retrying... (attempt ${retryAttempt} of 3)`
                        : 'Creating PR...'
                      : 'Export to GitHub PR'}
                  </button>
                </>
              )}
            </div>
          ) : activeTab === 'review' ? (
            <div className="space-y-3">
              {!ghPrMetadata ? (
                <div className="border border-border rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">
                    Link a PR to submit reviews
                  </p>
                </div>
              ) : (
                <>
                  {/* Pending annotation count */}
                  <p className="text-xs text-muted-foreground">
                    {review.pendingCount} annotation{review.pendingCount !== 1 ? 's' : ''} will be synced with this review
                  </p>

                  {/* Review body textarea */}
                  <textarea
                    value={reviewBody}
                    onChange={e => setReviewBody(e.target.value)}
                    placeholder="Overall feedback (optional)"
                    className="w-full min-h-[120px] bg-input border border-border rounded-md p-2 text-sm text-foreground placeholder:text-muted-foreground resize-y focus:outline-none focus:ring-2 focus:ring-accent/50"
                    disabled={review.state !== 'idle'}
                  />

                  {/* Error message */}
                  {review.error && (
                    <div className="p-2 bg-destructive/10 border border-destructive/20 rounded-md">
                      <p className="text-xs text-destructive">{review.error}</p>
                    </div>
                  )}

                  {/* Success message */}
                  {review.state === 'success' && (
                    <div className="p-2 bg-success/10 border border-success/20 rounded-md">
                      <p className="text-xs text-success-foreground font-medium">Review submitted successfully</p>
                    </div>
                  )}

                  {/* Action buttons or loading state */}
                  {review.state === 'syncing' ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground p-3 bg-muted rounded-lg">
                      <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path d="M12 2v4m0 12v4m-7.07-3.93l2.83-2.83m8.48-8.48l2.83-2.83M2 12h4m12 0h4m-3.93 7.07l-2.83-2.83M7.76 7.76L4.93 4.93" />
                      </svg>
                      Syncing {review.pendingCount} annotation{review.pendingCount !== 1 ? 's' : ''}...
                    </div>
                  ) : review.state === 'submitting' ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground p-3 bg-muted rounded-lg">
                      <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path d="M12 2v4m0 12v4m-7.07-3.93l2.83-2.83m8.48-8.48l2.83-2.83M2 12h4m12 0h4m-3.93 7.07l-2.83-2.83M7.76 7.76L4.93 4.93" />
                      </svg>
                      Submitting review...
                    </div>
                  ) : (
                    <div className="flex gap-2 mt-4">
                      <button
                        className="bg-success text-success-foreground px-4 py-2 rounded-md text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={() => handleReviewSubmit('APPROVE')}
                        disabled={review.state !== 'idle'}
                      >
                        Approve
                      </button>
                      <button
                        className="bg-destructive text-destructive-foreground px-4 py-2 rounded-md text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={() => handleReviewSubmit('REQUEST_CHANGES')}
                        disabled={review.state !== 'idle'}
                      >
                        Request Changes
                      </button>
                      <button
                        className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={() => handleReviewSubmit('COMMENT')}
                        disabled={review.state !== 'idle'}
                      >
                        Comment
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <pre className="bg-muted rounded-lg p-4 text-xs font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap">
              {annotationsOutput}
            </pre>
          )}
        </div>

        {/* Footer actions - only show for Annotations tab */}
        {activeTab === 'annotations' && (
          <div className="p-4 border-t border-border flex justify-end gap-2">
            <button
              onClick={handleCopyAnnotations}
              className="px-3 py-1.5 rounded-md text-xs font-medium bg-muted hover:bg-muted/80 transition-colors"
            >
              {copied === 'annotations' ? 'Copied!' : 'Copy'}
            </button>
            <button
              onClick={handleDownloadAnnotations}
              className="px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
            >
              Download Annotations
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
