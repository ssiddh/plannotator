# Dual OAuth Setup Guide for Organization Users

This guide explains how to set up GitHub OAuth for Plannotator when you're part of an organization that has SSO or OAuth restrictions.

## Prerequisites

- A GitHub account with access to the organization
- Admin access or ability to create OAuth apps in your organization
- Plannotator installed and running locally
- Basic command-line familiarity

## Overview

Plannotator uses **two separate GitHub OAuth apps** to support authentication in both local and portal sessions:

1. **Local OAuth App** - For users running Plannotator on their local machine
2. **Production OAuth App** - For users viewing shared plans in the hosted portal

This dual architecture ensures that both local development and shared portal sessions can authenticate properly, even in organizations with strict security policies.

---

## Step 1: Create Local GitHub OAuth App

### 1.1 Navigate to OAuth App Settings

1. Go to https://github.com/settings/developers
2. Click **"OAuth Apps"** tab
3. Click **"New OAuth App"** button

### 1.2 Configure the OAuth App

Fill in the form with these values:

| Field | Value |
|-------|-------|
| **Application name** | `Plannotator Local` |
| **Homepage URL** | `http://localhost:19432` |
| **Application description** | `Local Plannotator GitHub integration` |
| **Authorization callback URL** | `http://localhost:19432/api/auth/github/callback` |

**Important notes:**
- The callback URL must be **exactly** `http://localhost:19432/api/auth/github/callback` (no trailing slash)
- Port `19432` is the default Plannotator local server port
- If your organization requires OAuth apps to be created at the org level, ask your GitHub admin to create this app

### 1.3 Generate Client Secret

1. After creating the app, you'll see your **Client ID** (starts with `Ov23...`)
2. Click **"Generate a new client secret"**
3. **Copy both the Client ID and Client Secret immediately** - you won't be able to see the secret again

---

## Step 2: Configure Local Environment

### 2.1 Set Environment Variables

Export the credentials you just created:

```bash
export GITHUB_CLIENT_ID_LOCAL=<your-client-id>
export GITHUB_CLIENT_SECRET_LOCAL=<your-client-secret>
```

**Example:**
```bash
export GITHUB_CLIENT_ID_LOCAL=Ov23liABCDEFGHIJKLMN
export GITHUB_CLIENT_SECRET_LOCAL=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0
```

### 2.2 Make Environment Variables Persistent

To avoid setting these every time you start Plannotator, add them to your shell profile:

**For bash:**
```bash
echo 'export GITHUB_CLIENT_ID_LOCAL=<your-client-id>' >> ~/.bashrc
echo 'export GITHUB_CLIENT_SECRET_LOCAL=<your-client-secret>' >> ~/.bashrc
source ~/.bashrc
```

**For zsh:**
```bash
echo 'export GITHUB_CLIENT_ID_LOCAL=<your-client-id>' >> ~/.zshrc
echo 'export GITHUB_CLIENT_SECRET_LOCAL=<your-client-secret>' >> ~/.zshrc
source ~/.zshrc
```

### 2.3 Verify Environment Variables

```bash
echo $GITHUB_CLIENT_ID_LOCAL
echo $GITHUB_CLIENT_SECRET_LOCAL
```

Both should print the values you set. If not, check your shell profile and source it again.

---

## Step 3: Test Local Authentication

### 3.1 Start Plannotator

```bash
claude  # or however you normally start Claude Code with Plannotator plugin
```

### 3.2 Trigger a Plan Review

Ask Claude to create a plan that will trigger the review UI:

```
Can you create a plan to add a new feature?
```

### 3.3 Test GitHub Login

1. When the plan review UI opens in your browser, look for the GitHub authentication option
2. Click **"Sign in with GitHub"**
3. You should be redirected to GitHub's OAuth authorization page
4. Click **"Authorize"** to grant access
5. You should be redirected back to Plannotator with a success message

**Expected behavior:**
- GitHub shows your local OAuth app name (`Plannotator Local`)
- After authorization, you're redirected to `http://localhost:19432/...`
- Plannotator UI shows you're logged in

---

## Step 4: Test PR Creation

### 4.1 Create a Test Plan

Create a simple markdown file to test with:

```bash
echo "# Test Plan\n\nThis is a test plan to verify GitHub integration." > test-plan.md
```

### 4.2 Annotate the Plan

```bash
/plannotator-annotate test-plan.md
```

### 4.3 Create a GitHub PR

1. In the Plannotator UI, add some annotations to the test plan
2. Click **"Export"** → **"Create GitHub PR"**
3. Enter a repository you have access to (e.g., `yourorg/yourrepo`)
4. Click **"Create PR"**

### 4.4 Verify on GitHub

1. Go to your repository on GitHub
2. Navigate to the **Pull Requests** tab
3. You should see a new PR created by the OAuth app
4. The PR should contain your annotated plan

