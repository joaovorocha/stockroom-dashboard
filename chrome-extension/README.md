# SuitSupply Shipment Capture - Chrome Extension

Chrome extension that automatically captures shipment data from UPS tracking pages and sends it to the Stockroom Dashboard.

## Features

- **Auto-extract data** from UPS tracking pages
- **Two modes of operation:**
  1. **Send directly** to dashboard API (adds shipment to database)
  2. **Open form & auto-fill** (opens dashboard and populates request form)
- **Smart data extraction** for tracking numbers, addresses, and recipient info
- **Works on all UPS tracking pages**

## Installation

### 1. Create Extension Icons

You need to create 3 PNG icon files in the `icons/` folder:

- `icon16.png` (16x16 pixels)
- `icon48.png` (48x48 pixels)
- `icon128.png` (128x128 pixels)

**Quick way:** Use an online tool like [favicon.io](https://favicon.io) or Photoshop to create simple icons with the SuitSupply logo or a box/package icon.

**Temporary solution:** You can temporarily use any PNG images renamed to these filenames just to get the extension working.

### 2. Load Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **Load unpacked**
4. Select the `chrome-extension` folder: `/Users/victor/stockroom-dashboard/chrome-extension`
5. The extension should now appear in your extensions list

### 3. Pin the Extension (Optional)

1. Click the puzzle piece icon in Chrome toolbar
2. Find "SuitSupply Shipment Capture"
3. Click the pin icon to keep it visible

## Usage

### Method 1: Send Directly to Dashboard

1. Navigate to any UPS tracking page (e.g., `https://www.ups.com/track?...`)
2. Click the extension icon in Chrome toolbar
3. Review the extracted shipment data
4. Click **"Send to Stockroom Dashboard"**
5. Data is added to shipments database automatically

### Method 2: Open Form & Auto-Fill

1. Navigate to any UPS tracking page
2. Click the extension icon
3. Review the extracted data
4. Click **"Open Form & Auto-Fill"**
5. Dashboard opens in a new tab
6. Request Shipment form auto-opens with data pre-filled
7. Fill in remaining required fields (Order Number, Reason, etc.)
8. Submit the form

## How It Works

### Content Script (content.js)
- Runs automatically on UPS pages
- Extracts tracking numbers, addresses, and recipient info
- Uses multiple selectors to handle different UPS page layouts
- Stores data in Chrome storage

### Popup (popup.html + popup.js)
- Shows extracted data when you click the extension icon
- Two options:
  - **Send directly**: POST data to `/api/shipments/add`
  - **Auto-fill**: Opens dashboard and passes data via chrome.storage

### Dashboard Integration (shipments.js)
- Checks for `autoFillData` in chrome.storage on page load
- Auto-opens the request form if data is found
- Populates all matching form fields
- Adds a note indicating data was auto-filled

## Troubleshooting

### Extension doesn't appear after loading
- Make sure you have icon files in the `icons/` folder
- Check Chrome Extensions page for error messages
- Try reloading the extension

### No data extracted from UPS page
- Make sure you're on a UPS tracking page with shipment details
- Try clicking "Refresh Data" button in the popup
- Check browser console for errors (F12 → Console tab)

### "Send to Dashboard" fails
- Make sure the stockroom dashboard server is running at `https://ssussf.duckdns.org` (or the local network URL if you're on-site)
- Open dashboard manually first to ensure the site loads and you're logged in

### Auto-fill doesn't work
- Make sure you're allowing chrome.storage permission
- Check that you clicked "Open Form & Auto-Fill" (not just opening dashboard manually)
- Data is cleared after one use, so you need to re-extract if you refresh the page

## Development

### Testing Changes

After modifying extension files:

1. Go to `chrome://extensions/`
2. Find "SuitSupply Shipment Capture"
3. Click the refresh icon (↻)
4. Test on a UPS page

### Debugging

- **Content script**: Open UPS page → F12 → Console tab
- **Popup**: Right-click extension icon → Inspect popup
- **Background**: Go to chrome://extensions → Click "Inspect views: background page"

## File Structure

```
chrome-extension/
├── manifest.json         # Extension configuration
├── content.js           # Runs on UPS pages, extracts data
├── popup.html           # Extension popup interface
├── popup.js             # Popup logic
├── icons/
│   ├── icon16.png       # 16x16 toolbar icon
│   ├── icon48.png       # 48x48 extension management icon
│   └── icon128.png      # 128x128 Chrome Web Store icon
└── README.md            # This file
```

## Future Enhancements

- [ ] Support for other shipping carriers (FedEx, USPS)
- [ ] Batch capture multiple tracking numbers
- [ ] History of captured shipments in extension
- [ ] Auto-detect and suggest PSUS order numbers
- [ ] Export captured data as CSV

## Support

For issues or questions, contact the San Francisco Stockroom team.
