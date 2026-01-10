#!/usr/bin/env node

/**
 * Add iOS PWA Support to All HTML Pages
 * Automatically updates HTML files with:
 * - iOS metadata in <head>
 * - Touch gesture scripts before </body>
 * - Bottom navigation component
 * 
 * Run: node scripts/add-ios-to-pages.js
 */

const fs = require('fs');
const path = require('path');

// Pages to update
const PAGES = [
  'app.html',
  'dashboard.html',
  'gameplan.html',
  'gameplan-boh.html',
  'gameplan-sa.html',
  'gameplan-tailors.html',
  'gameplan-management.html',
  'shipments.html',
  'lost-punch.html',
  'time-off.html',
  'operations-metrics.html',
  'ops-dashboard.html',
  'store-recovery.html',
  'closing-duties.html',
  'feedback.html',
  'awards.html',
  'expenses.html'
];

// iOS metadata to add to <head>
const IOS_METADATA = `
  <!-- iOS PWA Support -->
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="Stockroom">
  <link rel="apple-touch-icon" href="/icons/apple-touch-icon-180.png">
  <link rel="apple-touch-icon" sizes="152x152" href="/icons/apple-touch-icon-152.png">
  <link rel="apple-touch-icon" sizes="144x144" href="/icons/apple-touch-icon-144.png">
  <link rel="apple-touch-icon" sizes="120x120" href="/icons/apple-touch-icon-120.png">
  <link rel="apple-touch-icon" sizes="76x76" href="/icons/apple-touch-icon-76.png">
  <link rel="manifest" href="/manifest.webmanifest">
  <meta name="theme-color" content="#1a5490">
  <link rel="stylesheet" href="/css/bottom-nav.css?v=1">`;

// Scripts to add before </body>
const IOS_SCRIPTS = `
  <!-- Touch gestures & native iOS interactions -->
  <script src="/js/touch-gestures.js?v=1"></script>
  
  <!-- Service Worker registration for PWA -->
  <script>
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then(reg => console.log('Service Worker registered'))
        .catch(err => console.error('Service Worker registration failed:', err));
    }
  </script>`;

// Bottom navigation HTML
const BOTTOM_NAV = `
  <!-- Bottom Navigation (iOS-like Tab Bar) -->
  <nav class="bottom-nav">
    <a href="/home" class="nav-item">
      <div class="nav-item-icon">🏠</div>
      <div class="nav-item-label">Home</div>
    </a>
    <a href="/gameplan.html" class="nav-item">
      <div class="nav-item-icon">📋</div>
      <div class="nav-item-label">Game Plan</div>
    </a>
    <a href="/shipments.html" class="nav-item">
      <div class="nav-item-icon">📦</div>
      <div class="nav-item-label">Shipments</div>
    </a>
    <a href="/lost-punch.html" class="nav-item">
      <div class="nav-item-icon">⏰</div>
      <div class="nav-item-label">Punch</div>
    </a>
    <a href="/time-off.html" class="nav-item">
      <div class="nav-item-icon">📅</div>
      <div class="nav-item-label">Time Off</div>
    </a>
  </nav>`;

/**
 * Update a single HTML file
 */
function updateHtmlFile(filename) {
  const filePath = path.join(__dirname, '../public', filename);
  
  // Check if file exists
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  Skipping ${filename} (not found)`);
    return false;
  }
  
  let html = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  
  // Check if already has iOS metadata
  if (html.includes('apple-mobile-web-app-capable')) {
    console.log(`ℹ️  ${filename} already has iOS metadata, skipping...`);
    return false;
  }
  
  // Add iOS metadata before </head>
  if (html.includes('</head>') && !html.includes('apple-mobile-web-app-capable')) {
    html = html.replace('</head>', `${IOS_METADATA}\n</head>`);
    modified = true;
  }
  
  // Add iOS scripts before </body>
  if (html.includes('</body>') && !html.includes('touch-gestures.js')) {
    html = html.replace('</body>', `${IOS_SCRIPTS}\n</body>`);
    modified = true;
  }
  
  // Add bottom navigation before scripts (if not already there)
  if (!html.includes('bottom-nav') && html.includes('</body>')) {
    // Insert bottom nav right before the iOS scripts we just added
    html = html.replace(
      '<!-- Touch gestures & native iOS interactions -->',
      `${BOTTOM_NAV}\n\n  <!-- Touch gestures & native iOS interactions -->`
    );
    modified = true;
  }
  
  // Update viewport meta tag to include viewport-fit=cover
  if (html.includes('<meta name="viewport"') && !html.includes('viewport-fit=cover')) {
    html = html.replace(
      /<meta name="viewport" content="([^"]*)"/,
      '<meta name="viewport" content="$1, viewport-fit=cover, user-scalable=no"'
    );
    modified = true;
  }
  
  // Write back to file
  if (modified) {
    fs.writeFileSync(filePath, html, 'utf8');
    console.log(`✓ Updated ${filename}`);
    return true;
  }
  
  return false;
}

/**
 * Main function
 */
function main() {
  console.log('🚀 Adding iOS PWA Support to All Pages...\n');
  
  let updated = 0;
  let skipped = 0;
  
  for (const page of PAGES) {
    const result = updateHtmlFile(page);
    if (result) {
      updated++;
    } else {
      skipped++;
    }
  }
  
  console.log(`\n✅ Complete!`);
  console.log(`   - Updated: ${updated} files`);
  console.log(`   - Skipped: ${skipped} files`);
  
  if (updated > 0) {
    console.log('\n📱 iOS Features Added:');
    console.log('   ✓ iOS app metadata (home screen icons)');
    console.log('   ✓ Touch gestures & haptic feedback');
    console.log('   ✓ Service Worker (offline support)');
    console.log('   ✓ Bottom navigation bar');
    console.log('   ✓ Safe area support (notched phones)');
    console.log('\n🎯 Next Steps:');
    console.log('   1. Test on iPhone: Add to home screen');
    console.log('   2. Verify offline mode works');
    console.log('   3. Check bottom navigation appears');
    console.log('   4. Commit changes to git');
  }
}

// Run
main();
