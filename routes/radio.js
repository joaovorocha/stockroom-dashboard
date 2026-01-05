const express = require('express');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const router = express.Router();

const TRANSCRIPTS_PATH = path.join(__dirname, '..', 'data', 'radio', 'transcripts.jsonl');
const LAST_ID_PATH = path.join(__dirname, '..', 'data', 'radio', '_last_id.txt');
const CONFIG_PATH = path.join(__dirname, '..', 'data', 'radio', 'config.json');
const SERVICE_PATH = path.join(__dirname, '..', 'data', 'radio', 'service.json');
const LOG_PATH = path.join(__dirname, '..', 'logs', 'radio-transcriber.log');

function safeInt(value, fallback = 0) {
  const n = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) ? n : fallback;
}

function safeFloat(value, fallback = 0) {
  const n = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(n) ? n : fallback;
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readLastBytes(filePath, maxBytes) {
  const stat = fs.statSync(filePath);
  const start = Math.max(0, stat.size - maxBytes);
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(stat.size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    return buf.toString('utf8');
  } finally {
    fs.closeSync(fd);
  }
}

function loadTranscripts({ afterId = 0, limit = 200 }) {
  if (!fs.existsSync(TRANSCRIPTS_PATH)) return [];
  const content = readLastBytes(TRANSCRIPTS_PATH, 1024 * 512);
  const lines = content.split('\n').filter(Boolean);
  const items = [];

  for (let i = Math.max(0, lines.length - 2000); i < lines.length; i++) {
    try {
      const obj = JSON.parse(lines[i]);
      if (!obj || typeof obj !== 'object') continue;
      if (safeInt(obj.id, 0) <= afterId) continue;
      items.push(obj);
    } catch {
      // ignore bad line
    }
  }

  items.sort((a, b) => safeInt(a.id, 0) - safeInt(b.id, 0));
  return items.slice(0, limit);
}

function isPrivileged(req) {
  const user = req.user || {};
  return !!(user.isAdmin || user.isManager || user.canConfigRadio);
}

function requirePrivileged(req, res) {
  if (!isPrivileged(req)) {
    res.status(403).json({ ok: false, error: 'Manager access required' });
    return false;
  }
  return true;
}

function defaultConfig() {
  return {
    // Backward-compat: keep top-level freq/ppm/gain in sync with the active channel.
    freq: '446.01875M',
    ppm: 0,
    gain: 0,

    // New: multi-channel support
    channels: [
      { id: 'default', label: 'Default', freq: '446.01875M', ppm: 0, gain: 0 },
    ],
    activeChannelId: 'default',

    squelch: 0,
    squelchDelay: 1,
    // Slightly higher threshold reduces false triggers/CPU on noisy inputs.
    vadThreshold: 0.04,
    // Slightly shorter hangover reduces segment length and ASR work.
    hangoverMs: 600,
    model: 'tiny',
    device: 'cpu',
    computeType: 'int8',
  };
}

function normalizeChannels(channels) {
  const list = Array.isArray(channels) ? channels : [];
  const normalized = list
    .map((c, idx) => {
      const id = String(c?.id || `ch${idx + 1}`).trim();
      const label = String(c?.label || id).trim();
      const freq = String(c?.freq || '').trim();
      if (!freq) return null;
      return {
        id,
        label,
        freq,
        ppm: safeInt(c?.ppm, 0),
        gain: safeInt(c?.gain, 0),
      };
    })
    .filter(Boolean);

  if (normalized.length === 0) {
    return [{ id: 'default', label: 'Default', freq: '446.01875M', ppm: 0, gain: 0 }];
  }
  return normalized;
}

function normalizeConfig(raw) {
  const base = { ...defaultConfig(), ...(raw && typeof raw === 'object' ? raw : {}) };

  // Migrate legacy single-channel config.
  const hasChannels = Array.isArray(raw?.channels) && raw.channels.length > 0;
  const channels = hasChannels
    ? normalizeChannels(raw.channels)
    : normalizeChannels([
        {
          id: 'default',
          label: String(raw?.channelLabel || 'Default'),
          freq: String(raw?.freq || base.freq || '446.01875M'),
          ppm: safeInt(raw?.ppm ?? base.ppm, 0),
          gain: safeInt(raw?.gain ?? base.gain, 0),
        },
      ]);

  let activeChannelId = String(raw?.activeChannelId || base.activeChannelId || channels[0].id || 'default');
  if (!channels.some(c => c.id === activeChannelId)) activeChannelId = channels[0].id;

  const active = channels.find(c => c.id === activeChannelId) || channels[0];
  return {
    ...base,
    channels,
    activeChannelId,
    // Keep legacy fields aligned with active channel.
    freq: active?.freq || base.freq,
    ppm: safeInt(active?.ppm, safeInt(base.ppm, 0)),
    gain: safeInt(active?.gain, safeInt(base.gain, 0)),
  };
}

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      return normalizeConfig(raw);
    }
  } catch {}
  return normalizeConfig(null);
}

