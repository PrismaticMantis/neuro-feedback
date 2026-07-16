#!/usr/bin/env bash
# Save Xcode console text from the Mac clipboard → logs/xcode-latest.txt
# Usage: copy log in Xcode (Cmd+A, Cmd+C), then: npm run logs:save

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$ROOT/logs"
LOG_FILE="$LOG_DIR/xcode-latest.txt"

mkdir -p "$LOG_DIR"

if ! pbpaste | grep -q .; then
  echo "Clipboard is empty. In Xcode: select console output → Cmd+A → Cmd+C, then run this again."
  exit 1
fi

{
  echo "=== Xcode log saved $(date '+%Y-%m-%d %H:%M:%S %Z') ==="
  echo
  pbpaste
} > "$LOG_FILE"

LINES=$(wc -l < "$LOG_FILE" | tr -d ' ')
BYTES=$(wc -c < "$LOG_FILE" | tr -d ' ')
echo "Saved $LINES lines ($BYTES bytes) → logs/xcode-latest.txt"
echo "In Cursor chat, say: read the log"
