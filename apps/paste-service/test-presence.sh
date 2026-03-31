#!/bin/bash
# Test script for presence awareness

set -e

PASTE_SERVICE="http://localhost:19433"
TOKEN="${GITHUB_TOKEN:-}"

if [ -z "$TOKEN" ]; then
  echo "Error: GITHUB_TOKEN environment variable not set"
  exit 1
fi

echo "=== Phase 4: Presence Awareness Test ==="
echo ""

# Create a test paste first
echo "Creating test paste..."
PASTE_RESPONSE=$(curl -s -X POST "$PASTE_SERVICE/api/paste" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "data": "test-data-for-presence",
    "acl": {
      "type": "whitelist",
      "users": ["ssiddh"]
    }
  }')

PASTE_ID=$(echo "$PASTE_RESPONSE" | jq -r '.id')

if [ "$PASTE_ID" = "null" ] || [ -z "$PASTE_ID" ]; then
  echo "✗ Failed to create paste"
  echo "Response: $PASTE_RESPONSE"
  exit 1
fi

echo "✓ Paste created: $PASTE_ID"
echo ""

# Test presence stream (run in background)
echo "=== Testing Presence Stream ==="
echo "Starting SSE connection..."

# Start SSE stream in background
curl -s -N -H "Authorization: Bearer $TOKEN" \
  "$PASTE_SERVICE/api/presence/$PASTE_ID/stream" > /tmp/presence-stream.log 2>&1 &
STREAM_PID=$!

echo "✓ SSE stream started (PID: $STREAM_PID)"
sleep 2

# Check if we got initial presence event
if grep -q "init" /tmp/presence-stream.log; then
  echo "✓ Received initial presence event"
  cat /tmp/presence-stream.log
else
  echo "✗ No initial presence event received"
  cat /tmp/presence-stream.log
fi

echo ""
echo "=== Testing Heartbeat ==="

# Send heartbeat
HEARTBEAT_RESPONSE=$(curl -s -X POST "$PASTE_SERVICE/api/presence/$PASTE_ID/heartbeat" \
  -H "Authorization: Bearer $TOKEN")

echo "Heartbeat response: $HEARTBEAT_RESPONSE"

if echo "$HEARTBEAT_RESPONSE" | jq -e '.ok == true' > /dev/null 2>&1; then
  echo "✓ Heartbeat successful"
else
  echo "✗ Heartbeat failed"
fi

echo ""
echo "=== Cleanup ==="
echo "Stopping SSE stream..."
kill $STREAM_PID 2>/dev/null || true
sleep 1

# Check for leave event
if grep -q "leave" /tmp/presence-stream.log; then
  echo "✓ Received leave event after disconnect"
else
  echo "Note: Leave event may not appear (stream closed)"
fi

echo ""
echo "=== Test Complete ==="
echo "Paste ID: $PASTE_ID"
echo "Stream log: /tmp/presence-stream.log"
