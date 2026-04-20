# 🚀 Smart Network Optimization

## Overview
Automatic network detection that redirects WiFi users to fast local IP while remote users stay on Tailscale.

## How It Works

### Network Detection
- **JavaScript**: `/public/js/network-detect.js`
- **Runs on page load** for all gameplan and admin pages
- **Tests connectivity** to local IP `10.201.48.17` 
- **Auto-redirects** WiFi users to local network

### Network Paths

#### 📱 On Store WiFi (10.201.48.x network)
- **URL**: `http://10.201.48.17/`
- **Speed**: Full LAN speed (gigabit+)
- **Detects**: Tries to fetch `http://10.201.48.17/favicon.ico`
- **Result**: Instant redirect to local IP

#### 🌐 Remote Access  
- **URL**: `https://suitserver.tail39e95f.ts.net/`
- **Speed**: Tailscale (limited to ~10 Mbps)
- **Detects**: Cannot reach local IP (timeout after 2s)
- **Result**: Stays on Tailscale

## Configuration

**Local Network**: `10.201.48.x/24`  
**Server Local IP**: `10.201.48.17`  
**Tailscale Host**: `suitserver.tail39e95f.ts.net`

Edit `/public/js/network-detect.js` to change these values.

## Testing

Visit: `https://suitserver.tail39e95f.ts.net/network-test.html`

**Expected results:**
- On WiFi: Redirects to `http://10.201.48.17/network-test.html`
- Remote: Shows "Remote Access - Using Tailscale"

**Check browser console** for debug messages:
- `🔍 Checking network location...`
- `🚀 Local network detected - redirecting to fast local IP`
- `🌐 Remote access detected - using Tailscale`

## Benefits

✅ **WiFi users**: Full LAN speed (1000+ Mbps)  
✅ **Remote users**: Seamless Tailscale access (10 Mbps)  
✅ **Automatic**: Zero configuration needed  
✅ **No router changes**: Works with existing setup  

## Deployment

All gameplan and admin pages have the script automatically loaded:
- `gameplan-sa.html`
- `gameplan-boh.html`
- `gameplan-tailors.html`
- `gameplan-calendar.html`
- `gameplan-edit.html`
- `gameplan-management.html`
- `admin.html`

## Troubleshooting

**Not redirecting on WiFi?**
1. Check browser console for errors
2. Verify you're on `10.201.48.x` network
3. Test local IP: `curl http://10.201.48.17/`
4. Clear session storage and refresh

**Stuck in redirect loop?**
1. Open browser console
2. Run: `sessionStorage.clear()`
3. Refresh page

**Want to force Tailscale even on WiFi?**
1. Open browser console  
2. Run: `sessionStorage.setItem('network-check-done', 'true')`
3. Refresh page
