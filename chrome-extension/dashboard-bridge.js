// Dashboard bridge content script
// Runs on the Stockroom Dashboard domain to:
// - signal "installed" to the website
// - sync pending shipments into chrome.storage
// - accept "active shipment" from the processing page (Ship at UPS)
// - apply tracking updates captured on UPS pages back into the dashboard via same-origin fetch

const EXTENSION_FLAG_ATTR = 'upsShipmentExtInstalled';
const STORAGE_KEYS = {
  pendingShipments: 'pendingShipments',
  pendingShipmentsUpdatedAt: 'pendingShipmentsUpdatedAt',
  activeShipment: 'activeShipment',
  trackingUpdates: 'trackingUpdates'
};

function setInstalledFlag() {
  try {
    document.documentElement.dataset[EXTENSION_FLAG_ATTR] = '1';
    window.dispatchEvent(new CustomEvent('UPS_EXTENSION_READY'));
  } catch (_) {}
}

async function fetchJson(url, options) {
  const resp = await fetch(url, { credentials: 'include', ...options });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

async function syncPendingShipments() {
  try {
    const shipments = await fetchJson('/api/shipments');
    const pending = (shipments || []).filter(s => {
      const st = (s?.status || '').toString().toLowerCase();
      return st === 'requested' || st === 'pending';
    });
    await chrome.storage.local.set({
      [STORAGE_KEYS.pendingShipments]: pending,
      [STORAGE_KEYS.pendingShipmentsUpdatedAt]: new Date().toISOString()
    });
  } catch (_) {
    // Silent - should not break dashboard UI
  }
}

async function applyTrackingUpdates() {
  try {
    const { [STORAGE_KEYS.trackingUpdates]: updates } = await chrome.storage.local.get([STORAGE_KEYS.trackingUpdates]);
    const list = Array.isArray(updates) ? updates : [];
    if (!list.length) return;

    const remaining = [];
    for (const u of list) {
      const shipmentId = (u?.shipmentId || '').toString().trim();
      const trackingNumber = (u?.trackingNumber || '').toString().trim();
      if (!shipmentId || !trackingNumber) continue;

      try {
        await fetchJson(`/api/shipments/${encodeURIComponent(shipmentId)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            trackingNumber,
            status: 'label-created',
            shippedAt: new Date().toISOString()
          })
        });
      } catch (_) {
        remaining.push(u);
      }
    }

    await chrome.storage.local.set({ [STORAGE_KEYS.trackingUpdates]: remaining });
  } catch (_) {}
}

function listenForActiveShipmentMessage() {
  window.addEventListener('message', async (event) => {
    if (event.source !== window) return;
    if (event.origin !== window.location.origin) return;
    const data = event.data || {};
    if (data.type !== 'UPS_EXT_SET_ACTIVE_SHIPMENT') return;

    const shipment = data.shipment;
    if (!shipment || !shipment.id) return;

    try {
      await chrome.storage.local.set({ [STORAGE_KEYS.activeShipment]: shipment });
    } catch (_) {}
  });
}

function main() {
  setInstalledFlag();
  listenForActiveShipmentMessage();
  syncPendingShipments();
  applyTrackingUpdates();

  // Keep pending shipments fresh in background while user is on dashboard.
  setInterval(syncPendingShipments, 60_000);
  // Apply tracking updates quickly after UPS label creation.
  setInterval(applyTrackingUpdates, 5_000);
}

main();
