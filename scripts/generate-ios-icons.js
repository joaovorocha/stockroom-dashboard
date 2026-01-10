#!/usr/bin/env node

/**
 * Generate iOS App Icons
 * Creates all required icon sizes for PWA on iOS
 * 
 * Requires: npm install sharp
 * Run: node scripts/generate-ios-icons.js
 */

const fs = require('fs');
const path = require('path');

// Check if sharp is installed
let sharp;
try {
  sharp = require('sharp');
} catch (e) {
  console.error('ERROR: sharp module not found');
  console.error('Install it with: npm install sharp');
  process.exit(1);
}

// Icon sizes to generate
const ICON_SIZES = [
  // Standard icon sizes
  { size: 192, name: 'icon-192.png' },
  { size: 512, name: 'icon-512.png' },
  
  // iOS specific
  { size: 180, name: 'apple-touch-icon-180.png' },
  { size: 152, name: 'apple-touch-icon-152.png' },
  { size: 144, name: 'apple-touch-icon-144.png' },
  { size: 120, name: 'apple-touch-icon-120.png' },
  { size: 76, name: 'apple-touch-icon-76.png' },
  
  // Maskable icons (for adaptive icons)
  { size: 192, name: 'icon-maskable-192.png', maskable: true },
  { size: 512, name: 'icon-maskable-512.png', maskable: true },
  
  // Shortcut icons
  { size: 96, name: 'gameplan-96.png', shortcut: 'Game Plan' },
  { size: 96, name: 'shipments-96.png', shortcut: 'Shipments' },
  { size: 96, name: 'punch-96.png', shortcut: 'Lost Punch' },
  
  // Screenshot
  { width: 540, height: 720, name: 'screenshot-1.png' },
  
  // Favicon
  { size: 32, name: 'icon-32.png' },
];

const ICON_COLORS = {
  primary: '#1a5490',
  secondary: '#ff6b6b',
  background: '#ffffff',
  text: '#ffffff'
};

/**
 * Generate a simple square icon with gradient and text
 */
async function generateIcon(size, name, options = {}) {
  try {
    // Create SVG for icon
    const svg = generateIconSVG(size, name, options);
    
    // Convert SVG to PNG
    const outputPath = path.join(__dirname, '../public/icons', name);
    
    // Ensure directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    await sharp(Buffer.from(svg))
      .png()
      .resize(size || 192, size || 192, {
        fit: 'fill',
        background: ICON_COLORS.background
      })
      .toFile(outputPath);
    
    console.log(`✓ Generated ${name}`);
    return outputPath;
  } catch (err) {
    console.error(`✗ Failed to generate ${name}:`, err.message);
    return null;
  }
}

/**
 * Generate SVG icon
 */
function generateIconSVG(size, name, options = {}) {
  const iconSize = size || 192;
  
  // Determine icon type
  let initials = 'S';
  let color = ICON_COLORS.primary;
  
  if (options.shortcut) {
    if (options.shortcut === 'Game Plan') initials = 'GP';
    if (options.shortcut === 'Shipments') initials = 'SH';
    if (options.shortcut === 'Lost Punch') initials = 'LP';
  }
  
  // For screenshots
  if (options.screenshot) {
    return `
      <svg width="${size.width}" height="${size.height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#1a5490;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#0f3d6e;stop-opacity:1" />
          </linearGradient>
        </defs>
        <rect width="${size.width}" height="${size.height}" fill="url(#grad)"/>
        <text x="50%" y="50%" font-size="80" font-weight="bold" text-anchor="middle" dominant-baseline="middle" fill="white" font-family="system-ui, -apple-system">
          Stockroom
        </text>
        <text x="50%" y="60%" font-size="40" text-anchor="middle" fill="rgba(255,255,255,0.7)" font-family="system-ui, -apple-system">
          Daily Operations
        </text>
      </svg>
    `;
  }
  
  // Standard app icon with gradient and initials
  return `
    <svg width="${iconSize}" height="${iconSize}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${color};stop-opacity:1" />
          <stop offset="100%" style="stop-color:#0f3d6e;stop-opacity:1" />
        </linearGradient>
        <linearGradient id="grad2" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#667eea;stop-opacity:0.3" />
          <stop offset="100%" style="stop-color:#764ba2;stop-opacity:0.3" />
        </linearGradient>
      </defs>
      
      <!-- Background -->
      <rect width="${iconSize}" height="${iconSize}" rx="${iconSize * 0.25}" fill="url(#grad1)"/>
      
      <!-- Pattern -->
      <rect width="${iconSize}" height="${iconSize}" rx="${iconSize * 0.25}" fill="url(#grad2)"/>
      
      <!-- Circles for design -->
      <circle cx="${iconSize * 0.25}" cy="${iconSize * 0.25}" r="${iconSize * 0.08}" fill="rgba(255,255,255,0.2)"/>
      <circle cx="${iconSize * 0.75}" cy="${iconSize * 0.75}" r="${iconSize * 0.1}" fill="rgba(255,255,255,0.15)"/>
      
      <!-- Text -->
      <text 
        x="50%" 
        y="50%" 
        font-size="${iconSize * 0.4}" 
        font-weight="700" 
        text-anchor="middle" 
        dominant-baseline="middle" 
        fill="white"
        font-family="system-ui, -apple-system, sans-serif"
      >
        ${initials}
      </text>
    </svg>
  `;
}

/**
 * Main function
 */
async function main() {
  console.log('🎨 Generating iOS App Icons...\n');
  
  const total = ICON_SIZES.length;
  let generated = 0;
  
  for (const iconConfig of ICON_SIZES) {
    const result = await generateIcon(
      iconConfig.size,
      iconConfig.name,
      iconConfig
    );
    if (result) generated++;
  }
  
  console.log(`\n✅ Generated ${generated}/${total} icons`);
  
  if (generated === total) {
    console.log('\n📱 iOS App Icons ready!');
    console.log('   - Add to your home screen on iPhone');
    console.log('   - App will appear with proper icons');
    console.log('   - Supports all screen sizes');
  } else {
    console.log('\n⚠️  Some icons failed to generate');
    console.log('   Check that sharp is properly installed');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
