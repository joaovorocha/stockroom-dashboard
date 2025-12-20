// Shipments page JavaScript

let currentUser = null;

// Load shipments when page loads
document.addEventListener('DOMContentLoaded', () => {
  addQuickNav('Shipments', 'top');
  addQuickNav('Shipments', 'bottom');

  loadShipments();
  setupEventListeners();
  checkUserAuth();
  checkAutoFillData();
});

// Check user authentication
async function checkUserAuth() {
  try {
    const response = await fetch('/api/auth/check');
    const data = await response.json();

    if (data.authenticated && data.user) {
      currentUser = data.user;
    }
  } catch (error) {
    console.log('User not logged in');
    currentUser = null;
  }
}

// Check for auto-fill data from Chrome extension
async function checkAutoFillData() {
  // Check if chrome.storage is available (extension context)
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    try {
      chrome.storage.local.get(['autoFillData'], (result) => {
        if (result.autoFillData) {
          console.log('Auto-fill data found from extension:', result.autoFillData);

          // Auto-open the form and fill it
          setTimeout(() => {
            showRequestForm();
            autoFillFormWithExtensionData(result.autoFillData);

            // Clear the storage after using it
            chrome.storage.local.remove('autoFillData');
          }, 500);
        }
      });
    } catch (error) {
      console.log('Chrome extension API not available:', error);
    }
  }
}

// Auto-fill form with data from Chrome extension
function autoFillFormWithExtensionData(data) {
  console.log('Auto-filling form with:', data);

  // Fill employee name from sender if not logged in
  if (data.senderName && !currentUser) {
    const employeeNameInput = document.getElementById('employee-name');
    if (employeeNameInput && !employeeNameInput.value) {
      employeeNameInput.value = data.senderName;
    }
  }

  // Fill order number if extracted
  if (data.orderNumber) {
    document.getElementById('order-number').value = data.orderNumber;
  }

  // Fill tracking number
  if (data.trackingNumber) {
    document.getElementById('tracking-number').value = data.trackingNumber;
  }

  // Fill service type
  if (data.serviceType) {
    document.getElementById('service-type').value = data.serviceType;
  }

  // Fill guarantee date
  if (data.guaranteeDate) {
    document.getElementById('guarantee-date').value = data.guaranteeDate;
  }

  // Fill recipient (address is the recipient)
  if (data.recipientName) {
    document.getElementById('recipient-name').value = data.recipientName;
  }

  // Fill address
  if (data.addressLine1) {
    document.getElementById('address-line1').value = data.addressLine1;
  }

  if (data.addressLine2) {
    document.getElementById('address-line2').value = data.addressLine2;
  }

  if (data.city) {
    document.getElementById('city').value = data.city;
  }

  if (data.state) {
    document.getElementById('state').value = data.state;
  }

  if (data.zip) {
    document.getElementById('zip').value = data.zip;
  }

  if (data.country) {
    document.getElementById('country').value = data.country;
  }

  if (data.phone) {
    document.getElementById('phone').value = data.phone;
  }

  // Add a note that data was auto-filled
  const notesField = document.getElementById('notes');
  const existingNotes = notesField.value;
  const autoNote = '🤖 Auto-filled from UPS via Chrome Extension';

  if (!existingNotes.includes(autoNote)) {
    notesField.value = existingNotes ? `${existingNotes}\n\n${autoNote}` : autoNote;
  }

  // Show success message
  showSuccess('Form auto-filled with data from UPS! Please review and complete remaining fields.');

  // Scroll to reason field (first required field that needs to be filled)
  document.getElementById('reason').focus();
}

// Setup event listeners
function setupEventListeners() {
  document.getElementById('refresh-btn').addEventListener('click', loadShipments);
  document.getElementById('request-shipment-btn').addEventListener('click', showRequestForm);
  document.getElementById('cancel-request-btn').addEventListener('click', hideRequestForm);
  document.getElementById('change-user-btn').addEventListener('click', handleChangeUser);
  document.getElementById('shipment-request-form').addEventListener('submit', handleShipmentRequest);
}

