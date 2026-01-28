#!/bin/bash
#
# Enterprise Multi-Store Deployment Script
# Deploys enterprise-multistore branch to production
#
# Usage: ./deploy-enterprise.sh [--dry-run]
#

set -e  # Exit on error

# Configuration
BRANCH="enterprise-multistore"
APP_DIR="/var/www/stockroom-dashboard"
BACKUP_DIR="/var/backups/stockroom"
PM2_APP="stockroom-dashboard"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Flags
DRY_RUN=false
SKIP_BACKUP=false
SKIP_MIGRATIONS=false

# Parse arguments
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --dry-run) DRY_RUN=true ;;
        --skip-backup) SKIP_BACKUP=true ;;
        --skip-migrations) SKIP_MIGRATIONS=true ;;
        -h|--help) 
            echo "Usage: $0 [--dry-run] [--skip-backup] [--skip-migrations]"
            exit 0 
            ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
    shift
done

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Enterprise Multi-Store Deployment${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

if [ "$DRY_RUN" = true ]; then
    echo -e "${YELLOW}⚠️  DRY RUN MODE - No changes will be made${NC}"
    echo ""
fi

# Function to run or simulate command
run_cmd() {
    if [ "$DRY_RUN" = true ]; then
        echo -e "${YELLOW}[DRY RUN]${NC} $1"
    else
        echo -e "${GREEN}[RUN]${NC} $1"
        eval "$1"
    fi
}

# Step 1: Pre-flight checks
echo -e "${BLUE}Step 1: Pre-flight checks${NC}"
echo "-------------------------------------------"

# Check if we're in the right directory
if [ ! -d "$APP_DIR" ]; then
    echo -e "${RED}ERROR: App directory not found: $APP_DIR${NC}"
    exit 1
fi
echo "✅ App directory exists"

cd "$APP_DIR"

# Check git status
if [ -n "$(git status --porcelain)" ]; then
    echo -e "${YELLOW}⚠️  Warning: Uncommitted changes detected${NC}"
    if [ "$DRY_RUN" = false ]; then
        read -p "Continue anyway? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
fi
echo "✅ Git status checked"

# Check if branch exists
if ! git show-ref --verify --quiet refs/heads/$BRANCH; then
    echo -e "${RED}ERROR: Branch $BRANCH does not exist${NC}"
    exit 1
fi
echo "✅ Branch $BRANCH exists"

# Check PM2
if ! command -v pm2 &> /dev/null; then
    echo -e "${RED}ERROR: PM2 not found${NC}"
    exit 1
fi
echo "✅ PM2 available"

echo ""

# Step 2: Create backup
echo -e "${BLUE}Step 2: Create backup${NC}"
echo "-------------------------------------------"

if [ "$SKIP_BACKUP" = false ]; then
    BACKUP_PATH="$BACKUP_DIR/backup_$TIMESTAMP"
    run_cmd "mkdir -p $BACKUP_PATH"
    
    # Database backup
    echo "📦 Backing up database..."
    run_cmd "pg_dump -U suit stockroom_dashboard > $BACKUP_PATH/database.sql"
    
    # Config backup
    echo "📦 Backing up config files..."
    run_cmd "cp $APP_DIR/.env $BACKUP_PATH/.env.backup 2>/dev/null || true"
    run_cmd "cp $APP_DIR/ecosystem.config.json $BACKUP_PATH/ 2>/dev/null || true"
    
    echo "✅ Backup created at $BACKUP_PATH"
else
    echo "⏭️  Skipping backup (--skip-backup)"
fi

echo ""

# Step 3: Pull latest code
echo -e "${BLUE}Step 3: Pull latest code${NC}"
echo "-------------------------------------------"

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo "Current branch: $CURRENT_BRANCH"
echo "Target branch: $BRANCH"

if [ "$CURRENT_BRANCH" != "$BRANCH" ]; then
    run_cmd "git checkout $BRANCH"
fi

run_cmd "git pull origin $BRANCH"
echo "✅ Code updated"

echo ""

# Step 4: Install dependencies
echo -e "${BLUE}Step 4: Install dependencies${NC}"
echo "-------------------------------------------"

run_cmd "npm install --production"
echo "✅ Backend dependencies installed"

run_cmd "cd client && npm install && cd .."
echo "✅ Frontend dependencies installed"

echo ""

# Step 5: Run migrations
echo -e "${BLUE}Step 5: Run database migrations${NC}"
echo "-------------------------------------------"

if [ "$SKIP_MIGRATIONS" = false ]; then
    MIGRATION_DIR="$APP_DIR/migrations/enterprise"
    
    if [ -d "$MIGRATION_DIR" ]; then
        echo "Running enterprise migrations..."
        for migration in $(ls -1 "$MIGRATION_DIR"/*.sql 2>/dev/null | sort); do
            echo "  📝 Running: $(basename $migration)"
            run_cmd "psql -U suit -d stockroom_dashboard -f $migration 2>&1 | head -5"
        done
        echo "✅ Migrations complete"
    else
        echo "⏭️  No migrations found"
    fi
else
    echo "⏭️  Skipping migrations (--skip-migrations)"
fi

echo ""

# Step 6: Build frontend
echo -e "${BLUE}Step 6: Build frontend${NC}"
echo "-------------------------------------------"

run_cmd "cd client && npm run build && cd .."
echo "✅ Frontend built"

echo ""

# Step 7: Restart application
echo -e "${BLUE}Step 7: Restart application${NC}"
echo "-------------------------------------------"

run_cmd "pm2 restart $PM2_APP"
echo "✅ Application restarted"

# Wait for app to start
if [ "$DRY_RUN" = false ]; then
    echo "Waiting for app to start..."
    sleep 3
fi

echo ""

# Step 8: Health check
echo -e "${BLUE}Step 8: Health check${NC}"
echo "-------------------------------------------"

if [ "$DRY_RUN" = false ]; then
    # Check PM2 status
    pm2 show $PM2_APP | grep -E "status|uptime|restarts" || true
    
    # Check if server responds
    echo ""
    echo "Testing server response..."
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/health 2>/dev/null || echo "000")
    
    if [ "$HTTP_CODE" = "200" ]; then
        echo -e "${GREEN}✅ Server is healthy (HTTP 200)${NC}"
    else
        echo -e "${YELLOW}⚠️  Server returned HTTP $HTTP_CODE${NC}"
    fi
else
    echo "[DRY RUN] Would check server health"
fi

echo ""

# Step 9: Run tests
echo -e "${BLUE}Step 9: Run permission tests${NC}"
echo "-------------------------------------------"

if [ "$DRY_RUN" = false ]; then
    node scripts/tests/test-multistore-permissions.js 2>&1 | tail -15
else
    echo "[DRY RUN] Would run: node scripts/tests/test-multistore-permissions.js"
fi

echo ""

# Summary
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}  Deployment Complete!${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "Branch: $BRANCH"
echo "Timestamp: $TIMESTAMP"
if [ "$SKIP_BACKUP" = false ]; then
    echo "Backup: $BACKUP_PATH"
fi
echo ""
echo "Next steps:"
echo "  1. Verify the application at https://your-domain.com"
echo "  2. Test login with store selection"
echo "  3. Test admin panels (/admin and /store)"
echo "  4. Monitor logs: pm2 logs $PM2_APP"
echo ""

if [ "$DRY_RUN" = true ]; then
    echo -e "${YELLOW}This was a DRY RUN. No changes were made.${NC}"
    echo "Run without --dry-run to deploy."
fi
