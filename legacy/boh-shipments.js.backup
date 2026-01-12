// BOH Shipments Workflow Logic
// See docs/BOH_SHIPMENTS_UI_PLAN.md for full implementation plan

// State Management
let allShipments = [];
let currentUser = null;
let selectedShipment = null;
let sseConnection = null;

// Core Functions
async function loadShipments() {
  // GET /api/shipments?status=REQUESTED,PICKING,READY_TO_PACK,PACKING
  try {
    const resp = await fetch('/api/shipments?status=REQUESTED,PICKING,READY_TO_PACK,PACKING', { credentials: 'include' });
    if (!resp.ok) throw new Error('Failed to load shipments');
    const data = await resp.json();
    allShipments = data.shipments || [];
    renderSummaryCards(allShipments);
    renderShipmentList(allShipments);
  } catch (e) {
    allShipments = [];
    renderSummaryCards([]);
    renderShipmentList([]);
  }
}

async function loadShipmentDetail(shipmentId) {
  try {
    const resp = await fetch(`/api/shipments/${shipmentId}`, { credentials: 'include' });
    if (!resp.ok) throw new Error('Failed to load shipment detail');
    const data = await resp.json();
    selectedShipment = { ...data.shipment, items: data.items, scans: data.scans };
    renderShipmentDetail(selectedShipment);
  } catch (e) {
    selectedShipment = null;
    renderShipmentDetail(null);
  }
}

async function updateShipmentStatus(shipmentId, newStatus) {
  try {
    await fetch(`/api/shipments/${shipmentId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ status: newStatus, employeeId: currentUser?.id })
    });
    await loadShipments();
    if (selectedShipment?.id === shipmentId) await loadShipmentDetail(shipmentId);
  } catch (e) {
    // handle error
  }
}

async function assignPicker(shipmentId, pickerId) {
  try {
    await fetch(`/api/shipments/${shipmentId}/assign-picker`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ assignedPickerId: pickerId })
    });
    await loadShipments();
    if (selectedShipment?.id === shipmentId) await loadShipmentDetail(shipmentId);
  } catch (e) {}
}

async function recordItemPick(shipmentId, itemId) {
  try {
    await fetch(`/api/shipments/${shipmentId}/items/${itemId}/pick`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ pickedById: currentUser?.id })
    });
    if (selectedShipment?.id === shipmentId) await loadShipmentDetail(shipmentId);
  } catch (e) {}
}

async function scanItem(shipmentId, sgtin, scanType) {
  try {
    await fetch(`/api/shipments/${shipmentId}/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ sgtin, scanType, scannedById: currentUser?.id })
    });
    if (selectedShipment?.id === shipmentId) await loadShipmentDetail(shipmentId);
  } catch (e) {}
}

async function generateLabel(shipmentId) {
  try {
    const resp = await fetch(`/api/shipments/${shipmentId}/generate-label`, {
      method: 'POST',
      credentials: 'include'
    });
    if (!resp.ok) throw new Error('Label generation failed');
    const data = await resp.json();
    // Show label file path or download link in modal
    // Optionally auto-refresh shipment detail
    await loadShipmentDetail(shipmentId);
  } catch (e) {}
}

// UI Rendering
function renderSummaryCards(shipments) {
  // Count by status/priority
  const pending = shipments.filter(s => s.status === 'REQUESTED').length;
  const picking = shipments.filter(s => s.status === 'PICKING').length;
  const ready = shipments.filter(s => s.status === 'READY_TO_PACK').length;
  const urgent = shipments.filter(s => s.priority === 2).length;
  document.getElementById('summaryPending').innerHTML = `<div><b>${pending}</b><br>Pending</div>`;
  document.getElementById('summaryPicking').innerHTML = `<div><b>${picking}</b><br>Picking</div>`;
  document.getElementById('summaryReadyToPack').innerHTML = `<div><b>${ready}</b><br>Ready to Pack</div>`;
  document.getElementById('summaryUrgent').innerHTML = `<div><b>${urgent}</b><br>Rush</div>`;
}

