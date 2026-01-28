# Employee Photos Audit Report
**Date:** January 24, 2026

## Current State Analysis

### Database Status
- **Total users:** 31
- **Users with images:** 21
- **CDN images (external):** 15
- **Local images:** 5

### Image Storage Locations

#### 1. External CDN Images (15 users)
**Source:** `https://cdn.suitsupply.com/image/upload/...`
- These are pulled from Suitsupply's external CDN
- Stored in database `users.image_url` column
- **Issue:** Relies on external service, could break if CDN changes or employee leaves company

**Example URLs:**
```
https://cdn.suitsupply.com/image/upload/w_600,h_600,c_lfill,g_face,b_rgb:ffffff00/l_employeeimages:14083/w_600,h_600,c_lfill,g_face,r_max,b_rgb:efefef/fl_layer_apply/w_400,h_400,c_crop,g_face,r_max,f_auto,q_auto,b_rgb:ffffff00/employeeimages/14083.jpg
```

#### 2. Local Uploaded Images (5 users)
**Source:** `/user-uploads/` directory
- Stored in: `/var/www/stockroom-dashboard/public/user-uploads/`
- Database reference: `/user-uploads/avatar-{timestamp}-{random}.jpeg`
- **Status:** ✅ Working correctly

**Users with local uploads:**
1. Daniel Valdez - `/user-uploads/avatar-1768929044558-874874901.jpeg`
2. Ivan Ramos - `/user-uploads/avatar-1768929055205-90654988.jpeg`
3. Kenneth (KJ) Lea - `/user-uploads/user-1767913784511_1767913784568.jpeg`
4. Joshua Haslett - `/user-uploads/user-1767913478139_1767913478198.jpeg`
5. Victor Rocha - `/user-uploads/avatar-1769044187061-718813423.jpeg`

#### 3. No Images (10 users)
- Will show initials placeholder instead

## How Images Are Currently Loaded

### Awards Page Flow
1. **Fetch employees** → `/api/gameplan/employees`
2. **Database query** → `SELECT image_url FROM users`
3. **Response includes:**
   ```javascript
   {
     name: "John Doe",
     imageUrl: "https://cdn.suitsupply.com/..." // or "/user-uploads/..."
   }
   ```
4. **Rendering:**
   ```javascript
   imageUrl 
     ? `<img src="${imageUrl}" alt="${name}">`
     : `<div class="placeholder">${initials}</div>`
   ```

### Data Flow Diagram
```
Database (users.image_url)
    ↓
routes/gameplan.js → pruneEmployeesFile() → fetchUsersFromDB()
    ↓
/api/gameplan/employees endpoint
    ↓
awards.js → loadEmployees()
    ↓
renderTopScan() → renderLeaderboardRow()
    ↓
HTML <img src="{imageUrl}">
```

## Issues Identified

### 1. ❌ External CDN Dependency
**Problem:** 15 employees rely on Suitsupply CDN which could:
- Break if employee leaves company
- Change URLs without notice
- Have access restrictions
- Slow load times from external service

### 2. ✅ Local Uploads Working
**Status:** Manual uploads via admin panel work correctly
- Stored in `/public/user-uploads/`
- Accessible via HTTP at `/user-uploads/{filename}`
- Properly saved to database

### 3. ⚠️ Mixed Image Sources
**Issue:** Some pages might not handle both URL types consistently
- Need to verify all pages handle both `/user-uploads/` and `https://` URLs
- Image loading errors might not be visible

## Recommendations

### Priority 1: Download & Convert CDN Images

#### Step 1: Create Download Script
```javascript
// scripts/download-employee-photos.js
const fs = require('fs');
const path = require('path');
const https = require('https');
const { query } = require('../utils/dal/pg');

async function downloadCDNPhotos() {
  // Get all CDN image URLs
  const result = await query(
    "SELECT id, name, image_url FROM users WHERE image_url LIKE 'https://%'"
  );
  
  for (const user of result.rows) {
    const url = user.image_url;
    const filename = `employee-${user.id}-${Date.now()}.jpg`;
    const filepath = path.join(__dirname, '../public/user-uploads', filename);
    
    // Download image
    await downloadImage(url, filepath);
    
    // Update database
    await query(
      'UPDATE users SET image_url = $1 WHERE id = $2',
      [`/user-uploads/${filename}`, user.id]
    );
    
    console.log(`Downloaded: ${user.name}`);
  }
}
```

#### Step 2: Image Optimization (Optional)
- Convert to WebP for better compression
- Resize to standard size (400x400)
- Reduce file size by ~60-70%

### Priority 2: Verify Image Display Across Pages

Pages to check:
- ✅ [awards.html](public/awards.html) - Currently working
- [ ] [gameplan-sa.html](public/gameplan-sa.html)
- [ ] [gameplan-management.html](public/gameplan-management.html)
- [ ] [gameplan-boh.html](public/gameplan-boh.html)
- [ ] [gameplan-tailors.html](public/gameplan-tailors.html)
- [ ] [daily-scan-performance.html](public/daily-scan-performance.html)
- [ ] [admin.html](public/admin.html)

### Priority 3: Implement Fallback Strategy

Add error handling for broken images:
```javascript
function renderEmployeePhoto(employee) {
  const initials = getInitials(employee.name);
  
  if (employee.imageUrl) {
    return `
      <img 
        src="${employee.imageUrl}" 
        alt="${employee.name}"
        onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
      >
      <div class="placeholder" style="display:none;">${initials}</div>
    `;
  } else {
    return `<div class="placeholder">${initials}</div>`;
  }
}
```

## Action Items

### Immediate (Today)
1. ✅ Audit complete - documented current state
2. ⏳ Test image display on all pages
3. ⏳ Fix any broken image links

### Short-term (This Week)
1. Create download script for CDN images
2. Download and migrate all CDN photos to local storage
3. Update database references
4. Test all pages after migration

### Long-term (This Month)
1. Implement image compression/optimization
2. Add image upload validation (size, format)
3. Create backup strategy for user-uploads directory
4. Add monitoring for broken image links

## Database Schema Reference

```sql
-- users table
CREATE TABLE users (
  id UUID PRIMARY KEY,
  employee_id TEXT,
  name TEXT,
  email TEXT,
  image_url TEXT,  -- Can be /user-uploads/... or https://...
  -- ... other fields
);
```

## File Paths Reference

```
/var/www/stockroom-dashboard/
├── public/
│   ├── user-uploads/              # ← Local employee photos
│   │   ├── avatar-*.jpeg
│   │   └── user-*.jpeg
│   └── images/                     # Static site images
├── routes/
│   └── auth-pg.js                  # Handles photo upload (/api/auth/users/:id/photo)
└── data/
    └── employees-v2.json           # Legacy - being phased out
```

## API Endpoints

```
POST /api/auth/users/:id/photo     # Upload employee photo
  → Saves to /public/user-uploads/
  → Updates users.image_url in database
  → Returns: { imageUrl: "/user-uploads/..." }

GET /api/gameplan/employees         # Get all employees with photos
  → Fetches from database
  → Returns: { imageUrl: "..." }
```

## Testing Checklist

- [ ] CDN images load on Awards page
- [ ] Local images load on Awards page  
- [ ] Images load on Daily Scan Performance page
- [ ] Images load on Gameplan pages
- [ ] Image upload works in admin panel
- [ ] Broken images show initials placeholder
- [ ] No console errors for missing images
