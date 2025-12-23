(function () {
  const listEl = document.getElementById('radioList');
  const emptyEl = document.getElementById('radioEmpty');
  const statusEl = document.getElementById('radioStatus');
  const copyAllBtn = document.getElementById('copyAllBtn');
  const clearUiBtn = document.getElementById('clearUiBtn');

  const controlsEl = document.getElementById('radioControls');
  const serviceStatusEl = document.getElementById('serviceStatus');
  const startServiceBtn = document.getElementById('startServiceBtn');
  const stopServiceBtn = document.getElementById('stopServiceBtn');
  const killRtlBtn = document.getElementById('killRtlBtn');
  const saveCfgBtn = document.getElementById('saveCfgBtn');
  const saveRestartBtn = document.getElementById('saveRestartBtn');
  const cfgMsg = document.getElementById('cfgMsg');

  const cfgFreq = document.getElementById('cfgFreq');
  const cfgGain = document.getElementById('cfgGain');
  const cfgVad = document.getElementById('cfgVad');
  const cfgSquelch = document.getElementById('cfgSquelch');
  const cfgSquelchDelay = document.getElementById('cfgSquelchDelay');
  const cfgPpm = document.getElementById('cfgPpm');

  const audioMeterBar = document.getElementById('audioMeterBar');
  const audioMeterText = document.getElementById('audioMeterText');

  let lastId = 0;
  let allTextCache = [];
  let isPrivileged = false;
  let currentConfig = null;

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  function formatTs(iso) {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso || '';
    }
  }

  function addItem(item) {
    const wrapper = document.createElement('div');
    wrapper.className = 'radio-item';
    wrapper.dataset.id = String(item.id || '');

    const meta = document.createElement('div');
    meta.className = 'radio-item-meta';
    meta.textContent = `${formatTs(item.ts)}\n#${item.id}`;

    const text = document.createElement('div');
    text.className = 'radio-item-text';
    text.textContent = item.text || '';

    const actions = document.createElement('div');
    actions.className = 'radio-item-actions';
    const btn = document.createElement('button');
    btn.textContent = 'Copy';
    btn.addEventListener('click', async () => {
      const ok = await copyToClipboard(item.text || '');
      btn.textContent = ok ? 'Copied' : 'Copy failed';
      setTimeout(() => (btn.textContent = 'Copy'), 900);
    });
    actions.appendChild(btn);

    wrapper.appendChild(meta);
    wrapper.appendChild(text);
    wrapper.appendChild(actions);

    listEl.prepend(wrapper);
  }

  function setCfgMessage(msg) {
    if (!cfgMsg) return;
    cfgMsg.textContent = msg || '';
    if (!msg) return;
    setTimeout(() => {
      cfgMsg.textContent = '';
    }, 2500);
  }

  async function loadConfig() {
    try {
      const resp = await fetch('/api/radio/config', { credentials: 'include' }).then(r => r.json());
      if (!resp || !resp.ok) return;
      isPrivileged = !!resp.privileged;
      if (controlsEl) controlsEl.style.display = isPrivileged ? '' : 'none';
      const cfg = resp.config || {};
      currentConfig = cfg;

      if (cfgFreq) cfgFreq.value = cfg.freq || '';
      if (cfgGain) cfgGain.value = String(cfg.gain ?? '');
      if (cfgVad) cfgVad.value = String(cfg.vadThreshold ?? '');
      if (cfgSquelch) {
        cfgSquelch.value = '0';
        cfgSquelch.disabled = true;
      }
      if (cfgSquelchDelay) {
        cfgSquelchDelay.value = '1';
        cfgSquelchDelay.disabled = true;
      }
      if (cfgPpm) cfgPpm.value = String(cfg.ppm ?? '');
    } catch {}
  }

  function updateAudioMeter(live) {
    if (!audioMeterBar || !audioMeterText) return;
    const energy = Number(live?.energy ?? 0);
    const threshold = Number(live?.threshold ?? currentConfig?.vadThreshold ?? 0.03);
    const speech = !!live?.speech;
    const note = live?.note ? String(live.note) : '';
    const error = live?.error ? String(live.error) : '';

    const scaled = Math.max(0, Math.min(1, energy / Math.max(0.001, threshold * 2)));
    audioMeterBar.style.width = `${Math.round(scaled * 100)}%`;
    audioMeterBar.style.background = speech ? '#2ecc71' : (energy > threshold ? '#f1c40f' : '#95a5a6');
    if (error) {
      audioMeterText.textContent = `Audio: error (${error})`;
      return;
    }
    audioMeterText.textContent = `Audio: ${energy.toFixed(3)} (threshold ${threshold.toFixed(3)})${speech ? ' — voice' : ''}${note ? ` — ${note}` : ''}`;
  }

  async function pollLive() {
    try {
      const resp = await fetch('/api/radio/live', { credentials: 'include' }).then(r => r.json());
      if (!resp || !resp.ok) {
        updateAudioMeter(null);
        return;
      }
      updateAudioMeter(resp.live);
    } catch {
      updateAudioMeter(null);
    }
  }

  async function loadServiceStatus() {
    if (!isPrivileged || !serviceStatusEl) return;
    try {
      const resp = await fetch('/api/radio/service', { credentials: 'include' }).then(r => r.json());
      if (!resp || !resp.ok) return;
      const running = !!resp.running;
      const pid = resp.pid ? ` (pid ${resp.pid})` : '';
      serviceStatusEl.textContent = `Service: ${running ? 'Running' : 'Stopped'}${pid}`;
      if (startServiceBtn) startServiceBtn.disabled = running;
      if (stopServiceBtn) stopServiceBtn.disabled = !running;
    } catch {}
  }

  async function saveConfig({ restart }) {
    if (!isPrivileged) return;
    const body = {
      freq: cfgFreq?.value || '',
      gain: Number(cfgGain?.value || 0),
      vadThreshold: Number(cfgVad?.value || 0.03),
      squelch: Number(cfgSquelch?.value || 0),
      squelchDelay: Number(cfgSquelchDelay?.value || 1),
      ppm: Number(cfgPpm?.value || 0),
      restart: !!restart,
    };
    const resp = await fetch('/api/radio/config', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(r => r.json());
    if (resp && resp.ok) {
      if (Number(body.squelch) > 0) {
        setCfgMessage('Saved. Note: Squelch forced to 0 (keeps audio live).');
      } else {
        setCfgMessage(restart ? 'Saved + restarted' : 'Saved');
      }
      await loadServiceStatus();
    } else {
      setCfgMessage(resp?.error || 'Save failed');
    }
  }

  async function startService() {
    if (!isPrivileged) return;
    const resp = await fetch('/api/radio/service/start', { method: 'POST', credentials: 'include' }).then(r => r.json());
    setCfgMessage(resp?.ok ? 'Service started' : (resp?.error || 'Start failed'));
    await loadServiceStatus();
  }

  async function stopService() {
    if (!isPrivileged) return;
    const resp = await fetch('/api/radio/service/stop', { method: 'POST', credentials: 'include' }).then(r => r.json());
    setCfgMessage(resp?.ok ? 'Service stopped' : (resp?.error || 'Stop failed'));
    await loadServiceStatus();
  }

  async function killRtl() {
    if (!isPrivileged) return;
    const resp = await fetch('/api/radio/rtl/kill', { method: 'POST', credentials: 'include' }).then(r => r.json());
    setCfgMessage(resp?.ok ? 'RTL processes cleared' : 'Kill failed');
  }

  async function poll() {
    try {
      const status = await fetch('/api/radio/status').then(r => r.json());
      const updated = status.updatedAt ? new Date(status.updatedAt).toLocaleString() : '--';
      statusEl.textContent = `Last update: ${updated}`;

      const resp = await fetch(`/api/radio/transcripts?afterId=${encodeURIComponent(lastId)}&limit=200`).then(r => r.json());
      const items = (resp && resp.items) || [];

      const hasAny = items.length > 0 || listEl.children.length > 0;
      if (!hasAny) {
        emptyEl.style.display = '';
        emptyEl.innerHTML = status.exists
          ? 'Service running — waiting for speech…'
          : 'No transcripts yet. Start the service with: <code>python3 radio/transcribe_walkie.py</code>';
      } else {
        emptyEl.style.display = 'none';
      }

      for (const item of items) {
        lastId = Math.max(lastId, Number(item.id || 0));
        allTextCache.push(`[${formatTs(item.ts)}] ${item.text || ''}`.trim());
        addItem(item);
      }
    } catch (e) {
      statusEl.textContent = 'Error loading transcripts (check service / permissions).';
    }
  }

  copyAllBtn.addEventListener('click', async () => {
    const text = allTextCache.slice().reverse().join('\n');
    const ok = await copyToClipboard(text);
    copyAllBtn.textContent = ok ? 'Copied' : 'Copy failed';
    setTimeout(() => (copyAllBtn.textContent = 'Copy All'), 900);
  });

  clearUiBtn.addEventListener('click', () => {
    listEl.innerHTML = '';
    allTextCache = [];
    lastId = 0;
    emptyEl.style.display = '';
  });

  if (startServiceBtn) startServiceBtn.addEventListener('click', startService);
  if (stopServiceBtn) stopServiceBtn.addEventListener('click', stopService);
  if (killRtlBtn) killRtlBtn.addEventListener('click', killRtl);
  if (saveCfgBtn) saveCfgBtn.addEventListener('click', () => saveConfig({ restart: false }));
  if (saveRestartBtn) saveRestartBtn.addEventListener('click', () => saveConfig({ restart: true }));

  loadConfig().then(loadServiceStatus);
  poll();
  setInterval(poll, 2000);
  pollLive();
  setInterval(pollLive, 500);
  setInterval(loadServiceStatus, 5000);
})();
