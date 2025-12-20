#!/bin/bash
# Save current version to a new git branch with date
BRANCH="gameplan-v2-$(date +%Y-%m-%d-%H%M%S)"
echo "Creating branch: $BRANCH"
git checkout -b "$BRANCH"
git add .
git commit -m "Auto-save version $BRANCH"
git push origin "$BRANCH"
echo "Version saved and pushed to GitHub as $BRANCH"