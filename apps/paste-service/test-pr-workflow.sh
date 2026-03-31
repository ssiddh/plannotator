#!/bin/bash
# Test script for GitHub PR workflow integration

set -e

PASTE_SERVICE="http://localhost:19433"
TOKEN="${GITHUB_TOKEN:-}"

if [ -z "$TOKEN" ]; then
  echo "Error: GITHUB_TOKEN environment variable not set"
  echo "Please set it to your GitHub personal access token"
  exit 1
fi

echo "=== Phase 3: GitHub PR Workflow Test ==="
echo ""

# Test 1: Create a paste with github_export=true
echo "Test 1: Creating paste with PR export..."
PLAN_MARKDOWN="# Test Plan

This is a test plan for PR workflow integration.

## Implementation Steps

1. Create GitHub PR
2. Sync review comments
3. Display as annotations

## Success Criteria

- PR created successfully
- Comments fetched correctly
- Line numbers mapped to blocks"

PASTE_RESPONSE=$(curl -s -X POST "$PASTE_SERVICE/api/paste" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
    \"data\": \"test-encrypted-data\",
    \"acl\": {
      \"type\": \"whitelist\",
      \"users\": [\"$(curl -s -H "Authorization: Bearer $TOKEN" https://api.github.com/user | jq -r '.login')\"]
    },
    \"github_export\": true,
    \"plan_markdown\": $(echo "$PLAN_MARKDOWN" | jq -Rs .)
  }")

echo "Paste response: $PASTE_RESPONSE"
PASTE_ID=$(echo "$PASTE_RESPONSE" | jq -r '.id')

if [ "$PASTE_ID" = "null" ] || [ -z "$PASTE_ID" ]; then
  echo "✗ Failed to create paste"
  echo "Response: $PASTE_RESPONSE"
  exit 1
fi

echo "✓ Paste created: $PASTE_ID"

# Check if PR was created
PR_URL=$(echo "$PASTE_RESPONSE" | jq -r '.github_pr.pr_url // empty')
if [ -z "$PR_URL" ]; then
  echo "✗ No PR created (this is expected if GITHUB_DEFAULT_REPO is not set)"
  PR_ERROR=$(echo "$PASTE_RESPONSE" | jq -r '.pr_error // empty')
  if [ -n "$PR_ERROR" ]; then
    echo "PR error: $PR_ERROR"
  fi
  echo ""
  echo "Skipping PR-related tests..."
  exit 0
fi

echo "✓ PR created: $PR_URL"
PR_NUMBER=$(echo "$PASTE_RESPONSE" | jq -r '.github_pr.pr_number')
echo "  PR number: $PR_NUMBER"

# Test 2: Fetch paste and verify PR metadata is included
echo ""
echo "Test 2: Fetching paste with PR metadata..."
FETCH_RESPONSE=$(curl -s -X GET "$PASTE_SERVICE/api/paste/$PASTE_ID" \
  -H "Authorization: Bearer $TOKEN")

echo "Fetch response: $FETCH_RESPONSE"

FETCH_PR_URL=$(echo "$FETCH_RESPONSE" | jq -r '.github_pr.pr_url // empty')
if [ "$FETCH_PR_URL" = "$PR_URL" ]; then
  echo "✓ PR metadata retrieved correctly"
else
  echo "✗ PR metadata mismatch"
  echo "  Expected: $PR_URL"
  echo "  Got: $FETCH_PR_URL"
  exit 1
fi

# Test 3: Fetch PR comments
echo ""
echo "Test 3: Fetching PR comments..."
COMMENTS_RESPONSE=$(curl -s -X GET "$PASTE_SERVICE/api/pr/$PASTE_ID/comments" \
  -H "Authorization: Bearer $TOKEN")

echo "Comments response: $COMMENTS_RESPONSE"

# Check if it's an array (even if empty)
if echo "$COMMENTS_RESPONSE" | jq -e 'type == "array"' > /dev/null 2>&1; then
  COMMENT_COUNT=$(echo "$COMMENTS_RESPONSE" | jq 'length')
  echo "✓ PR comments fetched successfully ($COMMENT_COUNT comments)"
else
  echo "✗ Failed to fetch PR comments"
  exit 1
fi

echo ""
echo "=== All Tests Passed ==="
echo ""
echo "Summary:"
echo "  Paste ID: $PASTE_ID"
echo "  PR URL: $PR_URL"
echo "  PR Number: $PR_NUMBER"
echo "  Comment Count: $COMMENT_COUNT"
