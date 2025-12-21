// Popup script for SuitSupply Shipment Capture extension

const DASHBOARD_URL = 'https://ssussf.duckdns.org';
const API_URL = `${DASHBOARD_URL}/api/shipments/add`;

let extractedData = null;
let currentMode = 'tracking'; // 'tracking' | 'campusship'
let pendingShipments = [];
let activeShipmentId = null;

// Initialize popup
document.addEventListener('DOMContentLoaded', () => {
  init();
  setupEventListeners();
});

// Setup event listeners
function setupEventListeners() {
  document.getElementById('send-btn').addEventListener('click', sendToDashboard);
  document.getElementById('open-form-btn').addEventListener('click', openFormWithAutoFill);
  document.getElementById('refresh-btn').addEventListener('click', loadShipmentData);
  document.getElementById('refresh-empty-btn').addEventListener('click', loadShipmentData);
  document.getElementById('refresh-pending-btn')?.addEventListener('click', loadPendingShipments);
  document.getElementById('fill-btn')?.addEventListener('click', fillCampusShipForm);
  document.getElementById('shipment-select')?.addEventListener('change', () => {
    const selected = getSelectedPendingShipment();
    if (selected) displayPendingList(selected);
  });
}

async function init() {
  showLoading();
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tab?.url || '';
    if (url.includes('campusship.ups.com') && url.includes('/cship/create')) {
      currentMode = 'campusship';
      await loadPendingShipments();
      return;
    }
  } catch (_) {}

  currentMode = 'tracking';
  await loadShipmentData();
}

// Load shipment data from current page
async function loadShipmentData() {
  showLoading();

  try {
    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Check if we're on a UPS page
    if (!tab.url.includes('ups.com')) {
      showEmptyState('Please navigate to a UPS tracking page first.');
      return;
    }

    // Send message to content script to extract data
    chrome.tabs.sendMessage(tab.id, { action: 'extractData' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Error:', chrome.runtime.lastError);
        showEmptyState('Unable to extract data. Try refreshing the UPS page.');
        return;
      }

      if (response && response.success && response.data) {
        extractedData = response.data;
        displayData(extractedData);
      } else {
        showEmptyState('No shipment data found on this page.');
      }
    });

  } catch (error) {
    console.error('Error loading data:', error);
    showEmptyState('Error loading shipment data.');
  }
}

async function loadPendingShipments() {
  showLoading();
  try {
    const { pendingShipments: pending, activeShipment } = await chrome.storage.local.get(['pendingShipments', 'activeShipment']);
    pendingShipments = Array.isArray(pending) ? pending : [];
    activeShipmentId = activeShipment?.id || null;

    // If there is an active shipment (selected in dashboard), move it to the top.
    if (activeShipmentId) {
      pendingShipments = [
        activeShipment,
        ...pendingShipments.filter(s => s?.id && s.id !== activeShipmentId)
      ].filter(Boolean);
    }

    displayPendingList(getSelectedPendingShipment());
  } catch (e) {
    console.error(e);
    showEmptyState('Unable to load pending shipments. Open the dashboard once, then try again.');
  }
}

function getSelectedPendingShipment() {
  if (!pendingShipments.length) return null;
  const select = document.getElementById('shipment-select');
  const selectedId = select?.value;
  if (!selectedId) return pendingShipments[0];
  return pendingShipments.find(s => String(s.id) === String(selectedId)) || pendingShipments[0];
}

function formatShipmentAddress(shipment) {
  const addr = shipment?.address && typeof shipment.address === 'object' ? shipment.address : {};
  const line1 = addr.line1 || shipment?.addressLine1 || '';
  const line2 = addr.line2 || shipment?.addressLine2 || '';
  const city = addr.city || shipment?.city || '';
  const state = addr.state || shipment?.state || '';
  const zip = addr.zip || shipment?.zip || '';
  const country = addr.country || shipment?.country || '';
  const cityStateZip = [city, state, zip].filter(Boolean).join(' ');
  return [line1, line2, cityStateZip, country].filter(Boolean).join(', ');
}

