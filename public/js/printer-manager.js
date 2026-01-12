/**
 * Printer Manager UI
 * Front-end for printer discovery, registration, and label printing
 */

let printers = [];
let currentLabelType = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  loadPrinters();
});

// ============================================================================
// PRINTER MANAGEMENT
// ============================================================================

async function loadPrinters() {
  try {
    const response = await fetch('/api/printers');
    const data = await response.json();
    printers = data.printers || [];
    renderPrinters();
  } catch (error) {
    console.error('Failed to load printers:', error);
    showError('Failed to load printers');
  }
}

function renderPrinters() {
  const container = document.getElementById('printer-list');
  
  if (printers.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1/-1">
        <svg fill="currentColor" viewBox="0 0 24 24"><path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z"/></svg>
        <h3>No Printers Found</h3>
        <p>Click "Auto-Discover" to scan your network or add printers manually</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = printers.map(printer => `
    <div class="printer-card ${printer.status || 'offline'}">
      <div class="printer-header">
        <div class="printer-name">${printer.model || 'Unknown Printer'}</div>
        <span class="printer-status status-${printer.status || 'offline'}">
          ${printer.status === 'online' ? '● Online' : '○ Offline'}
        </span>
      </div>
      <div class="printer-details">
        <div><strong>IP:</strong> ${printer.ip}</div>
        <div><strong>Type:</strong> ${printer.type}</div>
        ${printer.lastUsed ? `<div><strong>Last Used:</strong> ${new Date(printer.lastUsed).toLocaleString()}</div>` : ''}
      </div>
      <div class="printer-actions">
        <button class="btn btn-sm btn-primary" onclick="testPrinter('${printer.ip}')">
          Test
        </button>
        <button class="btn btn-sm btn-success" onclick="setDefaultPrinter('${printer.ip}')">
          Set Default
        </button>
      </div>
    </div>
  `).join('');
}

async function discoverPrinters() {
  const btn = event.target;
  btn.disabled = true;
  btn.textContent = '🔍 Scanning network...';
  
  try {
    const response = await fetch('/api/printers/discover', {
      method: 'POST'
    });
    
    const data = await response.json();
    
    if (data.success) {
      showSuccess(`Found ${data.discovered.length} printer(s)`);
      await loadPrinters();
    } else {
      showError('Discovery failed');
    }
  } catch (error) {
    console.error('Discovery error:', error);
    showError('Failed to discover printers');
  } finally {
    btn.disabled = false;
    btn.textContent = '🔍 Auto-Discover Printers';
  }
}

async function addPrinter() {
  const ip = document.getElementById('printer-ip').value.trim();
  const type = document.getElementById('printer-type').value;
  const model = document.getElementById('printer-model').value.trim();
  
  if (!ip) {
    showError('IP address required');
    return;
  }
  
  try {
    const response = await fetch('/api/printers/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip, type, model })
    });
    
    const data = await response.json();
    
    if (data.success) {
      showSuccess('Printer added successfully');
      closeModal('add-printer-modal');
      await loadPrinters();
    } else {
      showError(data.error || 'Failed to add printer');
    }
  } catch (error) {
    console.error('Add printer error:', error);
    showError('Failed to add printer');
  }
}

async function testPrinter(ip) {
  try {
    const response = await fetch(`/api/printers/${ip}/test`, {
      method: 'POST'
    });
    
    const data = await response.json();
    
    if (data.online) {
      showSuccess(`Printer ${ip} is online`);
    } else {
      showError(`Printer ${ip} is offline: ${data.error}`);
    }
  } catch (error) {
    console.error('Test error:', error);
    showError('Failed to test printer');
  }
}

function setDefaultPrinter(ip) {
  // Store in localStorage as preference
  localStorage.setItem('defaultPrinter', ip);
  showSuccess(`Default printer set to ${ip}`);
}

// ============================================================================
// LABEL PRINTING
// ============================================================================