// Show request shipment form
function showRequestForm() {
  document.getElementById('request-form').classList.remove('hidden');
  document.getElementById('request-shipment-btn').style.display = 'none';

  // Auto-populate employee info if logged in
  if (currentUser) {
    populateEmployeeFields();
  }

  // Scroll to form
  document.getElementById('request-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Populate employee fields from current user
function populateEmployeeFields() {
  const employeeIdInput = document.getElementById('employee-id');
  const employeeNameInput = document.getElementById('employee-name');
  const userInfoDisplay = document.getElementById('user-info-display');
  const loggedInName = document.getElementById('logged-in-name');

  employeeIdInput.value = currentUser.userId;
  employeeNameInput.value = currentUser.name;

  // Make fields readonly when auto-populated
  employeeIdInput.readOnly = true;
  employeeNameInput.readOnly = true;
  employeeIdInput.style.backgroundColor = '#f5f5f5';
  employeeNameInput.style.backgroundColor = '#f5f5f5';

  // Show user info display
  loggedInName.textContent = currentUser.name;
  userInfoDisplay.classList.remove('hidden');
}

// Handle change user button
function handleChangeUser() {
  const employeeIdInput = document.getElementById('employee-id');
  const employeeNameInput = document.getElementById('employee-name');
  const userInfoDisplay = document.getElementById('user-info-display');

  // Clear fields and make them editable
  employeeIdInput.value = '';
  employeeNameInput.value = '';
  employeeIdInput.readOnly = false;
  employeeNameInput.readOnly = false;
  employeeIdInput.style.backgroundColor = '#fff';
  employeeNameInput.style.backgroundColor = '#fff';

  // Hide user info display
  userInfoDisplay.classList.add('hidden');

  // Focus on employee ID field
  employeeIdInput.focus();
}

// Hide request shipment form
function hideRequestForm() {
  document.getElementById('request-form').classList.add('hidden');
  document.getElementById('request-shipment-btn').style.display = 'inline-block';
  document.getElementById('shipment-request-form').reset();

  // Reset employee fields styling
  const employeeIdInput = document.getElementById('employee-id');
  const employeeNameInput = document.getElementById('employee-name');
  const userInfoDisplay = document.getElementById('user-info-display');

  employeeIdInput.readOnly = false;
  employeeNameInput.readOnly = false;
  employeeIdInput.style.backgroundColor = '#fff';
  employeeNameInput.style.backgroundColor = '#fff';
  userInfoDisplay.classList.add('hidden');
}

// Handle shipment request form submission
async function handleShipmentRequest(e) {
  e.preventDefault();

  const formData = new FormData(e.target);

  // Validate and extract PSUS order number
  const orderNumberInput = formData.get('orderNumber');
  const psusNumber = extractPSUSNumber(orderNumberInput);

  if (!psusNumber) {
    showError('Invalid order number. Please use format: PSUS + 8 digits (e.g., PSUS02101002)');
    return;
  }

  // Build full address
  const address = {
    line1: formData.get('addressLine1'),
    line2: formData.get('addressLine2'),
    city: formData.get('city'),
    state: formData.get('state'),
    zip: formData.get('zip'),
    country: formData.get('country')
  };

  const fullAddress = [
    address.line1,
    address.line2,
    `${address.city}, ${address.state} ${address.zip}`,
    address.country
  ].filter(part => part && part.trim()).join(', ');

  // Build comprehensive shipment data
  const shipmentData = {
    date: new Date().toISOString().split('T')[0],
    trackingNumber: formData.get('trackingNumber') || 'Pending',
    recipient: formData.get('recipientName'),
    requestedBy: {
      employeeId: formData.get('employeeId'),
      employeeName: formData.get('employeeName')
    },
    details: JSON.stringify({
      orderNumber: psusNumber, // Use validated PSUS number
      reason: formData.get('reason'),
      clientType: formData.get('clientType'),
      shipmentCharged: formData.get('shipmentCharged'),
      phone: formData.get('phone'),
      address: address,
      fullAddress: fullAddress,
      notes: formData.get('notes'),
      requestedBy: {
        employeeId: formData.get('employeeId'),
        employeeName: formData.get('employeeName')
      }
    })
  };

  try {
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';

    const response = await fetch('/api/shipments/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(shipmentData)
    });

    const result = await response.json();

    if (response.ok && result.success) {
      showSuccess('Shipment request submitted successfully!');
      hideRequestForm();
      loadShipments(); // Reload the table
    } else {
      showError(result.error || 'Failed to submit shipment request');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Request';
    }
  } catch (error) {
    console.error('Error submitting shipment request:', error);
    showError('Connection error. Please try again.');
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit Request';
  }
}

// Load shipments
async function loadShipments() {
  const loading = document.getElementById('loading');
  const error = document.getElementById('error');
  const content = document.getElementById('shipments-content');
  const refreshBtn = document.getElementById('refresh-btn');

  // Show loading
  loading.classList.remove('hidden');
  error.classList.add('hidden');
  content.classList.add('hidden');
  refreshBtn.disabled = true;
  refreshBtn.textContent = 'Refreshing...';

  try {
    const response = await fetch('/api/shipments');
    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || 'Failed to load shipments');
    }

    // Hide loading, show content
    loading.classList.add('hidden');
    content.classList.remove('hidden');
    refreshBtn.disabled = false;
    refreshBtn.textContent = 'Refresh Status';

    // Display shipments
    displayShipments(result.shipments);
  } catch (err) {
    console.error('Error loading shipments:', err);
    loading.classList.add('hidden');
    error.textContent = `ERROR: ${err.message}`;
    error.classList.remove('hidden');
    refreshBtn.disabled = false;
    refreshBtn.textContent = 'Refresh Status';
  }
}

