(function () {
  const listEl = document.getElementById('radioList');
  const emptyEl = document.getElementById('radioEmpty');
  const statusEl = document.getElementById('radioStatus');
  const copyAllBtn = document.getElementById('copyAllBtn');
  const clearUiBtn = document.getElementById('clearUiBtn');
  const listenLiveBtn = document.getElementById('listenLiveBtn');
  const listenLiveStatus = document.getElementById('listenLiveStatus');
  const liveAudio = document.getElementById('liveAudio');

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

  // --- Live audio monitor (WebSocket -> WebAudio) ---
  const monitor = {
    ws: null,
    audioCtx: null,
    processor: null,
    sourceSampleRate: 24000,
    queue: [],
    queueOffset: 0,
    queuedSamples: 0,
    enabled: false,
    lastAudioAt: 0,
    fallbackTimer: null,
    fallbackOn: false,
  };

  function setListenStatus(text) {
    if (!listenLiveStatus) return;
    listenLiveStatus.textContent = text || 'Live listen: --';
  }

  function int16ToFloat32(int16) {
    const out = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) out[i] = int16[i] / 32768;
    return out;
  }

  function resampleLinear(input, srcRate, dstRate) {
    if (!input || input.length === 0) return new Float32Array(0);
    if (!srcRate || !dstRate || srcRate === dstRate) return input;
    const ratio = dstRate / srcRate;
    const outLen = Math.max(1, Math.round(input.length * ratio));
    const out = new Float32Array(outLen);
    const maxIdx = input.length - 1;
    for (let i = 0; i < outLen; i++) {
      const x = i / ratio;
      const x0 = Math.floor(x);
      const x1 = Math.min(maxIdx, x0 + 1);
      const t = x - x0;
      const a = input[x0] || 0;
      const b = input[x1] || 0;
      out[i] = a + (b - a) * t;
    }
    return out;
  }

  function enqueueAudio(f32) {
    if (!f32 || !f32.length) return;
    monitor.queue.push(f32);
    monitor.queuedSamples += f32.length;
    // Keep a small jitter buffer (does not limit streaming).
    const max = (monitor.audioCtx?.sampleRate || 48000) * 10;
    while (monitor.queuedSamples > max && monitor.queue.length > 1) {
      const dropped = monitor.queue.shift();
      monitor.queuedSamples -= (dropped?.length || 0);
      monitor.queueOffset = 0;
    }
  }

  function startAudioPump() {
    if (!monitor.audioCtx) return;
    if (monitor.processor) return;

    // ScriptProcessorNode is deprecated but widely supported; fine for internal tool.
    const bufSize = 2048;
    const proc = monitor.audioCtx.createScriptProcessor(bufSize, 0, 1);
    proc.onaudioprocess = (e) => {
      const out = e.outputBuffer.getChannelData(0);
      let i = 0;
      while (i < out.length) {
        if (monitor.queue.length === 0) {
          out[i++] = 0;
          continue;
        }
        const cur = monitor.queue[0];
        const avail = cur.length - monitor.queueOffset;
        const n = Math.min(avail, out.length - i);
        out.set(cur.subarray(monitor.queueOffset, monitor.queueOffset + n), i);
        monitor.queueOffset += n;
        monitor.queuedSamples -= n;
        i += n;
        if (monitor.queueOffset >= cur.length) {
          monitor.queue.shift();
          monitor.queueOffset = 0;
        }
      }
    };
    proc.connect(monitor.audioCtx.destination);
    monitor.processor = proc;
  }

  async function startLiveListen() {
    if (monitor.enabled) return;
    monitor.enabled = true;
    setListenStatus('Live listen: Connecting…');

    try {
      monitor.audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
    } catch {
      monitor.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }

    try {
      await monitor.audioCtx.resume();
    } catch {}

    startAudioPump();

    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${window.location.host}/ws/radio-monitor`;
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    monitor.ws = ws;

    ws.onopen = () => {
      setListenStatus('Live listen: On');
      if (listenLiveBtn) listenLiveBtn.textContent = 'Stop Listening';
    };

    ws.onmessage = (ev) => {
      if (!monitor.audioCtx) return;
      if (typeof ev.data === 'string') {
        try {
          const msg = JSON.parse(ev.data);
          if (msg && msg.type === 'hello' && msg.sampleRate) {
            monitor.sourceSampleRate = Number(msg.sampleRate) || monitor.sourceSampleRate;
          }
        } catch {}
        return;
      }

      try {
        const ab = ev.data;
        const i16 = new Int16Array(ab);
        let f32 = int16ToFloat32(i16);
        const dstRate = monitor.audioCtx.sampleRate || 48000;
        f32 = resampleLinear(f32, monitor.sourceSampleRate, dstRate);
        enqueueAudio(f32);
        monitor.lastAudioAt = Date.now();
        if (monitor.fallbackOn && liveAudio) {
          try { liveAudio.pause(); } catch {}
          liveAudio.removeAttribute('src');
          liveAudio.load();
          monitor.fallbackOn = false;
        }
        setListenStatus('Live listen: On');
      } catch {}
    };

    ws.onerror = () => {
      // handled by close
    };

    ws.onclose = () => {
      stopLiveListen();
    };

    monitor.fallbackTimer = setInterval(() => {
      if (!monitor.enabled) return;
      const age = monitor.lastAudioAt ? (Date.now() - monitor.lastAudioAt) : 99999;
      if (age > 2000 && liveAudio && !monitor.fallbackOn) {
        liveAudio.src = `/api/radio/live-audio?ts=${Date.now()}`;
        liveAudio.play().then(() => {
          monitor.fallbackOn = true;
          setListenStatus('Live listen: Fallback stream');
        }).catch(() => {
          setListenStatus('Live listen: Tap to allow audio');
        });
      }
    }, 800);
  }

  function stopLiveListen() {
    if (!monitor.enabled) {
      if (listenLiveBtn) listenLiveBtn.textContent = 'Listen Live';
      return;
    }
    monitor.enabled = false;
    setListenStatus('Live listen: Off');
    monitor.lastAudioAt = 0;
    if (monitor.fallbackTimer) {
      clearInterval(monitor.fallbackTimer);
      monitor.fallbackTimer = null;
    }
    if (liveAudio) {
      try { liveAudio.pause(); } catch {}
      liveAudio.removeAttribute('src');
      liveAudio.load();
    }
    monitor.fallbackOn = false;

    try { monitor.ws?.close(); } catch {}
    monitor.ws = null;

    try { monitor.processor?.disconnect(); } catch {}
    monitor.processor = null;

    try { monitor.audioCtx?.close(); } catch {}
    monitor.audioCtx = null;

    monitor.queue = [];
    monitor.queueOffset = 0;
    monitor.queuedSamples = 0;
    if (listenLiveBtn) listenLiveBtn.textContent = 'Listen Live';
  }

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
    const channelLabel = item?.channelLabel ? String(item.channelLabel) : '';
    meta.textContent = `${formatTs(item.ts)}${channelLabel ? `\n${channelLabel}` : ''}\n#${item.id}`;

    const text = document.createElement('div');
    text.className = 'radio-item-text';
    text.textContent = item.text || '';

    const actions = document.createElement('div');
    actions.className = 'radio-item-actions';

    if (item?.clipUrl) {
      const audio = document.createElement('audio');
      audio.controls = true;
      audio.preload = 'none';
      audio.src = String(item.clipUrl);
      audio.style.width = '220px';
      audio.style.display = 'block';
      audio.style.marginBottom = '8px';
      actions.appendChild(audio);
    }

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
      const captureRunning = !!resp?.capture?.running;
      const transcriberRunning = !!resp?.transcriber?.running;
      const capPid = resp?.capture?.pid ? `pid ${resp.capture.pid}` : 'no pid';
      const trPid = resp?.transcriber?.pid ? `pid ${resp.transcriber.pid}` : 'no pid';
      serviceStatusEl.textContent = `Capture: ${captureRunning ? 'Running' : 'Stopped'} (${capPid}) • Transcriber: ${transcriberRunning ? 'Running' : 'Stopped'} (${trPid})`;
      const anyRunning = captureRunning || transcriberRunning;
      if (startServiceBtn) startServiceBtn.disabled = anyRunning;
      if (stopServiceBtn) stopServiceBtn.disabled = !anyRunning;
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

  let liveApplyTimer = null;
  function scheduleLiveApply() {
    if (!isPrivileged) return;
    if (liveApplyTimer) clearTimeout(liveApplyTimer);
    liveApplyTimer = setTimeout(() => {
      saveConfig({ restart: false });
    }, 450);
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

  if (listenLiveBtn) {
    listenLiveBtn.addEventListener('click', () => {
      if (monitor.enabled) stopLiveListen();
      else startLiveListen();
    });
  }

  // Hot-apply config while service runs (no PM2 restart).
  if (cfgFreq) cfgFreq.addEventListener('input', scheduleLiveApply);
  if (cfgGain) cfgGain.addEventListener('input', scheduleLiveApply);
  if (cfgVad) cfgVad.addEventListener('input', scheduleLiveApply);
  if (cfgPpm) cfgPpm.addEventListener('input', scheduleLiveApply);

  loadConfig().then(loadServiceStatus);

  // Prefer real-time SSE; fall back to polling if it fails.
  let startedSse = false;
  function startSse() {
    if (startedSse) return;
    if (typeof EventSource === 'undefined') return;
    startedSse = true;
    try {
      const url = `/api/radio/events?afterId=${encodeURIComponent(lastId)}`;
      const es = new EventSource(url);

      es.addEventListener('transcript', (e) => {
        try {
          const item = JSON.parse(e.data);
          lastId = Math.max(lastId, Number(item?.id || 0));
          allTextCache.push(`[${formatTs(item?.ts)}] ${item?.text || ''}`.trim());
          addItem(item);
          emptyEl.style.display = 'none';
        } catch {}
      });

      es.addEventListener('live', (e) => {
        try {
          const live = JSON.parse(e.data);
          updateAudioMeter(live);
        } catch {}
      });

      es.onerror = () => {
        try { es.close(); } catch {}
        startedSse = false;
        // Fall back to polling.
        poll();
        setInterval(poll, 2000);
        pollLive();
        setInterval(pollLive, 500);
      };
    } catch {
      startedSse = false;
    }
  }

  // Initial load (fills empty state, grabs any backlog)
  poll();
  startSse();

  setInterval(loadServiceStatus, 5000);
})();
