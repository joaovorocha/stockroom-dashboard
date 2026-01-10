#!/usr/bin/env node

/**
 * Add Bottom Navigation to Content Pages
 * Specifically targets pages with actual content (not redirects)
 */

const fs = require('fs');
const path = require('path');

// Content pages that need bottom navigation
const CONTENT_PAGES = [
  'gameplan-edit.html',
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
  'expenses.html',
  'admin.html',
  'app.html'
];

// Bottom navigation HTML
const BOTTOM_NAV = `
  <!-- Bottom Navigation (iOS-like Tab Bar) -->
  <nav class="bottom-nav">
    <a href="/home" class="nav-item">
      <div class="nav-item-icon">🏠</div>
      <div class="nav-item-label">Home</div>
    </a>
    <a href="/gameplan-edit.html" class="nav-item">
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
  </nav>
`;

function addBottomNav(filename) {
  const filePath = path.join(__dirname, '../public', filename);
  
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  Skipping ${filename} (not found)`);
    return false;
  }
  
  let html = fs.readFileSync(filePath, 'utf8');
  
  // Check if already has bottom nav
  if (html.includes('bottom-nav')) {
    console.log(`ℹ️  ${filename} already has bottom nav`);
    return false;
  }
  
  // Check if this is a redirect page (skip those)
  if (html.includes('window.location.replace') || html.includes('meta http-equiv="refresh"')) {
    console.log(`⏭️  ${filename} is a redirect page, skipping`);
    return false;
  }
  
  // Find the closing body tag and add nav before it
  if (html.includes('</body>')) {
    // Insert right before </body>
    html = html.replace('</body>', `${BOTTOM_NAV}\n</body>`);
    fs.writeFileSync(filePath, html, 'utf8');
    console.log(`✓ Added bottom nav to ${filename}`);
    return true;
  }
  
  console.log(`⚠️  Could not update ${filename} (no </body> tag)`);
  return false;
}

function main() {
  console.log('📱 Adding Bottom Navigation to Content Pages...\n');
  
  let added = 0;
  let skipped = 0;
  
  for (const page of CONTENT_PAGES) {
    const result = addBottomNav(page);
    if (result) {
      added++;
    } else {
      skipped++;
    }
  }
  
  console.log(`\n✅ Complete!`);
  console.log(`   - Added: ${added} pages`);
  console.log(`   - Skipped: ${skipped} pages`);
  
  if (added > 0) {
    console.log('\n🎯 Bottom navigation is now on all content pages!');
    console.log('   Test on iPhone to see native-like tab bar');
  }
}

main();
