(function () {
  function $(id) {
    return document.getElementById(id);
  }

  const fileEl = $('qrFile');
  const decodeBtn = $('decodeBtn');
  const statusEl = $('status');
  const decodedEl = $('decoded');
  const supportedEl = $('supported');
  const pastedEl = $('pasted');
  const usePasteBtn = $('usePasteBtn');

  function setStatus(text) {
    statusEl.textContent = text || '';
  }

  function setDecoded(text) {
    decodedEl.value = text || '';
  }

  function setSupported(text) {
    if (!supportedEl) return;
    supportedEl.textContent = text || '';
  }

  async function showSupportedFormats() {
    if (!('BarcodeDetector' in window)) {
      setSupported('BarcodeDetector not available in this browser.');
      return;
    }

    try {
      const formats = (await BarcodeDetector.getSupportedFormats()) || [];
      if (!formats.length) {
        setSupported('Supported formats: (unknown)');
        return;
      }
      setSupported(`Supported formats: ${formats.join(', ')}`);
    } catch {
      setSupported('Supported formats: (unable to detect)');
    }
  }

  async function decodeQrFromFile(file) {
    if (!file) throw new Error('Please choose an image file first.');

    if (!('BarcodeDetector' in window)) {
      throw new Error('QR decoding not supported in this browser (BarcodeDetector missing).');
    }

    // We care about QR (setup) + DataMatrix (common retail codes).
    const detector = new BarcodeDetector({ formats: ['qr_code', 'data_matrix'] });

    const bitmap = await createImageBitmap(file);
    try {
      const barcodes = await detector.detect(bitmap);
      if (!barcodes || barcodes.length === 0) {
        return null;
      }
      // Prefer the first match.
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

  function onUsePaste() {
    const v = (pastedEl?.value || '').toString().trim();
    if (!v) {
      setStatus('Paste something first.');
      return;
    }
    setDecoded(v);
    setStatus('Pasted into output.');
  }

  decodeBtn.addEventListener('click', onDecode);
  usePasteBtn?.addEventListener('click', onUsePaste);
  showSupportedFormats();
})();
