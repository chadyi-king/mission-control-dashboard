#!/bin/bash
# Auto-commit and push data.json changes to GitHub
# Usage: bash push-dashboard-data.sh ["commit message"]

set -e

REPO_DIR="/home/chad-yi/.hermes/workspace/mission-control-dashboard"
DATA_FILE="$REPO_DIR/data.json"

# Check if data.json exists
if [ ! -f "$DATA_FILE" ]; then
    echo "ERROR: data.json not found at $DATA_FILE"
    exit 1
fi

# Check if there are changes to data.json
cd "$REPO_DIR"

if git diff --quiet data.json 2>/dev/null && git diff --cached --quiet data.json 2>/dev/null; then
    echo "No changes to data.json — nothing to push"
    exit 0
fi

# Stage data.json
git add data.json

# Commit with timestamp
MSG="${1:-Auto-update dashboard data $(date '+%Y-%m-%d %H:%M:%S %Z')}"
git commit -m "$MSG"

# Push to GitHub
git push origin main

echo "✅ data.json pushed to GitHub — dashboard will refresh within 30 seconds"
