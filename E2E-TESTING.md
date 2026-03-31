# End-to-End Testing Guide

Complete guide to test the GitHub authentication, PR workflow, and presence features.

## Prerequisites

1. **GitHub OAuth App** (you already have this)
   - Client ID: `Ov23liegyqgZNEU4sfGF`
   - Client Secret: (in `.dev.vars`)
   - Callback URL: `http://localhost:19433/api/auth/github/callback`

2. **Test Repository**
   - Repository: `ssiddh/fluffy-parakeet`
   - Main branch: `main`

3. **Running Services**
   - Paste service: Port 19433
   - Portal app: Port 3001 (if testing UI integration)

## Setup

### 1. Start Paste Service

```bash
cd apps/paste-service
bun run targets/bun.ts > /tmp/paste-service.log 2>&1 &
```

Verify it's running:
```bash
curl http://localhost:19433/api/paste/test
# Should return 404 (expected - no test endpoint)
```

### 2. Get GitHub Token

Option A: Use test-oauth.html
```bash
open "http://localhost:19433/api/auth/github/login"
# After authorizing, extract token from browser console:
# localStorage.getItem('github_token')
```

Option B: Use existing token (if still valid)
```bash
export GITHUB_TOKEN="your-github-token-here"
```

## Test Scenarios

### Test 1: Authentication Flow

**1.1 Token Validation**
```bash
curl -X POST http://localhost:19433/api/auth/token/validate \
  -H "Content-Type: application/json" \
  -d "{\"token\": \"$GITHUB_TOKEN\"}" | jq
```

Expected output:
```json
{
  "valid": true,
  "user": {
    "login": "ssiddh",
    "avatar_url": "https://...",
    ...
  }
}
```

**1.2 Invalid Token**
```bash
curl -X POST http://localhost:19433/api/auth/token/validate \
  -H "Content-Type: application/json" \
  -d '{"token": "invalid"}' | jq
```

Expected: `{"valid": false, "error": "..."}`

### Test 2: Private Paste with ACL

**2.1 Create Private Paste**
```bash
PASTE_ID=$(curl -s -X POST http://localhost:19433/api/paste \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -d '{
    "data": "test-private-paste-data",
    "acl": {
      "type": "whitelist",
      "users": ["ssiddh"]
    }
  }' | jq -r '.id')

echo "Paste ID: $PASTE_ID"
```

**2.2 Access with Valid Token**
```bash
curl -X GET "http://localhost:19433/api/paste/$PASTE_ID" \
  -H "Authorization: Bearer $GITHUB_TOKEN" | jq
```

Expected: `{"data": "test-private-paste-data"}`

**2.3 Access Without Token (Should Fail)**
```bash
curl -X GET "http://localhost:19433/api/paste/$PASTE_ID" | jq
```

Expected: `{"error": "Authentication required"}` (401)

**2.4 Access with Different User Token (Should Fail)**
```bash
# You would need a second user's token
# Expected: {"error": "Access denied"} (403)
```

### Test 3: GitHub PR Export

**3.1 Create Paste with PR Export**
```bash
PLAN_MARKDOWN="# E2E Test Plan

This is a test plan for end-to-end testing.

## Test Steps

1. **Authentication**
   - Verify OAuth flow
   - Validate token

2. **Private Pastes**
   - Create with ACL
   - Test access control

3. **PR Export**
   - Create PR automatically
   - Verify branch and commit

4. **PR Comments**
   - Add review comments
   - Verify comment sync

## Expected Results

All tests should pass!"

RESPONSE=$(curl -s -X POST http://localhost:19433/api/paste \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -d "{
    \"data\": \"test-data-with-pr-export\",
    \"acl\": {
      \"type\": \"whitelist\",
      \"users\": [\"ssiddh\"]
    },
    \"github_export\": true,
    \"plan_markdown\": $(echo "$PLAN_MARKDOWN" | jq -Rs .)
  }")

echo "$RESPONSE" | jq

# Extract IDs
PASTE_ID=$(echo "$RESPONSE" | jq -r '.id')
PR_URL=$(echo "$RESPONSE" | jq -r '.github_pr.pr_url')
PR_NUMBER=$(echo "$RESPONSE" | jq -r '.github_pr.pr_number')

echo ""
echo "✅ Paste created: $PASTE_ID"
echo "✅ PR created: $PR_URL"
echo ""
```

**3.2 Verify PR on GitHub**
```bash
# Open PR in browser
open "$PR_URL"

# Or check via gh CLI
gh pr view $PR_NUMBER --repo ssiddh/fluffy-parakeet
```

Verify:
- [ ] PR exists in GitHub
- [ ] Branch name is `plan/${PASTE_ID}`
- [ ] File path is `plans/${PASTE_ID}.md`
- [ ] PR body contains the plan markdown
- [ ] PR is open (not merged)

