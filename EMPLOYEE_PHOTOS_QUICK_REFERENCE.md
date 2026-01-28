# Employee Photos - Quick Reference Guide

## Current Status Summary

### Statistics
- **Total Active Users:** 28
- **With Photos:** 18 (64.3%)
- **Without Photos:** 10 (35.7%)
- **Local Photos:** 4
- **CDN Photos:** 14
- **Broken Links:** 1

### Issues Found
1. **Joshua Haslett** - Missing file: `/user-uploads/user-1767913478139_1767913478198.jpeg`
   - Database has reference but file doesn't exist
   - Need to re-upload photo

2. **Orphaned File** - `avatar-1768529970628-826023403.jpeg`
   - File exists but not referenced in database
   - Can be deleted or assigned to a user

## Migration Plan

### Step 1: Test Current State (DONE ✅)
```bash
node scripts/test-employee-photos.js
```

### Step 2: Migrate CDN Photos to Local Storage
```bash
# This will download all 14 CDN photos and update database
node scripts/migrate-cdn-photos.js
```

**What it does:**
- Creates backup before migration
- Downloads photos from cdn.suitsupply.com
- Saves to `/public/user-uploads/`
- Updates database with local paths
- Generates migration report

**Safety:**
- Creates backup in `/data/photo-migration-backup/`
- Can be rolled back if needed
- Leaves original URLs in backup file

### Step 3: Verify Migration
```bash
node scripts/test-employee-photos.js
```

Expected result: 0 CDN photos, 18 local photos

### Step 4: Fix Missing Photo (Joshua Haslett)
1. Ask Joshua to re-upload photo via admin panel
2. OR use orphaned file if it's his photo:
   ```bash
   # Check if orphaned file is Joshua's
   # If yes, update database:
   echo "UPDATE users SET image_url = '/user-uploads/avatar-1768529970628-826023403.jpeg' WHERE name = 'Joshua Haslett';" | psql -U suit -d stockroom_dashboard
   ```

## Image Upload Guide (For Managers)

### Via Admin Panel
1. Go to Admin → User Management
2. Click on user
3. Upload photo (max 5MB, JPG/PNG)
4. Photo auto-saves to `/user-uploads/`
5. Database auto-updates

### Manual Database Update (Advanced)
```sql
UPDATE users 
SET image_url = '/user-uploads/filename.jpg' 
WHERE email = 'user@example.com';
```

## Rollback Plan

If migration fails, restore from backup:

```bash
# List backups
ls -lh data/photo-migration-backup/

# View backup
cat data/photo-migration-backup/pre-migration-*.json

# Restore (run SQL updates from backup file)
# Example for one user:
UPDATE users SET image_url = 'https://cdn.suitsupply.com/...' WHERE id = 'user-id';
```

## Pages That Display Employee Photos

All pages have been updated with fallback handling (shows initials if image fails):

1. ✅ **Awards Page** - `awards.html`
   - Shows top performers with photos
   - Fixed: Now handles broken images gracefully

2. **Daily Scan Performance** - `daily-scan-performance.html`
   - Employee performance list
   - Uses `employeePhotoMap`

3. **Gameplan Pages**
   - `gameplan-sa.html`
   - `gameplan-management.html`
   - `gameplan-boh.html`
   - `gameplan-tailors.html`

4. **Shared Header** - `shared-header.js`
   - User avatar in top-right corner
   - Line 649-650

5. **Admin Panel** - `admin.html`
   - User management interface

## Image Display Code Pattern

### Correct Pattern (with fallback)
```javascript
function renderEmployeePhoto(employee) {
  const initials = getInitials(employee.name);
  
  if (employee.imageUrl) {
    return `
      <img 
        src="${employee.imageUrl}" 
        alt="${employee.name}"
        class="employee-photo"
        onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
      <div class="employee-photo placeholder" style="display:none;">
        ${initials}
      </div>
    `;
  } else {
    return `<div class="employee-photo placeholder">${initials}</div>`;
  }
}
```

### What NOT to do
```javascript
// ❌ No fallback - breaks if image missing
<img src="${employee.imageUrl}" alt="${employee.name}">

// ❌ No error handling - shows broken image icon
<img src="${employee.imageUrl || ''}" alt="${employee.name}">
```

## Maintenance Tasks

### Weekly
- Run photo test: `node scripts/test-employee-photos.js`
- Check for broken links
- Clean up orphaned files

### Monthly
- Backup user-uploads directory
- Check disk space usage
- Optimize large images (compress if > 500KB)

### As Needed
- When employee leaves: Keep photo for historical records
- When new employee joins: Prompt to upload photo
- When photo updated: Old file can be deleted after 30 days

## File Size Guidelines

- **Maximum:** 5MB (enforced by upload endpoint)
- **Recommended:** 100-500KB
- **Optimal dimensions:** 400x400 pixels
- **Format:** JPEG (best compression) or PNG (if transparency needed)

## Backup Strategy

### Current Backups
```bash
# User-uploads are NOT automatically backed up
# Need to set up:

# Option 1: Daily cron job
0 2 * * * tar -czf /backup/user-uploads-$(date +\%Y\%m\%d).tar.gz /var/www/stockroom-dashboard/public/user-uploads/

# Option 2: Add to GitHub backup script
# (If photos are small enough for Git)

# Option 3: Cloud storage sync
# Use rsync to AWS S3 or similar
```

### Database Backups
Photos URLs are in `users.image_url` column - automatically backed up with database.

## Troubleshooting

### Photo not showing on page
1. Check browser console for 404 errors
2. Verify file exists: `ls -lh public/user-uploads/filename.jpg`
3. Check database: `SELECT image_url FROM users WHERE name = 'User Name';`
4. Verify permissions: `chmod 644 public/user-uploads/filename.jpg`

### Upload fails
1. Check file size (< 5MB)
2. Check disk space: `df -h`
3. Check directory permissions: `ls -ld public/user-uploads/`
4. Check logs: `pm2 logs stockroom-dashboard --lines 50`

### Slow loading
1. Check file sizes: `ls -lh public/user-uploads/ | sort -k5 -hr`
2. Compress large files: `mogrify -resize 400x400 -quality 85 *.jpg`
3. Convert to WebP: `cwebp -q 80 input.jpg -o output.webp`

### CDN images broken
1. Run migration: `node scripts/migrate-cdn-photos.js`
2. This downloads and stores locally
3. Prevents external dependency issues

## Next Steps

**Immediate:**
- [ ] Run migration script to move CDN photos to local
- [ ] Fix Joshua Haslett's missing photo
- [ ] Clean up orphaned file

**This Week:**
- [ ] Set up automated backups for user-uploads
- [ ] Add image compression on upload
- [ ] Test all pages for photo display

**This Month:**
- [ ] Create admin interface to manage photos
- [ ] Add bulk photo upload feature
- [ ] Implement image optimization pipeline

## Support

For issues or questions:
- Check logs: `pm2 logs stockroom-dashboard`
- Run tests: `node scripts/test-employee-photos.js`
- Contact: Victor Rocha (831-998-3808)
