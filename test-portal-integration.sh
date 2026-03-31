#!/bin/bash

# Test script for portal integration with GitHub auth and presence

set -e

echo "=== Portal Integration Test ==="
echo ""

# Check if paste service is running
if ! curl -s http://localhost:19433/health > /dev/null 2>&1; then
  echo "❌ Paste service is not running on localhost:19433"
  echo "   Start it with: cd apps/paste-service && bun run targets/bun.ts"
  exit 1
fi

echo "✅ Paste service is running"

# Check if GitHub token is set
if [ -z "$GITHUB_TOKEN" ]; then
  echo ""
  echo "⚠️  GITHUB_TOKEN environment variable not set"
  echo "   Export your token: export GITHUB_TOKEN=ghp_..."
  echo ""
  read -p "Continue without token? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
else
  echo "✅ GitHub token is set"
fi

echo ""
echo "Starting portal dev server..."
echo "The portal will be available at http://localhost:3001"
echo ""

# Start the portal dev server
cd apps/portal && bun run dev
