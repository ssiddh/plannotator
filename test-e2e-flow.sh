#!/bin/bash

# End-to-end test for authenticated sharing with GitHub PR integration

set -e

echo "=== E2E Test: Authenticated Sharing + PR Integration ==="
echo ""

# Check prerequisites
if [ -z "$GITHUB_TOKEN" ]; then
  echo "❌ GITHUB_TOKEN environment variable not set"
  echo "   Export your token: export GITHUB_TOKEN=ghp_..."
  exit 1
fi

PASTE_URL="${PASTE_SERVICE_URL:-http://localhost:19433}"

# Check paste service
if ! curl -s "$PASTE_URL" > /dev/null 2>&1; then
  echo "❌ Paste service not running at $PASTE_URL"
  exit 1
fi

echo "✅ Paste service is running at $PASTE_URL"
echo "✅ GitHub token is set"
echo ""

# Step 1: Create an authenticated paste with PR export
echo "Step 1: Creating authenticated paste with PR export..."

PLAN_CONTENT=$(cat <<'EOF'
# Test Plan for E2E Testing

## Goal
Test the GitHub PR integration with real-time comment sync.

## Steps
1. Create this plan as a PR
2. Add review comments on GitHub
3. Verify comments appear as annotations in the portal

## Success Criteria
- [ ] PR is created successfully
- [ ] Comments sync within 5 seconds
- [ ] GitHub avatars display correctly
- [ ] Presence tracking works
EOF
)

PASTE_RESPONSE=$(curl -s -X POST "$PASTE_URL/api/paste" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -d @- <<EOF
{
  "data": "$(echo -n "$PLAN_CONTENT" | base64)",
  "acl": {
    "type": "whitelist",
    "users": ["$(git config user.name || echo "testuser")"]
  },
  "github_export": true,
  "plan_markdown": "$PLAN_CONTENT"
}
EOF
)

PASTE_ID=$(echo "$PASTE_RESPONSE" | jq -r '.id // empty')
PR_URL=$(echo "$PASTE_RESPONSE" | jq -r '.github_pr.pr_url // empty')

if [ -z "$PASTE_ID" ]; then
  echo "❌ Failed to create paste"
  echo "Response: $PASTE_RESPONSE"
  exit 1
fi

echo "✅ Created paste: $PASTE_ID"

if [ -n "$PR_URL" ]; then
  echo "✅ GitHub PR created: $PR_URL"
else
  echo "⚠️  No PR was created (check GitHub OAuth config)"
fi

echo ""

# Step 2: Test paste retrieval
echo "Step 2: Testing paste retrieval..."

PASTE_DATA=$(curl -s "$PASTE_URL/api/paste/$PASTE_ID" \
  -H "Authorization: Bearer $GITHUB_TOKEN")

if echo "$PASTE_DATA" | jq -e '.data' > /dev/null 2>&1; then
  echo "✅ Paste retrieved successfully"

  if echo "$PASTE_DATA" | jq -e '.github_pr' > /dev/null 2>&1; then
    echo "✅ PR metadata is present"
    echo "   PR #$(echo "$PASTE_DATA" | jq -r '.github_pr.pr_number')"
    echo "   Repo: $(echo "$PASTE_DATA" | jq -r '.github_pr.repo')"
  else
    echo "⚠️  No PR metadata found"
  fi
else
  echo "❌ Failed to retrieve paste"
  exit 1
fi

echo ""

# Step 3: Test presence tracking
echo "Step 3: Testing presence tracking..."
echo "   (This would require opening the portal in a browser)"
echo ""

# Step 4: Instructions for manual testing
echo "=== Next Steps for Manual Testing ==="
echo ""
echo "1. Open the portal:"
echo "   http://localhost:3001/p/$PASTE_ID"
echo ""

if [ -n "$PR_URL" ]; then
  echo "2. Add review comments on GitHub:"
  echo "   $PR_URL"
  echo ""
  echo "3. Watch comments appear in the portal (polls every 5s)"
  echo ""
fi

echo "4. Open in another browser/tab to test presence:"
echo "   You should see your avatar in the presence panel"
echo ""

# Step 5: Save GitHub token to localStorage for portal
echo "To authenticate in the portal, run this in browser console:"
echo ""
echo "localStorage.setItem('plannotator_github_token', '$GITHUB_TOKEN');"
echo ""

echo "Test setup complete!"
