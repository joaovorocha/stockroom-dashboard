#!/bin/bash
# Quick deployment script for stockroom-dashboard updates
# Usage: ./deploy-update.sh

set -e  # Exit on any error

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║         Stockroom Dashboard - Quick Deploy Update             ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -f "server.js" ]; then
    echo "❌ Error: Must run from /var/www/stockroom-dashboard directory"
    exit 1
fi

# Show current branch
CURRENT_BRANCH=$(git branch --show-current)
echo -e "${BLUE}📍 Current branch:${NC} $CURRENT_BRANCH"
echo ""

# Fetch latest changes
echo -e "${BLUE}📥 Fetching latest changes...${NC}"
git fetch origin

# Show what will be updated
echo ""
echo -e "${YELLOW}📋 Changes to be pulled:${NC}"
git log HEAD..origin/jan-9 --oneline --no-decorate | head -5
echo ""

# Ask for confirmation
read -p "Continue with deployment? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Deployment cancelled"
    exit 0
fi

# Pull latest changes
echo -e "${BLUE}⬇️  Pulling changes...${NC}"
git pull origin jan-9

# Show what changed
echo ""
echo -e "${GREEN}✅ Files updated:${NC}"
git diff --stat HEAD@{1} HEAD
echo ""

# Restart PM2 service
echo -e "${BLUE}🔄 Restarting stockroom-dashboard service...${NC}"
pm2 restart stockroom-dashboard

# Wait a moment for service to start
sleep 2

# Check status
echo ""
echo -e "${GREEN}📊 Service status:${NC}"
pm2 list | grep stockroom-dashboard

# Show recent logs
echo ""
echo -e "${BLUE}📝 Recent logs (last 10 lines):${NC}"
pm2 logs stockroom-dashboard --lines 10 --nostream

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                    ✅ DEPLOYMENT COMPLETE                      ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo -e "${GREEN}✅ App is running on http://localhost:3000${NC}"
echo ""
echo "💡 Quick commands:"
echo "   pm2 logs stockroom-dashboard     - View live logs"
echo "   pm2 restart stockroom-dashboard  - Restart service"
echo "   pm2 status                       - Check all services"
echo ""