---

## Step 5: Test Share Link Flow

### 5.1 Generate a Share Link

1. In the Plannotator UI (still from your local session), click **"Share"**
2. Copy the generated share link (should start with `https://...`)

### 5.2 Open in New Browser

1. Open an **incognito/private browsing window**
2. Paste the share link and open it
3. You should see the shared plan without needing to authenticate

**Note:** The share link uses the **production OAuth app**, not your local one. If you want to test PR creation from a shared link, you'll need to set up the production OAuth app (Step 6).

---

## Troubleshooting

### Error: "GitHub OAuth not configured"

**Cause:** Environment variables not set or not loaded

**Fix:**
1. Check environment variables are set: `echo $GITHUB_CLIENT_ID_LOCAL`
2. If empty, export them again (see Step 2.1)
3. Make sure you've sourced your shell profile: `source ~/.bashrc` or `source ~/.zshrc`
4. Restart Plannotator

### Error: "redirect_uri is not associated with this application"

**Cause:** Callback URL mismatch between your OAuth app and Plannotator's request

**Fix:**
1. Go to https://github.com/settings/developers
2. Click your OAuth app
3. Verify "Authorization callback URL" is exactly: `http://localhost:19432/api/auth/github/callback`
4. No trailing slash, must be lowercase `localhost`, port `19432`

### Error: "OAuth app access restricted by organization policy"

**Cause:** Your organization requires OAuth apps to be approved or created at the org level

**Fix:**
1. Ask your GitHub organization admin to create the OAuth app at the org level
2. Or request approval for your personal OAuth app
3. Organization settings → Third-party access → OAuth application policy

### Authentication works but PR creation fails

**Cause:** Missing repository permissions

**Fix:**
1. Check the repository you're trying to create a PR in exists and you have write access
2. Verify the OAuth app has `repo` scope permissions:
   - Go to https://github.com/settings/developers
   - Click your OAuth app
   - Check "Scopes" section includes `repo`, `read:user`, `read:org`
3. Try revoking and re-authorizing the OAuth app

---

## Security Notes

### Keeping Secrets Safe

- **Never commit** `GITHUB_CLIENT_SECRET_LOCAL` to git
- **Never share** your client secret publicly
- If you accidentally expose your secret:
  1. Go to https://github.com/settings/developers
  2. Click your OAuth app
  3. Click **"Generate a new client secret"**
  4. Update your environment variables with the new secret

### OAuth App Permissions

The Plannotator OAuth app requests these scopes:
- `repo` - Create PRs, read repository data
- `read:user` - Read your GitHub profile
- `read:org` - Read organization membership

These permissions are necessary for:
- Creating PRs in your repositories
- Associating annotations with your GitHub identity
- Supporting organization-specific repositories

### Revoking Access

To revoke Plannotator's access:
1. Go to https://github.com/settings/applications
2. Find "Plannotator Local" (or your OAuth app name)
3. Click **"Revoke"**

You can re-authorize anytime by clicking "Sign in with GitHub" in Plannotator.

---

## Advanced: Setting Up Production OAuth App

If you're self-hosting the Plannotator portal and want shared links to support GitHub authentication, you'll need a second OAuth app for the production environment.

### Differences from Local OAuth App

| Aspect | Local OAuth App | Production OAuth App |
|--------|----------------|---------------------|
| Callback URL | `http://localhost:19432/api/auth/github/callback` | `https://your-portal.example.com/api/auth/github/callback` |
| Configuration | Environment variables on your machine | Cloudflare Worker secrets |
| Deployment | `GITHUB_CLIENT_ID_LOCAL`, `GITHUB_CLIENT_SECRET_LOCAL` | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` |

### Setup Steps

1. Create a second GitHub OAuth app (similar to Step 1)
2. Use your **production portal domain** for the callback URL
3. Configure the Cloudflare Worker with the production credentials:
   ```bash
   wrangler secret put GITHUB_CLIENT_SECRET
   # Paste your production OAuth app secret when prompted
   ```
4. Update `wrangler.toml` with the production client ID and callback URL

See `GITHUB-INTEGRATION-VERIFICATION.md` for detailed production deployment instructions.

---

## Next Steps

Once you have local GitHub authentication working:

1. **Explore PR workflows** - Try creating PRs from annotated plans
2. **Test sync features** - Sync annotations between Plannotator and GitHub PR comments
3. **Set up production OAuth** - If you're self-hosting the portal
4. **Join the community** - Share feedback and get help at https://plannotator.ai

---

## Support

If you encounter issues not covered in this guide:

1. Check the main troubleshooting doc: `GITHUB-INTEGRATION-VERIFICATION.md`
2. Open an issue: https://github.com/backnotprop/plannotator/issues
3. Ask in discussions: https://github.com/backnotprop/plannotator/discussions
