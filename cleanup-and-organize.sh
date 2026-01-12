#!/bin/bash
set -e

echo "🧹 Cleaning up and organizing stockroom dashboard files..."
echo ""

# Create legacy directories
mkdir -p legacy/old-data-files
mkdir -p legacy/backup-files  
mkdir -p legacy/broken-files

# ============================================================================
# STEP 1: Remove weird broken files
# ============================================================================
echo "📦 Step 1: Removing broken/malformed files..."

if [ -f "() - query shipments with filters" ]; then
  rm -f "() - query shipments with filters"
  echo "  ✓ Removed: () - query shipments with filters"
fi

if [ -f "hipment" ]; then
  rm -f "hipment"
  echo "  ✓ Removed: hipment"
fi

if [ -f "ql -U suit -d stockroom_dashboard -c SELECT * FROM shipments LIMIT 1;" ]; then
  rm -f "ql -U suit -d stockroom_dashboard -c SELECT * FROM shipments LIMIT 1;"
  echo "  ✓ Removed: ql -U suit -d stockroom_dashboard -c SELECT * FROM shipments LIMIT 1;"
fi

if [ -f "resolve console errors for shipments and closing duties APIs.\" && git push origin jan-9" ]; then
  rm -f "resolve console errors for shipments and closing duties APIs.\" && git push origin jan-9"
  echo "  ✓ Removed: resolve console errors..."
fi

# ============================================================================
# STEP 2: Move duplicate employee files (since data is in PostgreSQL now)
# ============================================================================
echo ""
echo "👥 Step 2: Cleaning up duplicate employee files..."

# We only need /var/lib/stockroom-dashboard/data/employees-v2.json
# This is what the DAL reads from

# Move /var/www employees files to legacy (these are duplicates)
if [ -f "data/employees.json" ]; then
  mv data/employees.json legacy/old-data-files/employees.json.repo-copy
  echo "  ✓ Moved: data/employees.json → legacy/old-data-files/"
fi

if [ -f "data/employees-v2.json" ]; then
  mv data/employees-v2.json legacy/old-data-files/employees-v2.json.repo-copy
  echo "  ✓ Moved: data/employees-v2.json → legacy/old-data-files/"
fi

# Remove old employees.json from /var/lib (v2 is the current one)
if [ -f "/var/lib/stockroom-dashboard/data/employees.json" ]; then
  mv /var/lib/stockroom-dashboard/data/employees.json /var/lib/stockroom-dashboard/data/employees.json.old
  echo "  ✓ Archived: /var/lib/.../employees.json → employees.json.old"
fi

# ============================================================================
# STEP 3: Move all backup/bak files
# ============================================================================
echo ""
echo "💾 Step 3: Organizing backup files..."

find . -name "*.bak" -o -name "*.backup" -o -name "*.old" 2>/dev/null | while read file; do
  # Skip files already in legacy
  if [[ "$file" != *"/legacy/"* ]]; then
    basename=$(basename "$file")
    mv "$file" "legacy/backup-files/$basename"
    echo "  ✓ Moved: $file → legacy/backup-files/"
  fi
done

# Move .bak2 files
find . -name "*.bak2" 2>/dev/null | while read file; do
  if [[ "$file" != *"/legacy/"* ]]; then
    basename=$(basename "$file")
    mv "$file" "legacy/backup-files/$basename"
    echo "  ✓ Moved: $file → legacy/backup-files/"
  fi
done

# ============================================================================
# STEP 4: Clean up legacy users files
# ============================================================================
echo ""
echo "🔐 Step 4: Organizing legacy auth files..."

if [ -f "data/users.json.legacy" ]; then
  mv data/users.json.legacy legacy/old-data-files/users.json.legacy
  echo "  ✓ Moved: data/users.json.legacy → legacy/old-data-files/"
fi

if [ -f "data/users.json.backup" ]; then
  mv data/users.json.backup legacy/old-data-files/users.json.backup
  echo "  ✓ Moved: data/users.json.backup → legacy/old-data-files/"
fi

# ============================================================================
# STEP 5: Clean up ._* macOS metadata files
# ============================================================================
echo ""
echo "🍎 Step 5: Removing macOS metadata files..."

find data -name "._*" -type f -delete 2>/dev/null || true
echo "  ✓ Cleaned macOS ._* files from data/"

# ============================================================================
# STEP 6: Remove duplicate shipments backups
# ============================================================================
echo ""
echo "📦 Step 6: Organizing shipments backup files..."

if [ -f "data/shipments-backup-2026-01-09T09-15-14.653Z.json" ]; then
  mv data/shipments-backup-*.json legacy/old-data-files/ 2>/dev/null || true
  echo "  ✓ Moved old shipments backups → legacy/old-data-files/"
fi

# ============================================================================
# SUMMARY
# ============================================================================
echo ""
echo "✅ Cleanup complete!"
echo ""
echo "📋 Summary:"
echo "  • Removed broken/malformed files"
echo "  • Moved duplicate employee files to legacy/"
echo "  • Organized all .bak/.backup files"
echo "  • Cleaned up macOS metadata files"
echo "  • Moved legacy auth files"
echo ""
echo "📁 Current data structure:"
echo "  • Employee data: PostgreSQL users table (source of truth)"
echo "  • Employee cache: /var/lib/stockroom-dashboard/data/employees-v2.json"
echo "  • Legacy files: /var/www/stockroom-dashboard/legacy/"
echo ""
echo "💡 Note: Employee data is now stored in PostgreSQL."
echo "   The employees-v2.json file is just a cache that syncs from the database."
echo ""