// Display shipments table
function displayShipments(shipments) {
  const tableBody = document.getElementById('table-body');
  const countElement = document.getElementById('shipment-count');

  countElement.textContent = shipments.length;

  if (shipments.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: #666;">No shipments found</td></tr>';
    return;
  }

  let html = '';
  shipments.forEach(shipment => {
    // Parse details if it's JSON
    let details = {};
    try {
      details = typeof shipment.Details === 'string' ? JSON.parse(shipment.Details) : {};
    } catch (e) {
      details = { notes: shipment.Details || '' };
    }

    const statusClass = getStatusClass(shipment.status);

    html += `
      <tr>
        <td>${shipment.Date || ''}</td>
        <td style="font-weight: 500;">${details.orderNumber || '—'}</td>
        <td style="font-family: monospace; font-size: 0.85em;">${shipment['Tracking Number'] || 'Pending'}</td>
        <td>${shipment.Recipient || ''}</td>
        <td style="font-size: 0.85em;">${details.fullAddress || details.address?.city || '—'}</td>
        <td>${details.reason || '—'}</td>
        <td><span class="status-badge ${statusClass}">${shipment.status || 'Unknown'}</span></td>
        <td>
          ${shipment.trackingLink && shipment['Tracking Number'] !== 'Pending'
            ? `<a href="${shipment.trackingLink}" target="_blank">Track →</a>`
            : '—'
          }
        </td>
      </tr>
    `;
  });

  tableBody.innerHTML = html;
}

// Get CSS class for status badge
function getStatusClass(status) {
  if (!status) return 'status-pending';

  const statusLower = status.toLowerCase();
  if (statusLower.includes('delivered')) return 'status-delivered';
  if (statusLower.includes('transit') || statusLower.includes('delivery')) return 'status-transit';
  return 'status-pending';
}

// Show success message
function showSuccess(message) {
  const successElement = document.getElementById('success');
  successElement.textContent = `${message}`;
  successElement.classList.remove('hidden');

  // Scroll to top to show message
  window.scrollTo({ top: 0, behavior: 'smooth' });

  setTimeout(() => {
    successElement.classList.add('hidden');
  }, 7000);
}

// Show error message
function showError(message) {
  const errorElement = document.getElementById('error');
  errorElement.textContent = `ERROR: ${message}`;
  errorElement.classList.remove('hidden');

  // Scroll to top to show message
  window.scrollTo({ top: 0, behavior: 'smooth' });

  setTimeout(() => {
    errorElement.classList.add('hidden');
  }, 7000);
}
