// Popup script for SuitSupply Shipment Capture extension

const DASHBOARD_URL = 'https://192.168.12.103:3000';
const API_URL = `${DASHBOARD_URL}/api/shipments/add`;

let extractedData = null;

// Initialize popup
document.addEventListener('DOMContentLoaded', () => {
  loadShipmentData();
  setupEventListeners();
});

// Setup event listeners
function setupEventListeners() {
  document.getElementById('send-btn').addEventListener('click', sendToDashboard);
  document.getElementById('open-form-btn').addEventListener('click', openFormWithAutoFill);
  document.getElementById('refresh-btn').addEventListener('click', loadShipmentData);
  document.getElementById('refresh-empty-btn').addEventListener('click', loadShipmentData);
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

// Display extracted data
function displayData(data) {
  const preview = document.getElementById('data-preview');
  const dataSection = document.getElementById('data-section');
  const loading = document.getElementById('loading');
  const emptyState = document.getElementById('empty-state');

  // Hide loading and empty state
  loading.classList.add('hidden');
  emptyState.classList.add('hidden');

  // Show data section
  dataSection.classList.remove('hidden');

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
