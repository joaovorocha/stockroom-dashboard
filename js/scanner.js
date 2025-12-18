// Scanner page JavaScript

let codeReader = null;
let selectedDeviceId = null;
let cameraStream = null;

document.addEventListener('DOMContentLoaded', () => {
  // Add quick nav
  addQuickNav('Scanner', 'top');
  addQuickNav('Scanner', 'bottom');

  setupScanner();
  setupCamera();
});

function setupScanner() {
  const scannerInput = document.getElementById('scanner-input');
  const statusDiv = document.getElementById('scanner-status');

  // Handle input (triggered when scanner finishes)
  scannerInput.addEventListener('change', async () => {
    const scannedData = scannerInput.value.trim();

    if (!scannedData) {
      return;
    }

    await processScannedData(scannedData);

    // Clear input and refocus for next scan
    scannerInput.value = '';
    scannerInput.focus();
  });

  // Alternative: Handle Enter key (some scanners send Enter)
  scannerInput.addEventListener('keypress', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const scannedData = scannerInput.value.trim();

      if (scannedData) {
        await processScannedData(scannedData);
        scannerInput.value = '';
      }
    }
  });

  // Keep input focused when not using camera
  scannerInput.focus();
}

function setupCamera() {
  const cameraBtn = document.getElementById('camera-btn');
  const closeCameraBtn = document.getElementById('close-camera-btn');

  cameraBtn.addEventListener('click', startCamera);
  closeCameraBtn.addEventListener('click', stopCamera);
}

async function startCamera() {
  const cameraView = document.getElementById('camera-view');
  const videoElement = document.getElementById('camera-video');
  const cameraBtn = document.getElementById('camera-btn');

  try {
    cameraBtn.disabled = true;
    cameraBtn.textContent = 'Loading camera...';

    // Initialize ZXing code reader
    if (typeof ZXing === 'undefined') {
      throw new Error('ZXing library not loaded');
    }

    codeReader = new ZXing.BrowserMultiFormatReader();

    // Get available video devices
    const videoInputDevices = await codeReader.listVideoInputDevices();

    if (videoInputDevices.length === 0) {
      throw new Error('No camera found');
    }

    // Use first camera (usually back camera on mobile)
    selectedDeviceId = videoInputDevices[0].deviceId;

    // Show camera view
    cameraView.classList.remove('hidden');

    // Start decoding from camera
    await codeReader.decodeFromVideoDevice(
      selectedDeviceId,
      videoElement,
      async (result, err) => {
        if (result) {
          // Code detected!
          const scannedData = result.text;
          console.log('Detected code:', scannedData);

          // Process the scanned data
          await processScannedData(scannedData);

          // Optional: Stop camera after successful scan
          // stopCamera();
        }

        if (err && !(err instanceof ZXing.NotFoundException)) {
          console.error('Camera error:', err);
        }
      }
    );

    cameraBtn.textContent = '📷 Camera Active';
  } catch (error) {
    console.error('Camera error:', error);
    showStatus(`Camera error: ${error.message}`, 'error');
    cameraBtn.disabled = false;
    cameraBtn.textContent = '📷 Open Camera';
  }
}

function stopCamera() {
  const cameraView = document.getElementById('camera-view');
  const cameraBtn = document.getElementById('camera-btn');

  if (codeReader) {
    codeReader.reset();
    codeReader = null;
  }

  cameraView.classList.add('hidden');
  cameraBtn.disabled = false;
  cameraBtn.textContent = '📷 Open Camera';

  // Refocus input
  document.getElementById('scanner-input').focus();
}

async function processScannedData(data) {
  const statusDiv = document.getElementById('scanner-status');

  // Try to extract PSUS order number
  const psusNumber = extractPSUSNumber(data);

  if (psusNumber) {
    // It's a PSUS order number - open MAO
    showStatus(`Order found: ${psusNumber}. Opening MAO...`, 'success');

    // Copy to clipboard
    await copyToClipboard(psusNumber);

    // Open MAO order status URL
    const url = getMAOOrderURL(psusNumber);
    setTimeout(() => {
      openInNewTab(url);
    }, 500);

  } else {
    // It's a data matrix or other barcode - copy and open inventory
    showStatus(`Data Matrix scanned. Copied to clipboard. Opening inventory...`, 'success');

    // Copy raw data to clipboard
    await copyToClipboard(data);

    // Open inventory system
    const inventoryURL = getInventoryURL();
    setTimeout(() => {
      openInNewTab(inventoryURL);
    }, 500);
  }
}

function showStatus(message, type) {
  const statusDiv = document.getElementById('scanner-status');

  statusDiv.textContent = message;
  statusDiv.className = `scanner-status ${type}`;
  statusDiv.classList.remove('hidden');

  // Hide after 5 seconds
  setTimeout(() => {
    statusDiv.classList.add('hidden');
  }, 5000);
}