function renderShipmentDetailsHtml(shipment) {
  const addr = shipment?.address && typeof shipment.address === 'object' ? shipment.address : {};
  const phone = addr.phone || shipment?.phone || '';
  const processedBy = shipment?.processedByName || '';
  const requestedBy = shipment?.employeeName || '';
  const orderNumber = shipment?.orderNumber || '';
  const serviceType = shipment?.serviceType || shipment?.service || '';

  const fields = [
    ['Shipment ID', shipment?.id || ''],
    ['Status', shipment?.status || ''],
    ['Customer', shipment?.customerName || ''],
    ['Order #', orderNumber],
    ['Service', serviceType],
    ['Carrier', shipment?.carrier || ''],
    ['Tracking #', shipment?.trackingNumber || ''],
    ['Email', shipment?.email || ''],
    ['Phone', phone],
    ['Address', formatShipmentAddress(shipment)],
    ['Requested By', requestedBy],
    ['Processed By', processedBy],
    ['Processed By ID', shipment?.processedById || ''],
    ['Notes', shipment?.notes || '']
  ];

  return fields
    .filter(([, v]) => (v || '').toString().trim().length > 0)
    .map(([k, v]) => `<div class="data-item"><strong>${escapeHtml(k)}:</strong> <span>${escapeHtml(String(v))}</span></div>`)
    .join('');
}

function displayPendingList(selectedShipment) {
  const preview = document.getElementById('data-preview');
  const dataSection = document.getElementById('data-section');
  const loading = document.getElementById('loading');
  const emptyState = document.getElementById('empty-state');
  const campusControls = document.getElementById('campusship-controls');
  const trackingControls = document.getElementById('tracking-controls');

  loading.classList.add('hidden');
  emptyState.classList.add('hidden');
  dataSection.classList.remove('hidden');

  campusControls.classList.remove('hidden');
  trackingControls.classList.add('hidden');

  if (!pendingShipments.length) {
    preview.innerHTML = `<div class="data-item" style="color:#666;">No pending shipments found. Open Stockroom Dashboard → Shipments/Processing, then come back.</div>`;
    const select = document.getElementById('shipment-select');
    if (select) select.innerHTML = '';
    return;
  }

  const selected = selectedShipment || pendingShipments[0];
  preview.innerHTML =
    `<div class="data-item"><strong>Mode:</strong> <span>UPS CampusShip Auto-Fill</span></div>` +
    `<div class="data-item"><strong>Tip:</strong> <span>Wait for the UPS page to finish loading, then click “Fill This UPS Form”.</span></div>` +
    `<div class="data-item"><strong>Will Fill:</strong> <span>Name, Phone, Email, Address, Weight=1, Service, Email Notify, Ref1=Order#, Ref2=Processor ID</span></div>` +
    `<div class="data-item"><strong>Note:</strong> <span>If the UPS address form is collapsed, the extension will open it automatically.</span></div>` +
    `<hr style="border:none;border-top:1px solid #e0e0e0;margin:10px 0;">` +
    (renderShipmentDetailsHtml(selected) || `<div class="data-item" style="color:#666;">No details found for selected shipment.</div>`);

  const select = document.getElementById('shipment-select');
  if (!select) return;
  select.innerHTML = pendingShipments.map((s, idx) => {
    const label = `${s.customerName || 'Unknown'}${s.orderNumber ? ` • ${s.orderNumber}` : ''}${s.id === activeShipmentId ? ' • ACTIVE' : ''}`;
    return `<option value="${escapeHtml(String(s.id || idx))}">${escapeHtml(label)}</option>`;
  }).join('');
  if (selected?.id) select.value = String(selected.id);
}