function showLabelModal(type) {
  currentLabelType = type;
  const modal = document.getElementById('label-modal');
  const title = document.getElementById('label-modal-title');
  const form = document.getElementById('label-form');
  
  const templates = {
    product: {
      title: 'Print Product Label',
      fields: [
        { name: 'sku', label: 'SKU', type: 'text', required: true },
        { name: 'description', label: 'Description', type: 'text', required: true },
        { name: 'price', label: 'Price', type: 'number', step: '0.01', required: true },
        { name: 'barcode', label: 'Barcode', type: 'text', required: true }
      ]
    },
    shelf: {
      title: 'Print Shelf Label',
      fields: [
        { name: 'location', label: 'Location', type: 'text', required: true, placeholder: 'A1-B2' },
        { name: 'zone', label: 'Zone', type: 'text', required: true, placeholder: 'Zone A' },
        { name: 'capacity', label: 'Capacity', type: 'number', required: false, placeholder: '100' }
      ]
    },
    rfid: {
      title: 'Print RFID Tag',
      fields: [
        { name: 'sgtin', label: 'SGTIN', type: 'text', required: true },
        { name: 'sku', label: 'SKU', type: 'text', required: true },
        { name: 'description', label: 'Description', type: 'text', required: true }
      ]
    },
    shipping: {
      title: 'Print Shipping Label',
      fields: [
        { name: 'shipmentId', label: 'Shipment ID', type: 'text', required: true }
      ]
    }
  };
  
  const template = templates[type];
  title.textContent = template.title;
  
  form.innerHTML = template.fields.map(field => `
    <div class="form-group">
      <label>${field.label}${field.required ? ' *' : ''}</label>
      <input 
        type="${field.type}" 
        class="form-control" 
        id="label-${field.name}"
        ${field.placeholder ? `placeholder="${field.placeholder}"` : ''}
        ${field.step ? `step="${field.step}"` : ''}
        ${field.required ? 'required' : ''}
      >
    </div>
  `).join('');
  
  // Add printer selection
  form.innerHTML += `
    <div class="form-group">
      <label>Printer (Optional)</label>
      <select class="form-control" id="label-printer">
        <option value="">Default Printer</option>
        ${printers.map(p => `<option value="${p.ip}">${p.model} (${p.ip})</option>`).join('')}
      </select>
    </div>
  `;
  
  modal.classList.add('show');
}

async function printLabel() {
  const type = currentLabelType;
  const printerIp = document.getElementById('label-printer').value || null;
  
  // Collect form data
  const data = { printerIp };
  const inputs = document.querySelectorAll('#label-form input');
  
  for (const input of inputs) {
    const fieldName = input.id.replace('label-', '');
    data[fieldName] = input.value;
    
    if (input.required && !input.value) {
      showError(`${input.previousElementSibling.textContent} is required`);
      return;
    }
  }
  
  try {
    const endpoints = {
      product: '/api/printers/print/product-label',
      shelf: '/api/printers/print/shelf-label',
      rfid: '/api/printers/print/rfid-label',
      shipping: '/api/printers/print/shipping-label'
    };
    
    const response = await fetch(endpoints[type], {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    
    const result = await response.json();
    
    if (result.success) {
      showSuccess('Label printed successfully');
      closeModal('label-modal');
    } else {
      showError(result.error || 'Print failed');
    }
  } catch (error) {
    console.error('Print error:', error);
    showError('Failed to print label');
  }
}

function showReceiptModal() {
  const modal = document.getElementById('label-modal');
  const title = document.getElementById('label-modal-title');
  const form = document.getElementById('label-form');
  
  currentLabelType = 'receipt';
  title.textContent = 'Print Order Receipt';
  
  form.innerHTML = `
    <div class="form-group">
      <label>PSU Number or Order Number *</label>
      <input 
        type="text" 
        class="form-control" 
        id="receipt-psu"
        placeholder="PSU12345"
        required
      >
    </div>
    <div class="form-group">
      <label>Printer (Optional)</label>
      <select class="form-control" id="receipt-printer">
        <option value="">Default Epson Printer</option>
        ${printers.filter(p => p.type === 'epson_escpos').map(p => 
          `<option value="${p.ip}">${p.model} (${p.ip})</option>`
        ).join('')}
      </select>
    </div>
  `;
  
  // Override print button to use receipt endpoint
  const printBtn = modal.querySelector('.btn-primary');
  printBtn.onclick = async () => {
    const psuNumber = document.getElementById('receipt-psu').value.trim();
    const printerIp = document.getElementById('receipt-printer').value || null;
    
    if (!psuNumber) {
      showError('PSU number required');
      return;
    }
    
    try {
      const response = await fetch('/api/printers/print/receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ psuNumber, printerIp })
      });
      
      const result = await response.json();
      
      if (result.success) {
        showSuccess('Receipt printed successfully');
        closeModal('label-modal');
      } else {
        showError(result.error || 'Print failed');
      }
    } catch (error) {
      console.error('Receipt print error:', error);
      showError('Failed to print receipt');
    }
  };
  
  modal.classList.add('show');
}

// ============================================================================
// UI HELPERS
// ============================================================================

function showAddPrinterModal() {
  document.getElementById('printer-ip').value = '';
  document.getElementById('printer-model').value = '';
  document.getElementById('add-printer-modal').classList.add('show');
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('show');
}

function showSuccess(message) {
  alert('✅ ' + message);
}

function showError(message) {
  alert('❌ ' + message);
}

// Close modals on background click
document.querySelectorAll('.modal').forEach(modal => {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('show');
    }
  });
});
