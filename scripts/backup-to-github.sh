#!/bin/bash
set -euo pipefail

REPO_DIR="/var/www/stockroom-dashboard"
cd "$REPO_DIR"

# Safety: require explicit opt-in.
if [[ "${BACKUP_TO_GITHUB_ALLOW:-}" != "1" ]]; then
    echo "Refusing to run: set BACKUP_TO_GITHUB_ALLOW=1 to proceed."
    exit 2
fi

if [[ ! -d .git ]]; then
    echo "Not a git repo: $REPO_DIR"
    exit 2
fi

branch="$(git rev-parse --abbrev-ref HEAD)"
if [[ -z "$branch" || "$branch" == "HEAD" ]]; then
    echo "Unable to determine current branch"
    exit 2
fi

# Refuse to proceed if any sensitive/runtime paths are staged or tracked changes are present.
if git status --porcelain=v1 | rg -q "(^|\s)(\.env(\.|$)|ssl/|data/|files/|logs/)"; then
    echo "Refusing to run: detected changes in sensitive/runtime paths (.env/ssl/data/files/logs)."
    echo "Fix .gitignore or unstage those changes before backing up."
    exit 2
fi

# Add all changes (respects .gitignore)
git add -A

if git diff --staged --quiet; then
    echo "[$(date)] No changes to backup"
    exit 0
fi

git commit -m "Auto backup - $(date '+%Y-%m-%d %H:%M')"
git push origin "$branch"

echo "[$(date)] Backup completed (branch=$branch)"