function renderShipmentList(shipments) {
  const list = document.getElementById('shipmentList');
  const empty = document.getElementById('emptyState');
  const filtered = applyFilters(shipments);
  if (!filtered.length) {
    list.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  list.innerHTML = filtered.map(renderShipmentCard).join('');
  // Add event listeners for card actions
  document.querySelectorAll('.view-detail-btn').forEach(btn => {
    btn.onclick = () => openShipmentDetail(btn.dataset.shipmentId);
  });
}

function renderShipmentCard(s) {
  const statusClass = `status-${s.status}`;
  return `<div class="shipment-card" data-priority="${s.priority || 0}">
    <div style="display:flex; justify-content:space-between; align-items:center;">
      <div><b>${s.shipment_number}</b></div>
      <span class="status-badge ${statusClass}">${s.status}</span>
    </div>
    <div>Customer: ${s.customer_name || '—'}</div>
    <div>Order: ${s.order_number || '—'}</div>
    <div>Items: ${s.items_picked || 0}/${s.total_items || 0} picked | ${s.items_scanned || 0}/${s.total_items || 0} scanned</div>
    <div>Requested: ${formatRelativeTime(s.requested_at)} by ${s.requested_by_name || '—'}</div>
    <div class="card-actions">
      <button class="btn btn-primary view-detail-btn" data-shipment-id="${s.id}">View Details</button>
    </div>
  </div>`;
}

function renderShipmentDetail(shipment) {
  const modal = document.getElementById('shipmentDetailModal');
  const body = document.getElementById('modalShipmentBody');
  const actionBtn = document.getElementById('modalActionBtn');
  const titleEl = document.getElementById('modalShipmentNumber');
  
  if (!shipment) {
    body.innerHTML = '<div class="empty-state">Unable to load shipment details.</div>';
    actionBtn.style.display = 'none';
    modal.classList.add('active');
    return;
  }
  
  titleEl.textContent = shipment.shipment_number || 'Shipment Details';
  
  // Render shipment details
  const items = shipment.items || [];
  const itemsHtml = items.length ? items.map(item => `
    <li style="display:flex; gap:8px; align-items:center; margin:4px 0;">
      <input type="checkbox" ${item.picked ? 'checked' : ''} ${item.picked ? 'disabled' : ''} 
        onchange="handleItemPick(${shipment.id}, ${item.id}, this.checked)">
      <span>${item.description || item.item_number}</span>
      ${item.picked ? '<span style="color:green;">✅ Picked</span>' : ''}
      ${item.rfid_scanned ? '<span style="color:blue;">📡 Scanned</span>' : ''}
    </li>
  `).join('') : '<li>No items</li>';
  
  body.innerHTML = `
    <div style="margin-bottom:16px;">
      <span class="status-badge status-${shipment.status}">${shipment.status}</span>
      ${shipment.priority === 2 ? '<span style="color:#f44336; font-weight:bold; margin-left:8px;">🔴 RUSH</span>' : ''}
      ${shipment.priority === 1 ? '<span style="color:#ff9800; font-weight:bold; margin-left:8px;">⚠️ URGENT</span>' : ''}
    </div>
    <div><b>Customer:</b> ${shipment.customer_name || '—'}</div>
    <div><b>Email:</b> ${shipment.customer_email || '—'}</div>
    <div><b>Phone:</b> ${shipment.customer_phone || '—'}</div>
    <div><b>Order:</b> ${shipment.order_number || '—'}</div>
    <div style="margin-top:12px;"><b>Shipping Address:</b></div>
    <div style="margin-left:16px;">
      ${shipment.address_line1 || '—'}<br>
      ${shipment.address_line2 ? shipment.address_line2 + '<br>' : ''}
      ${shipment.address_city || ''}, ${shipment.address_state || ''} ${shipment.address_zip || ''}<br>
      ${shipment.address_country || 'US'}
    </div>
    <div style="margin-top:12px;"><b>Items (${items.length}):</b></div>
    <ul style="list-style:none; padding:0;">${itemsHtml}</ul>
    ${shipment.tracking_number ? `<div style="margin-top:12px;"><b>Tracking:</b> ${shipment.tracking_number}</div>` : ''}
    ${shipment.notes ? `<div style="margin-top:12px;"><b>Notes:</b> ${shipment.notes}</div>` : ''}
  `;
  
  // Show appropriate action button based on status
  actionBtn.style.display = 'inline-block';
  if (shipment.status === 'REQUESTED') {
    actionBtn.textContent = 'Assign to Me & Start Picking';
    actionBtn.onclick = () => handleAssignAndPick(shipment.id);
  } else if (shipment.status === 'PICKING') {
    actionBtn.textContent = 'Open Scan Mode';
    actionBtn.onclick = () => openScanModal(shipment.id);
  } else if (shipment.status === 'READY_TO_PACK') {
    actionBtn.textContent = 'Start Packing';
    actionBtn.onclick = () => handleStartPacking(shipment.id);
  } else if (shipment.status === 'PACKING') {
    const allScanned = items.every(i => i.rfid_scanned);
    actionBtn.textContent = allScanned ? 'Generate Label' : 'Scan Items First';
    actionBtn.disabled = !allScanned;
    actionBtn.onclick = allScanned ? () => handleGenerateLabel(shipment.id) : null;
  } else if (shipment.status === 'LABEL_CREATED') {
    actionBtn.textContent = 'Mark as Shipped';
    actionBtn.onclick = () => handleMarkShipped(shipment.id);
  } else {
    actionBtn.style.display = 'none';
  }
  
  modal.classList.add('active');
}

function openShipmentDetail(shipmentId) {
  loadShipmentDetail(shipmentId);
}

function closeShipmentDetail() {
  document.getElementById('shipmentDetailModal').classList.remove('active');
}

document.getElementById('closeDetailModal').onclick = closeShipmentDetail;
document.getElementById('closeDetailBtn').onclick = closeShipmentDetail;

document.getElementById('closeScanModal').onclick = function() {
  document.getElementById('scanModal').classList.remove('active');
};

// Workflow action handlers
async function handleItemPick(shipmentId, itemId, isPicked) {
  if (isPicked) {
    await recordItemPick(shipmentId, itemId);
    await loadShipmentDetail(shipmentId);
    await loadShipments();
  }
}

async function handleAssignAndPick(shipmentId) {
  if (!currentUser?.id) return;
  await assignPicker(shipmentId, currentUser.id);
  await loadShipmentDetail(shipmentId);
  await loadShipments();
}

async function handleStartPacking(shipmentId) {
  await updateShipmentStatus(shipmentId, 'PACKING');
  await loadShipmentDetail(shipmentId);
  await loadShipments();
}

async function handleGenerateLabel(shipmentId) {
  try {
    await generateLabel(shipmentId);
    await loadShipmentDetail(shipmentId);
    await loadShipments();
    alert('Label generated successfully!');
  } catch (e) {
    alert('Failed to generate label: ' + e.message);
  }
}

async function handleMarkShipped(shipmentId) {
  await updateShipmentStatus(shipmentId, 'IN_TRANSIT');
  closeShipmentDetail();
  await loadShipments();
}

function openScanModal(shipmentId) {
  const modal = document.getElementById('scanModal');
  const body = document.getElementById('scanModalBody');
  const shipment = allShipments.find(s => s.id === shipmentId) || selectedShipment;
  
  body.innerHTML = `
    <div><b>${shipment?.shipment_number || 'Shipment'}</b></div>
    <div style="margin:12px 0;">
      <label><b>Scan RFID Tag:</b></label>
      <input type="text" id="rfidInput" placeholder="Scan or enter SGTIN..." 
        style="width:100%; padding:10px; margin-top:4px; border:1px solid var(--border); border-radius:6px;">
    </div>
    <div style="margin-top:12px;">
      <button class="btn btn-primary" onclick="handleScanSubmit(${shipmentId})">Submit Scan</button>
      <button class="btn btn-secondary" onclick="document.getElementById('scanModal').classList.remove('active')">Cancel</button>
    </div>
    <div id="scanResults" style="margin-top:16px;"></div>
  `;
  
  modal.classList.add('active');
  setTimeout(() => document.getElementById('rfidInput')?.focus(), 100);
}

async function handleScanSubmit(shipmentId) {
  const input = document.getElementById('rfidInput');
  const sgtin = input?.value?.trim();
  if (!sgtin) return;
  
  try {
    await scanItem(shipmentId, sgtin, 'PACK');
    const results = document.getElementById('scanResults');
    if (results) results.innerHTML = `<div style="color:green;">✅ Scanned: ${sgtin}</div>`;
    input.value = '';
    input.focus();
    await loadShipmentDetail(shipmentId);
  } catch (e) {
    const results = document.getElementById('scanResults');
    if (results) results.innerHTML = `<div style="color:red;">❌ Error: ${e.message}</div>`;
  }
}

function formatRelativeTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  return d.toLocaleDateString();
}

