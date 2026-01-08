#!/bin/bash
set -euo pipefail

# ========================================
# Deploy Stockroom Dashboard to Server
# Run this from your LOCAL machine
# ========================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Configuration (override via env vars)
SERVER_USER="${SERVER_USER:-suit}"
SERVER_IP="${SERVER_IP:-10.201.48.17}"
SERVER_PATH="${SERVER_PATH:-/var/www/stockroom-dashboard}"

TARBALL="${TARBALL_PATH:-/tmp/stockroom-deploy.tar.gz}"

echo "=== Deploying Stockroom Dashboard ==="
echo "Project: $PROJECT_ROOT"
echo "Server:  $SERVER_USER@$SERVER_IP"
echo "Path:    $SERVER_PATH"
echo ""

echo "Creating deployment package..."
tar -czf "$TARBALL" \
    --exclude='node_modules' \
    --exclude='.git' \
    --exclude='*.log' \
    --exclude='ssl' \
    --exclude='.env' \
    --exclude='data' \
    --exclude='files' \
    --exclude='logs' \
    -C "$PROJECT_ROOT" .

echo "Uploading to server..."
scp "$TARBALL" "$SERVER_USER@$SERVER_IP:/tmp/"

echo "Setting up on server..."
ssh "$SERVER_USER@$SERVER_IP" "SERVER_PATH='$SERVER_PATH'" << 'ENDSSH'
    set -euo pipefail

    sudo mkdir -p "$SERVER_PATH"
    sudo chown "$USER:$USER" "$SERVER_PATH"

    tar -xzf /tmp/stockroom-deploy.tar.gz -C "$SERVER_PATH"

    cd "$SERVER_PATH"
    npm install --production

    chmod +x deploy/*.sh || true
    echo "Files deployed to $SERVER_PATH"
ENDSSH

echo ""
echo "=== Deployment complete! ==="
echo "Next:"
echo "  ssh $SERVER_USER@$SERVER_IP"
echo "  cd $SERVER_PATH && pm2 reload ecosystem.config.json"
