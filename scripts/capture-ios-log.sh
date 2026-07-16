#!/usr/bin/env bash
# Stream iOS / BrainBit logs into logs/xcode-live.log (leave running while you test in Xcode).
# Usage: npm run logs:ios  →  test on iPad  →  in chat: read the log

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$ROOT/logs"
LOG_FILE="$LOG_DIR/xcode-live.log"

mkdir -p "$LOG_DIR"

echo "Recording → logs/xcode-live.log"
echo "Run the app from Xcode, then say in Cursor chat: read the log"
echo "Press Ctrl+C to stop."
echo "--- capture started $(date '+%Y-%m-%d %H:%M:%S %Z') ---" >> "$LOG_FILE"

/usr/bin/log stream --style compact 2>&1 \
  | grep -iE 'HeadphonesEEG|BrainBitBridge|BrainBit|CoherenceStateMachine|Signal check|connectionQuality|WS fanout|sentinel|⚡️ \[log\]|AudioEngine' \
  | tee -a "$LOG_FILE"