async function fillCampusShipForm() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const select = document.getElementById('shipment-select');
    if (!select) return;
    const selectedId = select.value;
    const shipment = pendingShipments.find(s => String(s.id) === String(selectedId)) || pendingShipments[0];
    if (!shipment) {
      showStatus('No shipment selected', 'error');
      return;
    }

    chrome.tabs.sendMessage(tab.id, { action: 'fillCampusShip', shipment }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('fillCampusShip sendMessage error:', chrome.runtime.lastError);
        showStatus('Unable to fill. Reload the UPS page and try again.', 'error');
        return;
      }
      const result = response?.result;
      if (response?.success && result?.ok) {
        const warnings = Array.isArray(result.warnings) && result.warnings.length ? ` Warnings: ${result.warnings.join(' | ')}` : '';
        const count = typeof result.filledCount === 'number' ? ` (${result.filledCount} fields)` : '';
        showStatus(`Filled${count}! Please verify the fields on UPS before clicking Next.${warnings}`, 'success');
      } else {
        const msg = result?.error || response?.error || 'Fill failed';
        showStatus(msg, 'error');
      }
    });
  } catch (e) {
    console.error(e);
    showStatus('Fill failed', 'error');
  }
}

// Display extracted data
function displayData(data) {
  const preview = document.getElementById('data-preview');
  const dataSection = document.getElementById('data-section');
  const loading = document.getElementById('loading');
  const emptyState = document.getElementById('empty-state');
  const campusControls = document.getElementById('campusship-controls');
  const trackingControls = document.getElementById('tracking-controls');

  // Hide loading and empty state
  loading.classList.add('hidden');
  emptyState.classList.add('hidden');

  // Show data section
  dataSection.classList.remove('hidden');
  campusControls.classList.add('hidden');
  trackingControls.classList.remove('hidden');

  // Build preview HTML
  let html = '';

  if (data.trackingNumber) {
    html += `<div class="data-item"><strong>Tracking #:</strong> <span>${data.trackingNumber}</span></div>`;
  }

  if (data.orderNumber) {
    html += `<div class="data-item"><strong>Order #:</strong> <span>${data.orderNumber}</span></div>`;
  }

  if (data.senderName) {
    html += `<div class="data-item"><strong>Sender:</strong> <span>${data.senderName}</span></div>`;
  }

  if (data.recipientName) {
    html += `<div class="data-item"><strong>Recipient:</strong> <span>${data.recipientName}</span></div>`;
  }

  if (data.serviceType) {
    html += `<div class="data-item"><strong>Service:</strong> <span>${data.serviceType}</span></div>`;
  }

  if (data.guaranteeDate) {
    html += `<div class="data-item"><strong>Guarantee Date:</strong> <span>${data.guaranteeDate}</span></div>`;
  }

  if (data.addressLine1) {
    html += `<div class="data-item"><strong>Address:</strong> <span>${data.addressLine1}</span></div>`;
  }

  if (data.addressLine2) {
    html += `<div class="data-item"><strong>Address 2:</strong> <span>${data.addressLine2}</span></div>`;
  }

  if (data.city || data.state || data.zip) {
    const cityStateZip = [data.city, data.state, data.zip].filter(Boolean).join(', ');
    html += `<div class="data-item"><strong>City/State/ZIP:</strong> <span>${cityStateZip}</span></div>`;
  }

  if (data.country) {
    html += `<div class="data-item"><strong>Country:</strong> <span>${data.country}</span></div>`;
  }

  if (data.status) {
    html += `<div class="data-item"><strong>Status:</strong> <span>${data.status}</span></div>`;
  }

  if (!html) {
    html = '<div class="data-item" style="color: #666;">Limited data extracted. You can still send to dashboard.</div>';
  }

  preview.innerHTML = html;

  // Enable/disable send button based on tracking number
  const sendBtn = document.getElementById('send-btn');
  if (!data.trackingNumber) {
    sendBtn.disabled = true;
    sendBtn.textContent = 'No Tracking Number Found';
  } else {
    sendBtn.disabled = false;
    sendBtn.textContent = 'Send to Stockroom Dashboard';
  }
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Send data to stockroom dashboard API
async function sendToDashboard() {
  if (!extractedData || !extractedData.trackingNumber) {
    showStatus('No tracking number to send', 'error');
    return;
  }

  const sendBtn = document.getElementById('send-btn');
  sendBtn.disabled = true;
  sendBtn.textContent = 'Sending...';

  try {
    // Build shipment data
    const shipmentData = {
      date: new Date().toISOString().split('T')[0],
      trackingNumber: extractedData.trackingNumber,
      recipient: extractedData.recipientName || 'Unknown',
      details: JSON.stringify({
        orderNumber: extractedData.orderNumber || '',
        trackingNumber: extractedData.trackingNumber,
        serviceType: extractedData.serviceType || '',
        guaranteeDate: extractedData.guaranteeDate || '',
        senderName: extractedData.senderName || '',
        phone: extractedData.phone || '',
        address: {
          line1: extractedData.addressLine1 || '',
          line2: extractedData.addressLine2 || '',
          city: extractedData.city || '',
          state: extractedData.state || '',
          zip: extractedData.zip || '',
          country: extractedData.country || 'United States'
        },
        fullAddress: [
          extractedData.addressLine1,
          extractedData.addressLine2,
          extractedData.city && extractedData.state && extractedData.zip
            ? `${extractedData.city}, ${extractedData.state} ${extractedData.zip}`
            : null,
          extractedData.country
        ].filter(Boolean).join(', '),
        status: extractedData.status || '',
        source: 'chrome-extension',
        notes: 'Auto-captured from UPS'
      })
    };

    // Send to API
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(shipmentData)
    });

    const result = await response.json();

    if (response.ok && result.success) {
      showStatus('Shipment sent to dashboard successfully!', 'success');
      sendBtn.textContent = '✓ Sent Successfully';
    } else {
      throw new Error(result.error || 'Failed to send shipment');
    }

  } catch (error) {
    console.error('Error sending data:', error);
    showStatus(`Error: ${error.message}`, 'error');
    sendBtn.disabled = false;
    sendBtn.textContent = 'Send to Stockroom Dashboard';
  }
}