function applyFilters(shipments) {
  const q = (document.getElementById('searchInput').value || '').toLowerCase();
  const status = document.getElementById('statusFilter').value;
  const priority = document.getElementById('priorityFilter').value;
  return (shipments || []).filter(s => {
    if (status && s.status !== status) return false;
    if (priority && String(s.priority) !== priority) return false;
    if (q) {
      const haystack = [s.shipment_number, s.customer_name, s.order_number, s.requested_by_name].join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

document.getElementById('searchInput').addEventListener('input', () => renderShipmentList(allShipments));
document.getElementById('statusFilter').addEventListener('change', () => renderShipmentList(allShipments));
document.getElementById('priorityFilter').addEventListener('change', () => renderShipmentList(allShipments));

// Real-time Updates (SSE)
function setupSSE() {
  if (sseConnection) {
    sseConnection.close();
  }
  
  sseConnection = new EventSource('/api/sse/updates');
  
  sseConnection.onopen = () => {
    console.log('✅ Real-time updates connected');
  };
  
  sseConnection.onmessage = (event) => {
    try {
      const update = JSON.parse(event.data);
      handleSSEUpdate(update);
    } catch (e) {
      console.error('SSE parse error:', e);
    }
  };
  
  sseConnection.onerror = (error) => {
    console.error('❌ SSE connection error:', error);
    // Auto-reconnect after 5 seconds
    setTimeout(() => {
      if (document.visibilityState === 'visible') {
        setupSSE();
      }
    }, 5000);
  };
}

function handleSSEUpdate(update) {
  switch (update.type) {
    case 'connected':
      console.log('SSE:', update.message);
      break;
      
    case 'heartbeat':
      // Keep-alive, no action needed
      break;
      
    case 'shipment_updated':
      // Reload shipments list
      loadShipments();
      
      // If viewing this shipment, refresh detail
      if (selectedShipment?.id === update.data?.shipmentId) {
        loadShipmentDetail(update.data.shipmentId);
      }
      
      // Show notification
      if (update.data?.updatedBy !== currentUser?.name) {
        showNotification(
          `${update.data?.shipmentNumber || 'Shipment'} updated by ${update.data?.updatedBy}`,
          update.data?.message
        );
      }
      break;
      
    case 'shipment_item_picked':
      // Reload if viewing this shipment
      if (selectedShipment?.id === update.data?.shipmentId) {
        loadShipmentDetail(update.data.shipmentId);
      }
      
      // Show progress notification
      if (update.data?.updatedBy !== currentUser?.name) {
        showNotification(
          `${update.data?.shipmentNumber || 'Shipment'}: Item picked`,
          `${update.data?.pickedCount}/${update.data?.totalItems} items picked`
        );
      }
      break;
      
    default:
      console.log('Unknown SSE update:', update.type);
  }
}

function showNotification(title, message) {
  // Simple notification (can be enhanced with a proper notification UI)
  console.log(`🔔 ${title}${message ? ': ' + message : ''}`);
  
  // Optional: Use browser notifications if permitted
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body: message || '', icon: '/icons/icon-192.png' });
  }
}

// Stop SSE when page hidden, resume when visible
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (sseConnection) {
      sseConnection.close();
      sseConnection = null;
    }
  } else {
    setupSSE();
    loadShipments(); // Refresh on return
  }
});

// Init
async function initPage() {
  // Load user (from shared header)
  if (window.SharedHeader && typeof SharedHeader.init === 'function') {
    await SharedHeader.init();
    currentUser = SharedHeader.currentUser;
  }
  await loadShipments();
  
  // Setup real-time updates
  setupSSE();
  
  // Request notification permission
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}
document.addEventListener('DOMContentLoaded', initPage);
