# Feature Landscape

**Domain:** GitHub PR integration for plan review tool (fork of Plannotator)
**Researched:** 2026-04-01

## Table Stakes

Features users expect from a GitHub PR integration. Missing = integration feels broken.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Create PR from plan | Users already see the "Create PR" button -- this exists but needs refactoring into plugin | Low | Already implemented in `apps/paste-service/github/pr.ts`. Needs extraction to `packages/github/`. |
| Sync GitHub comments into Plannotator | Core value prop -- "review in either place" | Medium | `useGitHubPRSync` exists but is read-only polling. Needs to handle review comments with line numbers and thread structure. |
| Sync Plannotator annotations to GitHub | Bidirectional = both directions work | Medium | New. Must map block IDs + offsets back to markdown line numbers for review comment positioning. |
| Show comment author + avatar | GitHub comments have identity, losing it feels wrong | Low | Already partially handled -- `PRComment.author` has username + avatar. Need UI display in annotation panel. |
| Line-level comment positioning | GitHub review comments are line-specific, displaying as "global" loses context | High | Requires robust line mapping between plan markdown (as rendered in Plannotator) and the committed file (as seen in GitHub diff). |
| Authentication gating | PR operations require auth | Low | Already implemented -- OAuth flow, token extraction, validation all exist. |

## Differentiators

Features that set this integration apart from just using GitHub's PR UI.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Thread display with all replies | See full discussion context inline with plan text, not in a separate GitHub tab | Medium | REST API returns `in_reply_to_id` for flat threading. Reconstruct thread tree and display nested in annotation panel. |
| Summary annotations that resolve threads | Author captures decision, thread auto-resolves on GitHub -- single action for documentation + cleanup | High | Requires GraphQL (`resolveReviewThread` mutation). Need thread node IDs via GraphQL query. |
| Manual sync buttons (not automatic) | User controls when sync happens -- no surprise state changes, works offline | Low | Two buttons: "Sync from GitHub" and "Sync to GitHub". |
| Submit PR review from Plannotator | Approve/Request Changes/Comment directly from Plannotator UI | Medium | Uses `POST /repos/{owner}/{repo}/pulls/{pr}/reviews` with event type. Can batch annotations as review comments. |
| Annotation <-> comment ID tracking | Each annotation knows its GitHub comment ID, enabling updates rather than duplicates | Medium | Store `githubCommentId` in annotation metadata. Check on sync to update existing vs create new. |

## Anti-Features

Features to explicitly NOT build.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Webhook-based real-time sync | Requires server-side webhook endpoint, complicates deployment, contradicts manual sync design | Manual sync buttons. User clicks "Sync" when ready. |
| AI-generated thread summaries | Author knows the decision nuance better than AI. Auto-resolving on wrong summary is destructive. | Author writes summary annotations manually. |
| Multi-repo support | Adds configuration complexity, unclear use case for plan reviews | Single configured repo. Add multi-repo later if needed. |
| GitLab/Bitbucket support | Different APIs, different auth flows, scope creep | GitHub only for v1. |
| Editing GitHub comments from Plannotator | Complicated two-way edit sync, conflict resolution needed | Create new comments/annotations only. Edit on the platform where created. |
| Automatic PR creation on plan approve | Couples plan approval to GitHub workflow. Not all plans should become PRs. | Explicit "Create PR" button, separate from approve/deny. |
| Comment reactions/emoji sync | Low value, high complexity for bidirectional sync | Ignore reactions. |

## Feature Dependencies

```
Authentication (exists) --> Create PR (exists, needs refactoring)
Authentication (exists) --> Sync from GitHub
Authentication (exists) --> Sync to GitHub
Create PR --> Sync from GitHub (need PR metadata to know which PR to sync)
Create PR --> Sync to GitHub
Sync from GitHub --> Thread display (threads constructed from synced comments)
Thread display --> Summary annotations (need to see threads to summarize)
Summary annotations --> Thread resolution (summary triggers resolve via GraphQL)
Line mapping --> Sync to GitHub (need line numbers for review comments)
Line mapping --> Line-level positioning (need positions for incoming comments)
Plugin architecture --> All features (everything must live in plugin package)
```

## MVP Recommendation

Prioritize:
1. **Plugin package structure** (`packages/github/`) -- foundation for everything
2. **Refactor existing code** into plugin -- extract PR creation, useGitHubPRSync from scattered locations
3. **Sync from GitHub** -- import PR comments as annotations via external annotations API
4. **Sync to GitHub** -- export annotations as review comments with line positions
5. **Thread display** -- group comments by `in_reply_to_id` and display inline

Defer:
- **Summary annotations + thread resolution**: Requires GraphQL, thread ID mapping, and "mark as summary" UI. Build after bidirectional sync is solid.
- **Submit PR review from Plannotator**: Nice-to-have. Users can still approve on GitHub directly.

## Sources

- PROJECT.md requirements and constraints
- Existing codebase: `apps/paste-service/github/pr.ts`, `packages/ui/hooks/useGitHubPRSync.ts`
- GitHub REST API: Pull Request Comments, Reviews documentation
- GitHub GraphQL: resolveReviewThread mutation documentation