// Open dashboard form and auto-fill with extracted data
async function openFormWithAutoFill() {
  if (!extractedData) {
    showStatus('No data to auto-fill', 'error');
    return;
  }

  try {
    // Store data in chrome.storage for the dashboard to access
    await chrome.storage.local.set({ autoFillData: extractedData });

    // Open dashboard shipments page
    chrome.tabs.create({ url: `${DASHBOARD_URL}/shipments` });

    // Show success message
    showStatus('Opening dashboard... Data will auto-fill!', 'success');

    // Close popup after a delay
    setTimeout(() => {
      window.close();
    }, 1500);

  } catch (error) {
    console.error('Error opening form:', error);
    showStatus('Error opening dashboard', 'error');
  }
}

// Show loading state
function showLoading() {
  document.getElementById('loading').classList.remove('hidden');
  document.getElementById('data-section').classList.add('hidden');
  document.getElementById('empty-state').classList.add('hidden');
  document.getElementById('status-message').classList.add('hidden');
}

// Show empty state
function showEmptyState(message) {
  const emptyState = document.getElementById('empty-state');
  const loading = document.getElementById('loading');
  const dataSection = document.getElementById('data-section');

  loading.classList.add('hidden');
  dataSection.classList.add('hidden');
  emptyState.classList.remove('hidden');

  // Update message if provided
  if (message) {
    const p = emptyState.querySelector('p:first-of-type');
    if (p) p.innerHTML = `<strong>${message}</strong>`;
  }
}

// Show status message
function showStatus(message, type) {
  const statusEl = document.getElementById('status-message');
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
  statusEl.classList.remove('hidden');

  // Auto-hide after 5 seconds
  setTimeout(() => {
    statusEl.classList.add('hidden');
  }, 5000);
}
