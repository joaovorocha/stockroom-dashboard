// Content script for UPS pages:
// - Tracking pages: extract shipment data (used by popup)
// - CampusShip Create Shipment: auto-fill fields from the active shipment (Ship at UPS)
// - Confirmation pages: detect tracking number and queue dashboard update

(function () {
  const STORAGE_KEYS = {
    extractedData: 'extractedData',
    activeShipment: 'activeShipment',
    trackingUpdates: 'trackingUpdates',
    lastExtractedData: 'lastExtractedData',
    pendingShipments: 'pendingShipments',
    uiCollapsed: 'campusShipUiCollapsed'
  };

  function isCampusShipCreatePage() {
    return /campusship\.ups\.com/i.test(location.hostname) && /\/cship\/create/i.test(location.pathname);
  }

  function extractTrackingNumberFromText(text) {
    const patterns = [
      /1Z[A-Z0-9]{16}/gi,          // Standard UPS
      /\b\d{18,22}\b/g,            // Some UPS services
      /\b[A-Z]{2}\d{9}US\b/gi      // USPS via UPS Mail Innovations
    ];
    for (const p of patterns) {
      const match = (text || '').match(p);
      if (match && match[0]) return match[0].toUpperCase();
    }
    return '';
  }

  function isCampusShipDomain() {
    return /campusship\.ups\.com/i.test(location.hostname);
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getTextFromLikelyTrackingElements() {
    const selectors = [
      '[data-test*="tracking"]',
      '[id*="tracking"]',
      '[class*="tracking"]',
      'a[href*="track"]',
      'strong',
      'h1',
      'h2'
    ];
    const chunks = [];
    for (const sel of selectors) {
      const nodes = document.querySelectorAll(sel);
      for (const n of nodes) {
        const t = (n.textContent || '').trim();
        if (t) chunks.push(t);
      }
    }
    return chunks.join('\n');
  }

  // Extract shipment data from UPS tracking pages (best-effort)
  function extractShipmentData() {
    const data = {
      trackingNumber: '',
      recipientName: '',
      addressLine1: '',
      addressLine2: '',
      city: '',
      state: '',
      zip: '',
      country: '',
      phone: '',
      status: '',
      senderName: '',
      guaranteeDate: '',
      serviceType: '',
      orderNumber: '',
      source: 'ups',
      extractedAt: new Date().toISOString()
    };

    try {
      const pageText = document.body?.innerText || '';

      // Common tracking patterns
      const explicitMatch = pageText.match(/Tracking Number:\s*([A-Z0-9]+)/i);
      if (explicitMatch) data.trackingNumber = explicitMatch[1].trim();
      if (!data.trackingNumber) data.trackingNumber = extractTrackingNumberFromText(pageText);

      const deliveredByMatch = pageText.match(/Delivered By:\s*([^\n]+)/i);
      if (deliveredByMatch) {
        data.guaranteeDate = deliveredByMatch[1].trim();
        data.status = `Scheduled: ${data.guaranteeDate}`;
      }

      const serviceMatch = pageText.match(/Service:\s*([^\n]+)/i);
      if (serviceMatch) data.serviceType = serviceMatch[1].trim();

      const shipFromMatch = pageText.match(/Ship From:\s*([^\n]+)/i);
      if (shipFromMatch) data.senderName = shipFromMatch[1].trim();
      if (!data.senderName) {
        const shipperMatch = pageText.match(/(?:Shipper|Sender):\s*([^\n]+)/i);
        if (shipperMatch) data.senderName = shipperMatch[1].trim();
      }

      const orderMatch = pageText.match(/(?:Order|Reference|PO)(?:\s+Number)?:\s*([A-Z0-9-]+)/i);
      if (orderMatch) data.orderNumber = orderMatch[1].trim();

      // Recipient
      const shipToMatch = pageText.match(/Ship To:\s*([^\n]+)/i);
      if (shipToMatch) data.recipientName = shipToMatch[1].trim();

      // Address line 1 heuristic
      const addressLine1Match = pageText.match(
        /\d+\s+[A-Za-z0-9\s]+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Way|Court|Ct|Place|Pl|Circle|Cir)/i
      );
      if (addressLine1Match && addressLine1Match[0]) data.addressLine1 = addressLine1Match[0].trim();

      const cityStateZipMatch = pageText.match(/([A-Za-z\s]+),\s*([A-Z]{2})\s+(\d{5}(-\d{4})?)/);
      if (cityStateZipMatch) {
        data.city = cityStateZipMatch[1].trim();
        data.state = cityStateZipMatch[2];
        data.zip = cityStateZipMatch[3];
      }

      data.country = 'United States';
    } catch (error) {
      console.error('Error extracting shipment data:', error);
    }

    return data;
  }

  function setFieldValue(selector, value, options = {}) {
    const el = document.querySelector(selector);
    if (!el) return false;
    const nextValue = value ?? '';
    if (String(el.value ?? '') === String(nextValue)) return true;
    el.focus();
    el.value = nextValue;
    const triggerInput = options.triggerInput !== false;
    const triggerChange = options.triggerChange !== false;
    if (triggerInput) el.dispatchEvent(new Event('input', { bubbles: true }));
    if (triggerChange) el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function setCheckbox(selector, checked) {
    const el = document.querySelector(selector);
    if (!el) return false;
    el.checked = !!checked;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function setSelectValue(selector, value, options = {}) {
    const el = document.querySelector(selector);
    if (!el) return false;
    if (el.tagName !== 'SELECT') return setFieldValue(selector, value, options);

    const desired = String(value ?? '');
    const found = Array.from(el.options || []).some((o) => String(o.value) === desired);
    if (!found) return false;

    el.value = desired;
    const triggerChange = options.triggerChange !== false;
    if (triggerChange) {
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return true;
  }

  function setSelectByLabelContains(selector, containsText, options = {}) {
    const el = document.querySelector(selector);
    if (!el || el.tagName !== 'SELECT') return false;
    const needle = String(containsText || '').toLowerCase();
    if (!needle) return false;
    const opt = Array.from(el.options || []).find((o) => (o.textContent || '').toLowerCase().includes(needle));
    if (!opt) return false;
    return setSelectValue(selector, opt.value, options);
  }

  function mapServiceToCode(serviceType) {
    const s = (serviceType || '').toString().toLowerCase();
    if (s.includes('next day')) return '001';
    if (s.includes('2nd day') || s.includes('second day')) return '002';
    if (s.includes('3 day')) return '012';
    return '003'; // Ground
  }

  function normalizeShipmentForCampusShip(shipment) {
    const addr = shipment?.address && typeof shipment.address === 'object' ? shipment.address : {};
    const country = (addr.country || shipment?.country || 'US').toString();
    return {
      shipmentId: shipment?.id || '',
      customerName: shipment?.customerName || '',
      phone: addr.phone || shipment?.phone || '',
      email: shipment?.email || '',
      addressLine1: addr.line1 || shipment?.addressLine1 || '',
      addressLine2: addr.line2 || shipment?.addressLine2 || '',
      city: addr.city || shipment?.city || '',
      state: addr.state || shipment?.state || '',
      zip: addr.zip || shipment?.zip || '',
      country: country === 'USA' ? 'US' : country,
      orderNumber: shipment?.orderNumber || '',
      processedById: shipment?.processedById || '',
      serviceCode: mapServiceToCode(shipment?.serviceType || shipment?.service || 'UPS Ground Service')
    };
  }

  function ensureEnterNewAddressVisible() {
    const details = document.getElementById('shipToAddressDetails');
    const collapsed = document.getElementById('shipToCollapsed');
    // Do NOT click the "Enter New Address" link because it uses a `javascript:` URL
    // which can be blocked by CSP. The fields usually exist in the DOM even if hidden.
    if (collapsed) collapsed.value = 'false';
    if (details) {
      details.hidden = false;
      details.style.display = 'block';
    }
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function waitForSelector(selector, timeoutMs = 12_000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const el = document.querySelector(selector);
      if (el) return el;
      await sleep(200);
    }
    return null;
  }

  async function waitForSelectOptions(selector, minOptions = 2, timeoutMs = 12_000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const el = document.querySelector(selector);
      if (el && el.tagName === 'SELECT' && (el.options?.length || 0) >= minOptions) return el;
      await sleep(200);
    }
    return null;
  }

  async function fillCampusShip(shipment) {
    if (!isCampusShipCreatePage()) return { ok: false, error: 'Not on CampusShip create page' };
    if (!shipment) return { ok: false, error: 'No shipment provided' };

    const s = normalizeShipmentForCampusShip(shipment);
    if (!s.shipmentId) return { ok: false, error: 'Shipment is missing an id' };

    ensureEnterNewAddressVisible();

    // UPS page can take a while to fully wire up. Wait for key fields.
    const shipToNameEl = await waitForSelector('#shipToNameValue');
    if (!shipToNameEl) return { ok: false, error: 'UPS form not ready (Ship To fields not found yet). Refresh the page and try again.' };
    await waitForSelectOptions('#service', 2).catch(() => null);

    const report = {};

    // Ship To
    report.shipToNameValue = setFieldValue('#shipToNameValue', s.customerName);
    report.shipToContactNameValue = setFieldValue('#shipToContactNameValue', s.customerName);
    // Changing country triggers a page submit; avoid firing change events.
    report.shipToCountryValue = setSelectValue('#shipToCountryValue', s.country, { triggerChange: false });
    report.shipToStreetValue = setFieldValue('#shipToStreetValue', s.addressLine1);
    report.shipToAddr2Value = setFieldValue('#shipToAddr2Value', s.addressLine2);
    report.shipToCityValue = setFieldValue('#shipToCityValue', s.city);
    report.shipToStateValue = setSelectValue('#shipToStateValue', s.state);
    report.shipToPostalValue = setFieldValue('#shipToPostalValue', s.zip);
    report.shipToPhoneValue = setFieldValue('#shipToPhoneValue', s.phone);
    report.shipToEmailValue = setFieldValue('#shipToEmailValue', s.email);

    // Package
    report.weight = setFieldValue('#packageBean\\.weight', '1');

    // Service
    report.service = setSelectValue('#service', s.serviceCode);
    if (!report.service) {
      // Fallback: try by label if codes differ in some accounts.
      const st = (shipment?.serviceType || shipment?.service || '').toString().toLowerCase();
      if (st.includes('next day')) report.service = setSelectByLabelContains('#service', 'next day');
      else if (st.includes('2nd day') || st.includes('second day')) report.service = setSelectByLabelContains('#service', '2nd day');
      else if (st.includes('3 day')) report.service = setSelectByLabelContains('#service', '3 day');
      else report.service = setSelectByLabelContains('#service', 'ground');
    }

    // Delivery notification (email)
    report.emailNotify = setCheckbox('#emailNotify', true);

    // References (business rule requested)
    report.reference1 = setFieldValue('#reference_value1', s.orderNumber);
    report.reference2 = setFieldValue('#reference_value2', s.processedById);

    // Helpful warnings for debugging in popup
    const warnings = [];
    if (!report.service) warnings.push('Service was not set (option not found).');
    if (!report.shipToStateValue) warnings.push('State was not set (option not found).');

    const filledCount = Object.values(report).filter(Boolean).length;
    if (filledCount === 0) {
      return { ok: false, error: 'Nothing was filled. UPS page layout may have changed or the form is not ready yet.', report, warnings };
    }
    return { ok: true, report, warnings, filledCount };
  }

  function formatShipmentLabel(shipment, isActive) {
    const name = shipment?.customerName || 'Unknown';
    const order = shipment?.orderNumber ? ` • ${shipment.orderNumber}` : '';
    return `${name}${order}${isActive ? ' • ACTIVE' : ''}`;
  }

  async function loadPendingFromStorage() {
    const { pendingShipments, activeShipment } = await chrome.storage.local.get([
      STORAGE_KEYS.pendingShipments,
      STORAGE_KEYS.activeShipment
    ]);
    const list = Array.isArray(pendingShipments) ? pendingShipments : [];
    const active = activeShipment && typeof activeShipment === 'object' ? activeShipment : null;

    let merged = list;
    if (active?.id) {
      merged = [active, ...list.filter((s) => s?.id && s.id !== active.id)];
    }
    return { pending: merged.filter(Boolean), active };
  }

  async function injectCampusShipWidget() {
    if (!isCampusShipDomain()) return;
    if (document.getElementById('ss-campusship-widget')) return;

    const host = document.createElement('div');
    host.id = 'ss-campusship-widget';
    host.style.position = 'fixed';
    host.style.right = '16px';
    host.style.bottom = '16px';
    host.style.zIndex = '2147483647';
    document.documentElement.appendChild(host);

    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        .wrap { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; width: 340px; }
        .card { border: 1px solid #e0e0e0; border-radius: 10px; overflow: hidden; background: #fff; box-shadow: 0 10px 30px rgba(0,0,0,0.18); }
        .header { background:#000; color:#fff; padding: 10px 12px; display:flex; align-items:center; justify-content:space-between; }
        .title { font-size: 12px; letter-spacing: 1px; text-transform: uppercase; }
        .btnlink { background: transparent; color:#fff; border:0; cursor:pointer; font-size:12px; opacity:0.9; }
        .body { padding: 12px; display:grid; gap: 10px; }
        .row { display:flex; gap: 8px; align-items:center; }
        select, button, input { font-size: 13px; }
        select { width: 100%; padding: 10px; border:1px solid #e0e0e0; border-radius: 6px; }
        .btn { width: 100%; padding: 12px; border-radius: 6px; border:1px solid #000; cursor:pointer; text-transform: uppercase; letter-spacing: 1px; font-weight: 600; }
        .btn.primary { background:#000; color:#fff; }
        .btn.secondary { background:#fff; color:#000; }
        .status { font-size: 12px; color:#333; background:#f7f7f7; border:1px solid #eaeaea; border-radius:6px; padding: 10px; max-height: 160px; overflow:auto; }
        .pill { width: 48px; height: 48px; border-radius: 999px; background:#000; color:#fff; display:flex; align-items:center; justify-content:center; cursor:pointer; box-shadow: 0 10px 30px rgba(0,0,0,0.18); }
        .hidden { display:none; }
      </style>
      <div class="wrap">
        <div class="pill" id="pill" title="Stockroom Auto-Fill">SS</div>
        <div class="card hidden" id="card">
          <div class="header">
            <div class="title">Stockroom Auto-Fill</div>
            <div class="row">
              <button class="btnlink" id="refresh">Refresh</button>
              <button class="btnlink" id="collapse">Hide</button>
            </div>
          </div>
          <div class="body">
            <div class="status" id="details">Loading pending shipments…</div>
            <div>
              <div style="font-size:12px; color:#555; margin-bottom:6px;">Pending shipment</div>
              <select id="select"></select>
            </div>
            <button class="btn primary" id="fill">Fill This UPS Form</button>
          </div>
        </div>
      </div>
    `;

    const els = {
      pill: shadow.getElementById('pill'),
      card: shadow.getElementById('card'),
      collapse: shadow.getElementById('collapse'),
      refresh: shadow.getElementById('refresh'),
      details: shadow.getElementById('details'),
      select: shadow.getElementById('select'),
      fill: shadow.getElementById('fill')
    };

    async function setCollapsed(collapsed) {
      await chrome.storage.local.set({ [STORAGE_KEYS.uiCollapsed]: !!collapsed });
      if (collapsed) {
        els.card.classList.add('hidden');
        els.pill.classList.remove('hidden');
      } else {
        els.pill.classList.add('hidden');
        els.card.classList.remove('hidden');
      }
    }

    async function render() {
      const { pending, active } = await loadPendingFromStorage();
      if (!pending.length) {
        els.details.innerHTML =
          'No pending shipments found.<br><br>Open Stockroom Dashboard (Shipments/Processing) once so it can sync, then come back and click Refresh.';
        els.select.innerHTML = '';
        els.fill.disabled = true;
        return;
      }

      els.fill.disabled = false;
      els.select.innerHTML = pending
        .map((s) => {
          const isActive = !!(active?.id && s?.id === active.id);
          return `<option value="${escapeHtml(String(s.id))}">${escapeHtml(formatShipmentLabel(s, isActive))}</option>`;
        })
        .join('');

      // Default selection: active shipment if present
      if (active?.id) els.select.value = String(active.id);

      const selected = pending.find((s) => String(s.id) === String(els.select.value)) || pending[0];
      const addr = selected?.address && typeof selected.address === 'object' ? selected.address : {};
      const phone = addr.phone || selected?.phone || '';
      const addressLine = [
        addr.line1 || selected?.addressLine1 || '',
        addr.line2 || selected?.addressLine2 || '',
        [addr.city || selected?.city || '', addr.state || selected?.state || '', addr.zip || selected?.zip || ''].filter(Boolean).join(' '),
        addr.country || selected?.country || ''
      ]
        .filter(Boolean)
        .join(', ');
      els.details.innerHTML = `
        <div><b>Will fill:</b> Name, Phone, Email, Address, Weight=1, Service, Email Notify, Ref1=Order#, Ref2=Processor ID</div>
        <div style="margin-top:8px;"><b>Customer:</b> ${escapeHtml(selected.customerName || '')}</div>
        <div><b>Order:</b> ${escapeHtml(selected.orderNumber || '')}</div>
        <div><b>Service:</b> ${escapeHtml(selected.serviceType || '')}</div>
        <div><b>Email:</b> ${escapeHtml(selected.email || '')}</div>
        <div><b>Phone:</b> ${escapeHtml(phone)}</div>
        <div><b>Address:</b> ${escapeHtml(addressLine)}</div>
        <div><b>Requested by:</b> ${escapeHtml(selected.employeeName || '')}</div>
        <div><b>Processor id:</b> ${escapeHtml(selected.processedById || '')}</div>
      `;
    }

    els.select.addEventListener('change', render);
    els.refresh.addEventListener('click', render);
    els.collapse.addEventListener('click', () => setCollapsed(true));
    els.pill.addEventListener('click', () => setCollapsed(false));
    els.fill.addEventListener('click', async () => {
      try {
        const { pending } = await loadPendingFromStorage();
        const selected = pending.find((s) => String(s.id) === String(els.select.value)) || pending[0];
        const res = await fillCampusShip(selected);
        if (!res?.ok) {
          els.details.innerHTML = `Fill failed: ${escapeHtml(res?.error || 'Unknown error')}`;
          return;
        }
        const warnings = Array.isArray(res.warnings) && res.warnings.length ? `\n\nWarnings:\n- ${res.warnings.join('\n- ')}` : '';
        els.details.innerHTML = `Filled. Please verify fields before clicking Next.${escapeHtml(warnings).replace(/\n/g, '<br>')}`;
      } catch (e) {
        els.details.innerHTML = `Fill failed: ${escapeHtml(e?.message || 'Unknown error')}`;
      }
    });

    const stored = await chrome.storage.local.get([STORAGE_KEYS.uiCollapsed]);
    // Default to OPEN (collapsed=false) so users always see it on UPS pages.
    await setCollapsed(stored[STORAGE_KEYS.uiCollapsed] === true);
    await render();
  }

  async function detectTrackingAndQueueUpdate() {
    if (!isCampusShipDomain()) return;

    const text = document.body?.innerText || '';
    const tracking = extractTrackingNumberFromText(`${text}\n${getTextFromLikelyTrackingElements()}`);
    if (!tracking) return;

    const { [STORAGE_KEYS.activeShipment]: activeShipment } = await chrome.storage.local.get([STORAGE_KEYS.activeShipment]);
    const shipmentId = activeShipment?.id;
    if (!shipmentId) return;

    const { [STORAGE_KEYS.trackingUpdates]: existing } = await chrome.storage.local.get([STORAGE_KEYS.trackingUpdates]);
    const list = Array.isArray(existing) ? existing : [];
    const next = list.filter((x) => x?.shipmentId !== shipmentId);
    next.push({ shipmentId, trackingNumber: tracking, at: new Date().toISOString(), source: 'ups-confirmation' });
    await chrome.storage.local.set({ [STORAGE_KEYS.trackingUpdates]: next });
  }

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'extractData') {
      const data = extractShipmentData();
      chrome.storage.local.set({ [STORAGE_KEYS.extractedData]: data });
      sendResponse({ success: true, data });
      return true;
    }

    if (request.action === 'fillCampusShip') {
      (async () => {
        try {
          const shipment =
            request.shipment ||
            (await chrome.storage.local.get([STORAGE_KEYS.activeShipment]))[STORAGE_KEYS.activeShipment] ||
            null;
          const result = await fillCampusShip(shipment);
          sendResponse({ success: true, result });
        } catch (e) {
          sendResponse({ success: false, error: e?.message || 'Failed to fill CampusShip' });
        }
      })();
      return true;
    }
    return true;
  });

  // Auto extract on load for tracking pages
  window.addEventListener('load', () => {
    setTimeout(() => {
      const data = extractShipmentData();
      if (data.trackingNumber) chrome.storage.local.set({ [STORAGE_KEYS.lastExtractedData]: data });
    }, 1500);
  });

  // No automatic filling: user triggers fill from the extension popup.

  // Best-effort tracking detection (confirmation pages)
  if (isCampusShipDomain()) {
    // Persistent helper UI (toggleable).
    injectCampusShipWidget();

    setTimeout(detectTrackingAndQueueUpdate, 1500);
    setTimeout(detectTrackingAndQueueUpdate, 6000);

    // Watch for SPA/async render of confirmation details.
    let attempts = 0;
    const maxAttempts = 60; // ~60s
    const timer = setInterval(async () => {
      attempts += 1;
      await detectTrackingAndQueueUpdate();
      if (attempts >= maxAttempts) clearInterval(timer);
    }, 1000);

    const observer = new MutationObserver(() => {
      detectTrackingAndQueueUpdate();
    });
    try {
      observer.observe(document.documentElement, { childList: true, subtree: true });
      setTimeout(() => observer.disconnect(), 60_000);
    } catch (_) {}
  }
})();
