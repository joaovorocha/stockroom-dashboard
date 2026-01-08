#!/bin/bash
set -euo pipefail

# Save current version to a new git branch with date.
BRANCH="gameplan-v2-$(date +%Y-%m-%d-%H%M%S)"
echo "Creating branch: $BRANCH"

# Safety guard: refuse if there are obvious runtime/secrets changes.
if git status --porcelain=v1 | rg -q "(^|\s)(\.env(\.|$)|ssl/|data/|files/|logs/)"; then
	echo "Refusing: detected changes in sensitive/runtime paths (.env/ssl/data/files/logs)."
	exit 2
fi

git checkout -b "$BRANCH"
git add -A
git commit -m "Auto-save version $BRANCH"
git push origin "$BRANCH"
echo "Version saved and pushed to GitHub as $BRANCH"