### Test 4: PR Comment Sync

**4.1 Add Review Comment on GitHub**

Option A: Via GitHub UI
```bash
open "$PR_URL/files"
# Click line number → "Add a comment" → Write comment → "Add single comment"
```

Option B: Via gh CLI
```bash
# Add a review comment on line 5
gh pr review $PR_NUMBER --repo ssiddh/fluffy-parakeet \
  --comment --body "This looks great!" --approve
```

**4.2 Fetch PR Comments**
```bash
curl -X GET "http://localhost:19433/api/pr/$PASTE_ID/comments" \
  -H "Authorization: Bearer $GITHUB_TOKEN" | jq
```

Expected output:
```json
[
  {
    "id": "review_...",
    "author": {
      "username": "ssiddh",
      "avatar": "https://..."
    },
    "body": "This looks great!",
    "line": 5,
    "path": "plans/xxx.md",
    "created_at": "...",
    "github_url": "https://...",
    "comment_type": "review"
  }
]
```

Verify:
- [ ] Comment appears in response
- [ ] Line number is correct
- [ ] Author info is correct
- [ ] GitHub URL is valid

**4.3 Add Issue Comment (No Line Number)**
```bash
gh pr comment $PR_NUMBER --repo ssiddh/fluffy-parakeet \
  --body "Overall this plan is solid 👍"

# Fetch again
curl -X GET "http://localhost:19433/api/pr/$PASTE_ID/comments" \
  -H "Authorization: Bearer $GITHUB_TOKEN" | jq
```

Verify:
- [ ] Issue comment appears
- [ ] No line number (null or undefined)
- [ ] Comment type is "issue"

### Test 5: Presence Awareness

**5.1 Start Presence Stream (Terminal 1)**
```bash
# Start SSE connection
curl -N -H "Authorization: Bearer $GITHUB_TOKEN" \
  "http://localhost:19433/api/presence/$PASTE_ID/stream?token=$GITHUB_TOKEN"
```

Expected initial output:
```
data: {"type":"init","viewers":[{"username":"ssiddh","avatar":"https://...","lastSeen":...}]}

data: {"type":"join","viewers":[{"username":"ssiddh","avatar":"https://...","lastSeen":...}]}
```

Keep this running!

**5.2 Send Heartbeat (Terminal 2)**
```bash
# Send heartbeat every 20 seconds
while true; do
  curl -X POST "http://localhost:19433/api/presence/$PASTE_ID/heartbeat" \
    -H "Authorization: Bearer $GITHUB_TOKEN"
  echo " (heartbeat sent)"
  sleep 20
done
```

Verify in Terminal 1:
- [ ] No "leave" events while heartbeat is running
- [ ] Connection stays open

**5.3 Stop Heartbeat and Wait 30s**

Stop the heartbeat loop (Ctrl+C in Terminal 2), then watch Terminal 1.

After ~30 seconds:
- [ ] "leave" event appears in stream
- [ ] Viewer removed from list

**5.4 Multi-User Presence (Optional)**

If you have a second GitHub account or can get a second token:

Terminal 3 (User 2):
```bash
export GITHUB_TOKEN_USER2="<second-user-token>"

curl -N -H "Authorization: Bearer $GITHUB_TOKEN_USER2" \
  "http://localhost:19433/api/presence/$PASTE_ID/stream?token=$GITHUB_TOKEN_USER2"
```

Expected in both terminals:
- User 1 sees "join" event for User 2
- User 2 sees "init" with both users
- Both see same viewer list

### Test 6: Full Integration Test

Run the automated test scripts:

**6.1 PR Workflow Test**
```bash
export GITHUB_TOKEN="your-token"
bash apps/paste-service/test-pr-workflow.sh
```

**6.2 Presence Test**
```bash
export GITHUB_TOKEN="your-token"
bash apps/paste-service/test-presence.sh
```

Both should show all tests passing.

## Multi-User E2E Test

For a complete multi-user test, you'll need:
1. Two different GitHub accounts
2. Both authorized with your OAuth app
3. Both added to the ACL

### Setup
```bash
# User 1 (you)
export TOKEN_USER1="$GITHUB_TOKEN"
export USERNAME_USER1="ssiddh"

# User 2 (second account)
export TOKEN_USER2="<user2-token>"
export USERNAME_USER2="<user2-username>"
```