function saveConfig(cfg) {
  ensureDir(CONFIG_PATH);
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(normalizeConfig(cfg), null, 2));
}

function execPm2(args) {
  return new Promise((resolve) => {
    const child = spawn('pm2', args, { cwd: path.join(__dirname, '..') });
    let out = '';
    let err = '';
    child.stdout.on('data', d => (out += d.toString()));
    child.stderr.on('data', d => (err += d.toString()));
    child.on('close', code => resolve({ code, out, err }));
  });
}

function readServiceState() {
  try {
    if (!fs.existsSync(SERVICE_PATH)) return null;
    return JSON.parse(fs.readFileSync(SERVICE_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function writeServiceState(state) {
  try {
    ensureDir(SERVICE_PATH);
    fs.writeFileSync(SERVICE_PATH, JSON.stringify(state || {}, null, 2));
  } catch {
    // ignore
  }
}

function isProcessRunning(pid) {
  const n = Number(pid);
  if (!Number.isFinite(n) || n <= 0) return false;
  try {
    process.kill(n, 0);
    return true;
  } catch {
    return false;
  }
}

async function pm2List() {
  const res = await execPm2(['jlist']);
  if (res.code !== 0) return [];
  try {
    return JSON.parse(res.out);
  } catch {
    return [];
  }
}

async function getRadioProc() {
  const list = await pm2List();
  return list.find(p => p?.name === 'radio-transcriber') || null;
}

function buildArgsFromConfig(cfg) {
  const args = [
    path.join(__dirname, '..', 'radio', 'transcribe_walkie.py'),
    '--freq',
    cfg.freq || '446.01875M',
    '--gain',
    String(safeInt(cfg.gain, 0)),
    '--squelch',
    String(safeInt(cfg.squelch, 0)),
    '--squelch-delay',
    String(safeInt(cfg.squelchDelay, 1)),
    '--vad-threshold',
    String(safeFloat(cfg.vadThreshold, 0.03)),
    '--hangover-ms',
    String(safeInt(cfg.hangoverMs, 800)),
    '--model',
    cfg.model || 'tiny',
    '--device',
    cfg.device || 'cpu',
    '--compute-type',
    cfg.computeType || 'int8',
  ];
  const ppm = safeInt(cfg.ppm, 0);
  if (ppm) args.push('--ppm', String(ppm));
  return args;
}

router.get('/status', (req, res) => {
  const exists = fs.existsSync(TRANSCRIPTS_PATH);
  let lastId = 0;
  try {
    if (fs.existsSync(LAST_ID_PATH)) lastId = safeInt(fs.readFileSync(LAST_ID_PATH, 'utf8').trim(), 0);
  } catch {}

  // If the transcription service created the file but hasn't written any lines yet,
  // treat it as "exists" so the UI can show "listening".
  let updatedAt = null;
  if (fs.existsSync(TRANSCRIPTS_PATH)) {
    updatedAt = fs.statSync(TRANSCRIPTS_PATH).mtime.toISOString();
  } else {
    // fall back to service/log presence
    try {
      if (fs.existsSync(SERVICE_PATH)) updatedAt = fs.statSync(SERVICE_PATH).mtime.toISOString();
    } catch {}
  }

  return res.json({
    ok: true,
    exists: exists || fs.existsSync(SERVICE_PATH),
    lastId,
    updatedAt,
  });
});

router.get('/live', (req, res) => {
  const livePath = path.join(__dirname, '..', 'data', 'radio', 'live.json');
  if (!fs.existsSync(livePath)) return res.json({ ok: false, exists: false });
  try {
    const obj = JSON.parse(fs.readFileSync(livePath, 'utf8'));
    return res.json({ ok: true, exists: true, live: obj });
  } catch (e) {
    return res.json({ ok: false, exists: true, error: 'Bad live.json' });
  }
});

// Near-real-time listen buffer (rolling WAV)
router.get('/live-audio', (req, res) => {
  const wavPath = path.join(__dirname, '..', 'data', 'radio', 'live-audio.wav');
  if (!fs.existsSync(wavPath)) return res.status(404).json({ ok: false, error: 'Live audio not available' });
  res.setHeader('Content-Type', 'audio/wav');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Accept-Ranges', 'bytes');
  return res.sendFile(wavPath);
});

router.get('/config', (req, res) => {
  const cfg = loadConfig();
  const privileged = isPrivileged(req);
  return res.json({ ok: true, config: cfg, privileged });
});

router.post('/config', (req, res) => {
  if (!requirePrivileged(req, res)) return;

  const body = req.body || {};
  const prev = loadConfig();

  // Start with previous normalized config.
  const next = { ...prev };

  // Channel updates (preferred)
  if (Array.isArray(body.channels)) {
    next.channels = normalizeChannels(body.channels);
  }
  if (body.activeChannelId != null) {
    next.activeChannelId = String(body.activeChannelId);
  }

  // Legacy single-channel updates apply to the active channel.
  const legacyFreq = body.freq != null ? String(body.freq) : null;
  const legacyPpm = body.ppm != null ? safeInt(body.ppm, prev.ppm) : null;
  const legacyGain = body.gain != null ? safeInt(body.gain, prev.gain) : null;
  const legacyLabel = body.channelLabel != null ? String(body.channelLabel) : null;

  const activeId = String(next.activeChannelId || (next.channels?.[0]?.id ?? 'default'));
  next.channels = normalizeChannels(next.channels);
  next.activeChannelId = next.channels.some(c => c.id === activeId) ? activeId : next.channels[0].id;
  const activeIdx = next.channels.findIndex(c => c.id === next.activeChannelId);
  if (activeIdx >= 0) {
    if (legacyFreq) next.channels[activeIdx].freq = legacyFreq;
    if (legacyLabel) next.channels[activeIdx].label = legacyLabel;
    if (legacyPpm != null) next.channels[activeIdx].ppm = legacyPpm;
    if (legacyGain != null) next.channels[activeIdx].gain = legacyGain;
  }

  const cfg = normalizeConfig({
    ...next,
    // rtl_fm squelch tends to stop PCM output entirely, which breaks live metering and VAD.
    // Keep squelch at 0 and do "squelch-like" behavior via VAD threshold instead.
    squelch: 0,
    squelchDelay: 1,
    vadThreshold: safeFloat(body.vadThreshold ?? next.vadThreshold, next.vadThreshold),
    hangoverMs: safeInt(body.hangoverMs ?? next.hangoverMs, next.hangoverMs),
    model: String(body.model ?? next.model),
    device: String(body.device ?? next.device),
    computeType: String(body.computeType ?? next.computeType),
  });

  saveConfig(cfg);

  const shouldRestart = !!body.restart;
  if (!shouldRestart) return res.json({ ok: true, config: cfg });

  // Restart the python service if it is running
  const state = readServiceState();
  if (state?.pid && isProcessRunning(state.pid)) {
    try {
      process.kill(-state.pid, 'SIGTERM');
    } catch {
      try {
        process.kill(state.pid, 'SIGTERM');
      } catch {}
    }
    writeServiceState({ running: false, stoppedAt: new Date().toISOString() });
  }

  return res.json({ ok: true, config: cfg, restarted: true });
});

router.get('/service', (req, res) => {
  getRadioProc().then((proc) => {
    if (!proc) return res.json({ ok: true, running: false, proc: null });
    const status = proc.pm2_env?.status || 'unknown';
    const pid = proc.pid || null;
    return res.json({ ok: true, running: status === 'online', pid, status, proc: { name: proc.name, pid } });
  });
});

router.post('/service/start', (req, res) => {
  if (!requirePrivileged(req, res)) return;

  (async () => {
    const existing = await getRadioProc();
    if (existing && existing.pm2_env?.status === 'online') {
      return res.json({ ok: true, running: true, pid: existing.pid, alreadyRunning: true });
    }

    ensureDir(LOG_PATH);
    const cfg = loadConfig();
    saveConfig(cfg);

    // pm2 will keep it alive and prevent USB lock leftovers from a dead parent.
    const pm2Args = [
      'start',
      'radio/transcribe_walkie.py',
      '--name',
      'radio-transcriber',
      '--interpreter',
      'python3',
      '--output',
      LOG_PATH,
      '--error',
      LOG_PATH,
      '--',
      '--config',
      CONFIG_PATH,
    ];
    const started = await execPm2(pm2Args);
    const proc = await getRadioProc();
    const status = proc?.pm2_env?.status || 'unknown';
    return res.json({
      ok: started.code === 0 && status === 'online',
      status,
      pid: proc?.pid || null,
      out: started.out,
      err: started.err,
    });
  })();
});

router.post('/service/stop', (req, res) => {
  if (!requirePrivileged(req, res)) return;
  (async () => {
    const stopped = await execPm2(['stop', 'radio-transcriber']);
    const proc = await getRadioProc();
    const status = proc?.pm2_env?.status || 'stopped';
    return res.json({ ok: stopped.code === 0, running: status === 'online', status, out: stopped.out, err: stopped.err });
  })();
});

router.post('/rtl/kill', (req, res) => {
  if (!requirePrivileged(req, res)) return;

  const script = path.join(__dirname, '..', 'scripts', 'rtl-sdr-kill.sh');
  const child = spawn('bash', [script], { cwd: path.join(__dirname, '..') });
  let out = '';
  let err = '';
  child.stdout.on('data', d => (out += d.toString()));
  child.stderr.on('data', d => (err += d.toString()));
  child.on('close', code => {
    return res.json({ ok: code === 0, code, out, err });
  });
});

router.get('/transcripts', (req, res) => {
  const afterId = safeInt(req.query.afterId, 0);
  const limit = Math.min(500, Math.max(1, safeInt(req.query.limit, 200)));
  const items = loadTranscripts({ afterId, limit });
  return res.json({ ok: true, items });
});

// Listen: serve recorded WAV clips (written by the transcriber)
router.get('/clips/:file', (req, res) => {
  const raw = String(req.params.file || '');
  const safe = path.basename(raw);
  if (!safe || safe.includes('..') || !safe.toLowerCase().endsWith('.wav')) {
    return res.status(400).json({ ok: false, error: 'Bad clip filename' });
  }
  const clipPath = path.join(__dirname, '..', 'data', 'radio', 'clips', safe);
  if (!fs.existsSync(clipPath)) return res.status(404).json({ ok: false, error: 'Clip not found' });
  res.setHeader('Content-Type', 'audio/wav');
  // Accept range requests (browser seeking)
  res.setHeader('Accept-Ranges', 'bytes');
  return res.sendFile(clipPath);
});

// Real-time updates (SSE)
// Sends: event: transcript {item}
//        event: live {live}
router.get('/events', (req, res) => {
  // Must be authenticated (router is mounted under /api with auth-by-default)
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');

  const flush = () => {
    try { res.flushHeaders?.(); } catch {}
  };
  flush();

  let afterId = safeInt(req.query.afterId, 0);
  let lastLiveMtime = 0;
  const livePath = path.join(__dirname, '..', 'data', 'radio', 'live.json');

  const writeEvent = (eventName, data) => {
    try {
      res.write(`event: ${eventName}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch {
      // ignore
    }
  };

  // Initial ping
  writeEvent('ready', { ok: true, ts: new Date().toISOString(), afterId });

  const timer = setInterval(() => {
    // Transcripts
    try {
      const items = loadTranscripts({ afterId, limit: 200 });
      for (const item of items) {
        const id = safeInt(item?.id, 0);
        if (id > afterId) afterId = id;
        writeEvent('transcript', item);
      }
    } catch {
      // ignore
    }

    // Live meter
    try {
      if (fs.existsSync(livePath)) {
        const st = fs.statSync(livePath);
        const m = st.mtimeMs || 0;
        if (m > lastLiveMtime) {
          lastLiveMtime = m;
          const obj = JSON.parse(fs.readFileSync(livePath, 'utf8'));
          writeEvent('live', obj);
        }
      }
    } catch {
      // ignore
    }
  }, 400);

  req.on('close', () => {
    clearInterval(timer);
  });
});

module.exports = router;
