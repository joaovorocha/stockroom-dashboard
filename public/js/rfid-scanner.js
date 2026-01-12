/**
 * RFID Scanner UI
 * Real-time RFID tag reading interface
 */

let currentSessionId = null;
let scannedTags = [];
let eventSource = null;
let scanStartTime = null;
const DEFAULT_READER_ID = 'rfd40-01'; // Update with your scanner ID

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  setupEventStream();
  loadStats();
});

// ============================================================================
// SCANNING CONTROLS
// ============================================================================

async function startScanning() {
  try {
    const response = await fetch('/api/rfid/scan/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        readerId: DEFAULT_READER_ID,
        options: { mode: 'continuous' }
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      currentSessionId = data.sessionId;
      scanStartTime = Date.now();
      updateUI('scanning');
      showSuccess('Scanning started');
    } else {
      showError('Failed to start scanning');
    }
  } catch (error) {
    console.error('Start scan error:', error);
    showError('Failed to start scanning');
  }
}

async function stopScanning() {
  if (!currentSessionId) return;
  
  try {
    const response = await fetch('/api/rfid/scan/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: currentSessionId })
    });
    
    const data = await response.json();
    
    if (data.success) {
      currentSessionId = null;
      scanStartTime = null;
      updateUI('idle');
      showSuccess(`Scan complete: ${data.session.tagsScanned} tags`);
    }
  } catch (error) {
    console.error('Stop scan error:', error);
    showError('Failed to stop scanning');
  }
}

async function performInventory() {
  try {
    updateUI('scanning');
    const btn = event.target;
    btn.disabled = true;
    btn.textContent = '⏳ Scanning...';
    
    const response = await fetch('/api/rfid/scan/inventory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        readerId: DEFAULT_READER_ID,
        options: { duration: 10000 }
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      showSuccess(`Inventory scan complete: ${data.count} tags found`);
      // Display results
      data.tags.forEach(tag => {
        addTagToList({
          readerId: DEFAULT_READER_ID,
          tag,
          timestamp: new Date()
        });
      });
    } else {
      showError('Inventory scan failed');
    }
  } catch (error) {
    console.error('Inventory scan error:', error);
    showError('Inventory scan failed');
  } finally {
    updateUI('idle');
    event.target.disabled = false;
    event.target.textContent = '📦 Inventory Scan (10s)';
  }
}

// ============================================================================
// REAL-TIME EVENT STREAM
// ============================================================================

function setupEventStream() {
  if (eventSource) {
    eventSource.close();
  }
  
  eventSource = new EventSource('/api/rfid/events');
  
  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleRFIDEvent(data);
    } catch (error) {
      console.error('Event parse error:', error);
    }
  };
  
  eventSource.onerror = (error) => {
    console.error('EventSource error:', error);
    // Auto-reconnect
    setTimeout(() => {
      setupEventStream();
    }, 5000);
  };
}

function handleRFIDEvent(data) {
  switch (data.type) {
    case 'tag_read':
      addTagToList(data);
      updateStats();
      break;
    
    case 'scan_started':
      updateUI('scanning');
      break;
    
    case 'scan_stopped':
      updateUI('idle');
      break;
    
    case 'reader_connected':
      showSuccess(`Reader ${data.readerId} connected`);
      break;
  }
}

// ============================================================================
// UI UPDATES
// ============================================================================

function addTagToList(data) {
  const container = document.getElementById('tags-container');
  
  // Remove empty state
  const emptyState = container.querySelector('.empty-state');
  if (emptyState) {
    emptyState.remove();
  }
  
  // Check for duplicate (show only if not recently shown)
  const existingTag = scannedTags.find(t => t.tag.epc === data.tag.epc);
  if (existingTag && (Date.now() - existingTag.timestamp < 5000)) {
    return; // Skip duplicate within 5 seconds
  }
  
  scannedTags.unshift(data);
  
  const tagElement = document.createElement('div');
  tagElement.className = 'tag-item';
  tagElement.innerHTML = `
    <div class="tag-epc">${data.tag.epc || 'Unknown Tag'}</div>
    <div class="tag-details">
      ${data.tag.sku ? `SKU: ${data.tag.sku}` : 'SKU: Unmapped'}
      ${data.tag.format ? ` | Format: ${data.tag.format}` : ''}
      ${data.rssi ? ` | RSSI: ${data.rssi} dBm` : ''}
    </div>
    <div class="tag-timestamp">${new Date(data.timestamp).toLocaleTimeString()}</div>
  `;
  
  container.insertBefore(tagElement, container.firstChild);
  
  // Keep only last 50 tags in UI
  while (container.children.length > 50) {
    container.removeChild(container.lastChild);
  }
}

function updateStats() {
  const totalTags = scannedTags.length;
  const uniqueItems = new Set(scannedTags.map(t => t.tag.epc)).size;
  
  // Calculate scan rate (tags per minute)
  let scanRate = 0;
  if (scanStartTime) {
    const duration = (Date.now() - scanStartTime) / 1000 / 60; // minutes
    scanRate = duration > 0 ? Math.round(totalTags / duration) : 0;
  }
  
  document.getElementById('total-tags').textContent = totalTags;
  document.getElementById('scan-rate').textContent = scanRate;
  document.getElementById('unique-items').textContent = uniqueItems;
}

async function loadStats() {
  try {
    const response = await fetch('/api/rfid/stats');
    const stats = await response.json();
  } catch (error) {
    console.error('Failed to load stats:', error);
  }
}

function updateUI(state) {
  const banner = document.getElementById('status-banner');
  const startBtn = document.getElementById('start-scan-btn');
  const stopBtn = document.getElementById('stop-scan-btn');
  
  if (state === 'scanning') {
    banner.textContent = '🔴 Scanning Active';
    banner.className = 'status-banner status-scanning';
    startBtn.disabled = true;
    stopBtn.disabled = false;
  } else {
    banner.textContent = 'Scanner Ready';
    banner.className = 'status-banner status-idle';
    startBtn.disabled = false;
    stopBtn.disabled = true;
  }
}

// ============================================================================
// UTILITIES
// ============================================================================

function showSuccess(message) {
  // You can add a toast notification here
}

function showError(message) {
  console.error('❌', message);
  alert(message);
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (eventSource) {
    eventSource.close();
  }
  if (currentSessionId) {
    stopScanning();
  }
});
