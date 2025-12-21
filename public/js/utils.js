// Shared utility functions

/**
 * Extract and validate PSUS order number
 * Format: PSUS followed by exactly 8 digits
 * Ignores anything before PSUS and after the 8 digits
 */
function extractPSUSNumber(input) {
  if (!input) return null;

  // Convert to uppercase and remove whitespace
  const cleaned = input.toUpperCase().replace(/\s/g, '');

  // Find PSUS followed by digits
  const match = cleaned.match(/PSUS(\d{8})/);

  if (match) {
    return 'PSUS' + match[1]; // Return PSUS + 8 digits
  }

  // Also accept 8-digit order codes that start with 04........ (8 digits total)
  // Example: "04XXXXXX" -> "PSUS04XXXXXX"
  const match04 = cleaned.match(/^(04\d{6})/);
  if (match04) {
    return 'PSUS' + match04[1];
  }

  return null;
}

/**
 * Validate if string contains valid PSUS order number
 */
function isValidPSUSNumber(input) {
  return extractPSUSNumber(input) !== null;
}

/**
 * Generate MAO order status URL
 */
function getMAOOrderURL(psusNumber) {
  const cleanPSUS = extractPSUSNumber(psusNumber);
  if (!cleanPSUS) return null;

  return `https://ussbp.omni.manh.com/customerengagementfacade/app/orderstatus?orderId=${cleanPSUS}&selectedOrg=SUIT-US`;
}

/**
 * Get inventory URL
 */
function getInventoryURL() {
  return 'https://ussbp.omni.manh.com/om/dm-config/screen/storerfid/StoreUnitInventory';
}

/**
 * Copy text to clipboard
 */
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error('Failed to copy to clipboard:', err);
    return false;
  }
}

/**
 * Open URL in new tab
 */
function openInNewTab(url) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * Render quick navigation
 */
function renderQuickNav(activePage) {
  const pages = [
    { name: 'Home', url: '/' },
    { name: 'Game Plan', url: '/gameplan' },
    { name: 'Shipments', url: '/shipments' },
    { name: 'Scanner', url: '/scanner' },
    { name: 'Closing Duties', url: '/closing-duties' },
    { name: 'Lost Punch', url: '/lost-punch', external: false }
  ];

  let html = '<div class="quick-nav"><div class="container"><div class="quick-nav-links">';

  pages.forEach(page => {
    const activeClass = activePage === page.name ? 'active' : '';
    const target = page.external ? 'target="_blank"' : '';
    html += `<a href="${page.url}" class="${activeClass}" ${target}>${page.name}</a>`;
  });

  html += '</div></div></div>';
  return html;
}

/**
 * Add quick navigation to page
 */
function addQuickNav(activePage, position = 'top') {
  const nav = renderQuickNav(activePage);
  const navElement = document.createElement('div');
  navElement.innerHTML = nav;

  if (position === 'top') {
    document.body.insertBefore(navElement.firstChild, document.body.firstChild);
  } else {
    document.body.appendChild(navElement.firstChild);
  }
}
