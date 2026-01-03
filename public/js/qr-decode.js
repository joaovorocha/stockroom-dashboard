(function () {
  function $(id) {
    return document.getElementById(id);
  }

  const fileEl = $('qrFile');
  const decodeBtn = $('decodeBtn');
  const statusEl = $('status');
  const decodedEl = $('decoded');

  function setStatus(text) {
    statusEl.textContent = text || '';
  }

  function setDecoded(text) {
    decodedEl.value = text || '';
  }

  async function decodeQrFromFile(file) {
    if (!file) throw new Error('Please choose an image file first.');

    if (!('BarcodeDetector' in window)) {
      throw new Error('QR decoding not supported in this browser (BarcodeDetector missing).');
    }

    const detector = new BarcodeDetector({ formats: ['qr_code'] });

    const bitmap = await createImageBitmap(file);
    try {
      const barcodes = await detector.detect(bitmap);
      if (!barcodes || barcodes.length === 0) {
        return null;
      }
      // Prefer first QR.
      const raw = barcodes[0].rawValue || '';
      return raw;
    } finally {
      try {
        bitmap.close && bitmap.close();
      } catch (e) {}
    }
  }

  async function onDecode() {
    setDecoded('');
    setStatus('Decoding...');

    try {
      const file = fileEl.files && fileEl.files[0];
      const text = await decodeQrFromFile(file);
      if (!text) {
        setStatus('No QR code found in this image. Try a clearer screenshot.');
        return;
      }
      setDecoded(text);
      setStatus('Decoded successfully.');
    } catch (err) {
      setStatus(err && err.message ? err.message : String(err));
    }
  }

  decodeBtn.addEventListener('click', onDecode);
})();