### Test Flow
```bash
# 1. User 1 creates private paste with both users in ACL
PASTE_ID=$(curl -s -X POST http://localhost:19433/api/paste \
  -H "Authorization: Bearer $TOKEN_USER1" \
  -d "{
    \"data\": \"multi-user-test\",
    \"acl\": {
      \"type\": \"whitelist\",
      \"users\": [\"$USERNAME_USER1\", \"$USERNAME_USER2\"]
    },
    \"github_export\": true,
    \"plan_markdown\": \"# Multi-User Test Plan\"
  }" | jq -r '.id')

# 2. Both users connect to presence (separate terminals)
# Terminal 1 (User 1)
curl -N "http://localhost:19433/api/presence/$PASTE_ID/stream?token=$TOKEN_USER1"

# Terminal 2 (User 2)
curl -N "http://localhost:19433/api/presence/$PASTE_ID/stream?token=$TOKEN_USER2"

# 3. User 2 adds PR comment
gh pr comment <PR_NUMBER> --body "User 2 comment"

# 4. User 1 fetches comments
curl "http://localhost:19433/api/pr/$PASTE_ID/comments" \
  -H "Authorization: Bearer $TOKEN_USER1" | jq
```

Expected results:
- [ ] Both users see each other in presence
- [ ] User 2's comment appears for User 1
- [ ] Both avatars visible in presence
- [ ] Leave events when users disconnect

## Portal App E2E Test (UI)

If you integrate the hooks into the portal app:

### 1. Start Portal App
```bash
cd apps/portal
bun run dev
# Should start on http://localhost:3001
```

### 2. Open Portal
```bash
open "http://localhost:3001"
```

### 3. Test UI Flow

**Authentication:**
1. Click "Sign in with GitHub"
2. Authorize the app
3. Verify redirect back to portal
4. Check token in localStorage: `plannotator_github_token`

**Share with PR:**
1. Open a plan
2. Click "Share"
3. Check "Require authentication"
4. Add users to whitelist
5. Check "Export to GitHub PR"
6. Click "Create Share"
7. Verify PR URL appears
8. Open PR in GitHub

**View Shared Plan:**
1. Open share URL in second browser/incognito
2. Verify login required
3. Sign in with authorized user
4. Plan should load

**Presence:**
1. Open same share URL in two browsers (different accounts)
2. Verify presence panel shows both avatars
3. Verify viewer count updates
4. Close one browser
5. Verify viewer removed after 30s

**PR Comments:**
1. With plan open, add comment on GitHub PR
2. Wait 5 seconds
3. Verify comment appears as annotation
4. Verify GitHub avatar and badge
5. Click annotation
6. Verify highlights plan text

## Troubleshooting

### OAuth Issues
```bash
# Check server logs
tail -f /tmp/paste-service.log | grep -i oauth

# Verify OAuth app settings on GitHub
open "https://github.com/settings/developers"
```

### Presence Not Working
```bash
# Check SSE connection
curl -v "http://localhost:19433/api/presence/$PASTE_ID/stream?token=$GITHUB_TOKEN"
# Should show "Content-Type: text/event-stream"

# Check for errors
tail -f /tmp/paste-service.log | grep -i presence
```

### PR Export Failing
```bash
# Verify token has 'repo' scope
curl -I -H "Authorization: Bearer $GITHUB_TOKEN" \
  https://api.github.com/user | grep -i "x-oauth-scopes"
# Should include "repo"

# Check repository exists
gh repo view ssiddh/fluffy-parakeet
```

### Comments Not Syncing
```bash
# Verify PR metadata stored
# (For filesystem store)
cat ~/.plannotator/pastes/pr-$PASTE_ID.json | jq

# Manually fetch comments
curl "http://localhost:19433/api/pr/$PASTE_ID/comments" \
  -H "Authorization: Bearer $GITHUB_TOKEN" | jq
```

## Success Criteria

All these should pass:

**Authentication:**
- [ ] OAuth flow completes successfully
- [ ] Token validation works
- [ ] Token stored in localStorage
- [ ] Authenticated requests include Bearer token

**Access Control:**
- [ ] Private pastes require authentication
- [ ] Unauthorized users get 403
- [ ] Whitelist users can access
- [ ] Team members can access (if team ACL)

**PR Workflow:**
- [ ] PR created automatically
- [ ] Branch and file correct
- [ ] PR body contains plan
- [ ] Comments fetchable via API
- [ ] Line numbers map correctly

**Presence:**
- [ ] SSE connection establishes
- [ ] Join events broadcast
- [ ] Heartbeat maintains presence
- [ ] Leave events after timeout
- [ ] Multi-user presence works

**UI Integration:**
- [ ] Hooks integrate without errors
- [ ] PR annotations display correctly
- [ ] GitHub avatars show
- [ ] Presence panel appears
- [ ] Real-time updates work

## Next Steps After Testing

1. **Fix any issues found**
2. **Update documentation** with findings
3. **Deploy to staging** environment
4. **User acceptance testing** with real users
5. **Production deployment**
6. **Monitor** for errors and performance
