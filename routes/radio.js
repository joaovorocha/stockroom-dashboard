const express = require('express');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { getLogsDir } = require('../utils/paths');

const router = express.Router();

const RADIO_DATA_DIR = path.join(__dirname, '..', 'data', 'radio');
const TRANSCRIPTS_PATH = path.join(RADIO_DATA_DIR, 'transcripts.jsonl');
const LAST_ID_PATH = path.join(RADIO_DATA_DIR, '_last_id.txt');
const CONFIG_PATH = path.join(RADIO_DATA_DIR, 'config.json');
const CONFIG_LIVE_PATH = path.join(RADIO_DATA_DIR, 'config.live.json');
const SERVICE_PATH = path.join(RADIO_DATA_DIR, 'service.json');
const FINDER_PATH = path.join(RADIO_DATA_DIR, 'finder.json');

const LOGS_DIR = getLogsDir();
const RADIO_LOG_PATH = path.join(LOGS_DIR, 'radio.log');
const TRANSCRIBE_LOG_PATH = path.join(LOGS_DIR, 'radio-transcriber.log');

const PMR446_CENTERS_HZ = [
  446006250, 446018750, 446031250, 446043750,
  446056250, 446068750, 446081250, 446093750,
  446106250, 446118750, 446131250, 446143750,
  446156250, 446168750, 446181250, 446193750,
];

function parseFreqToHz(text) {
  const s = String(text || '').trim();
  const m = s.match(/([0-9.]+)\s*M/i);
  if (m) return Math.round(parseFloat(m[1]) * 1e6);
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return n < 10000 ? Math.round(n * 1e6) : Math.round(n);
}

function nearestPmr446(hz) {
  if (!Number.isFinite(hz)) return null;
  let best = PMR446_CENTERS_HZ[0];
  let bestDiff = Math.abs(best - hz);
  for (const v of PMR446_CENTERS_HZ) {
    const d = Math.abs(v - hz);
    if (d < bestDiff) { best = v; bestDiff = d; }
  }
  return { centerHz: best, diffHz: hz - best };
}

const VENV_PYTHON = path.join(__dirname, '..', '.venv', 'bin', 'python');
const PYTHON_INTERPRETER = fs.existsSync(VENV_PYTHON) ? VENV_PYTHON : 'python3';

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
      // Backfill audio clip URL when older transcript entries lack it.
      if (!obj.clipUrl) {
        const id = safeInt(obj.id, 0);
        if (id > 0) {
          const guess = path.join(RADIO_DATA_DIR, 'clips', `${id}.wav`);
          if (fs.existsSync(guess)) {
            obj.clipUrl = `/api/radio/clips/${id}.wav`;
          }
        }
      }
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
  return !!(user.isAdmin || user.isManager);
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
    ppm: 2,
    gain: 35,

    // New: multi-channel support
    channels: [
      { id: 'pmr446-ch1', label: 'Channel 1', freq: '446.00625M', ppm: 2, gain: 35, ctcssHz: null, dcsCode: null },
      { id: 'pmr446-ch2', label: 'Channel 2', freq: '446.01875M', ppm: 2, gain: 35, ctcssHz: null, dcsCode: null },
      { id: 'pmr446-ch3', label: 'Channel 3', freq: '446.03125M', ppm: 2, gain: 35, ctcssHz: null, dcsCode: null },
      { id: 'pmr446-ch4', label: 'Channel 4', freq: '446.04375M', ppm: 2, gain: 35, ctcssHz: null, dcsCode: null },
      { id: 'pmr446-ch5', label: 'Channel 5', freq: '446.05625M', ppm: 2, gain: 35, ctcssHz: null, dcsCode: null },
      { id: 'pmr446-ch6', label: 'Channel 6', freq: '446.06875M', ppm: 2, gain: 35, ctcssHz: null, dcsCode: null },
      { id: 'pmr446-ch7', label: 'Channel 7', freq: '446.08125M', ppm: 2, gain: 35, ctcssHz: null, dcsCode: null },
      { id: 'pmr446-ch8', label: 'Channel 8', freq: '446.09375M', ppm: 2, gain: 35, ctcssHz: null, dcsCode: null },
      { id: 'pmr446-ch9', label: 'Channel 9', freq: '446.10625M', ppm: 2, gain: 35, ctcssHz: null, dcsCode: null },
      { id: 'pmr446-ch10', label: 'Channel 10', freq: '446.11875M', ppm: 2, gain: 35, ctcssHz: null, dcsCode: null },
      { id: 'pmr446-ch11', label: 'Channel 11', freq: '446.13125M', ppm: 2, gain: 35, ctcssHz: null, dcsCode: null },
      { id: 'pmr446-ch12', label: 'Channel 12', freq: '446.14375M', ppm: 2, gain: 35, ctcssHz: null, dcsCode: null },
      { id: 'pmr446-ch13', label: 'Channel 13', freq: '446.15625M', ppm: 2, gain: 35, ctcssHz: null, dcsCode: null },
      { id: 'pmr446-ch14', label: 'Channel 14', freq: '446.16875M', ppm: 2, gain: 35, ctcssHz: null, dcsCode: null },
      { id: 'pmr446-ch15', label: 'Channel 15', freq: '446.18125M', ppm: 2, gain: 35, ctcssHz: null, dcsCode: null },
      { id: 'pmr446-ch16', label: 'Channel 16', freq: '446.19375M', ppm: 2, gain: 35, ctcssHz: null, dcsCode: null },
    ],
    activeChannelId: 'pmr446-ch2',

    squelch: 0,
    squelchDelay: 1,
    // Slightly higher threshold reduces false triggers/CPU on noisy inputs.
    vadThreshold: 0.04,
    // Slightly shorter hangover reduces segment length and ASR work.
    hangoverMs: 600,
    // Pre-roll to avoid cutting initial syllables.
    preRollMs: 250,

    // Admin UI helpers (hardware model + mode). These are not used by the radio pipeline directly,
    // but allow the admin page to keep track of which preset the user is targeting.
    radioMode: 'automatic',
    radioModel: 'motorola-clp446e',
    radioChannelPlan: 'pmr446-16',

    // Automatic scan tuning (used by radio_service.py when radioMode=automatic)
    scanDeltaDb: 8,
    scanHoldS: 1.0,
    scanConfirmN: 3,
    scanMaxChannels: 5,
    scanFocusId: 'pmr446-ch2',
    scanFocusMarginDb: 3,
    finderWindowS: 300,
    finderMinSamples: 10,

    model: 'tiny',
    device: 'auto',
    computeType: 'int8',

    // Audio processing
    compressor: {
      enabled: true,
      threshold: -26,
      ratio: 6,
      attack: 0.003,
      release: 0.08,
      makeupGain: 18,
    },
    carrierThreshold: 18,
    gateHoldTime: 0.1,
    defaultPpm: 2,
    defaultGain: 35,
    forceDefaults: true,
    audioConditioning: {
      enabled: true,
      highpassHz: 200,
      lowpassHz: 3800,
      compressor: {
        threshold: 0.125,
        ratio: 4,
        attackMs: 10,
        releaseMs: 200,
        makeup: 2,
      },
      limiter: {
        limit: 0.9,
        attackMs: 5,
        releaseMs: 50,
      },
    },
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
      const ctcssHzRaw = c?.ctcssHz ?? c?.ctcss ?? null;
      const ctcssHz = Number.isFinite(Number(ctcssHzRaw)) ? Number(ctcssHzRaw) : null;
      const dcsCodeRaw = c?.dcsCode ?? c?.dcs ?? null;
      const dcsCode = (dcsCodeRaw == null || String(dcsCodeRaw).trim() === '') ? null : String(dcsCodeRaw).trim();
      return {
        id,
        label,
        freq,
        ppm: safeInt(c?.ppm, 0),
        gain: safeInt(c?.gain, 0),
        ctcssHz: ctcssHz && ctcssHz > 0 ? ctcssHz : null,
        dcsCode,
        scanEnabled: c?.scanEnabled !== false,
      };
    })
    .filter(Boolean);

  if (normalized.length === 0) {
    return [{ id: 'default', label: 'Default', freq: '446.01875M', ppm: 0, gain: 0, ctcssHz: null, dcsCode: null }];
  }
  return normalized;
}

function normalizeConfig(raw) {
  const base = { ...defaultConfig(), ...(raw && typeof raw === 'object' ? raw : {}) };

  if (base.forceDefaults) {
    if (!Number.isFinite(base.defaultPpm)) base.defaultPpm = 2;
    if (!Number.isFinite(base.defaultGain)) base.defaultGain = 35;
  }

  // Migrate legacy single-channel config.
  const hasChannels = Array.isArray(raw?.channels) && raw.channels.length > 0;
  let channels = hasChannels
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

  if (base.forceDefaults) {
    channels = channels.map((ch) => ({
      ...ch,
      ppm: Number.isFinite(ch.ppm) && ch.ppm !== 0 ? ch.ppm : base.defaultPpm,
      gain: Number.isFinite(ch.gain) && ch.gain !== 0 ? ch.gain : base.defaultGain,
    }));
  }

  let activeChannelId = String(raw?.activeChannelId || base.activeChannelId || channels[0].id || 'default');
  if (!channels.some(c => c.id === activeChannelId)) activeChannelId = channels[0].id;

  const active = channels.find(c => c.id === activeChannelId) || channels[0];
  const normalized = {
    ...base,
    channels,
    activeChannelId,
    // Keep legacy fields aligned with active channel.
    freq: active?.freq || base.freq,
    ppm: safeInt(active?.ppm, safeInt(base.ppm, 0)),
    gain: safeInt(active?.gain, safeInt(base.gain, 0)),
  };

  if (normalized.radioChannelPlan === 'pmr446-16') {
    const warnings = [];
    normalized.channels = (normalized.channels || []).map((ch) => {
      const parsed = parseFreqToHz(ch.freq);
      if (!Number.isFinite(parsed)) {
        warnings.push({ id: ch.id, issue: 'invalid_freq', freq: ch.freq });
        return ch;
      }
      const nearest = nearestPmr446(parsed);
      if (!nearest) return ch;
      if (Math.abs(nearest.diffHz) >= 2500) {
        warnings.push({ id: ch.id, issue: 'non_pmr446', freq: ch.freq, nearestHz: nearest.centerHz, offsetHz: nearest.diffHz });
      }
      return ch;
    });
    normalized.validation = { warnings };
  }

  return normalized;
}

function loadConfigFrom(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return normalizeConfig(raw);
    }
  } catch {}
  return null;
}

function loadSavedConfig() {
  return loadConfigFrom(CONFIG_PATH) || normalizeConfig(null);
}

function ensureSavedConfigFile() {
  // Service start/stop actions should not implicitly commit draft config.
  // We only ensure the saved config file exists so PM2 processes have a stable --config path.
  if (fs.existsSync(CONFIG_PATH)) return;
  const cfg = loadSavedConfig();
  saveConfigTo(CONFIG_PATH, cfg);
}

function loadEffectiveConfig() {
  const live = loadConfigFrom(CONFIG_LIVE_PATH);
  if (live) return { cfg: live, source: 'live' };
  return { cfg: loadSavedConfig(), source: 'saved' };
}

function saveConfigTo(filePath, cfg) {
  ensureDir(filePath);
  fs.writeFileSync(filePath, JSON.stringify(normalizeConfig(cfg), null, 2));
}

function deleteLiveConfig() {
  try {
    if (fs.existsSync(CONFIG_LIVE_PATH)) fs.unlinkSync(CONFIG_LIVE_PATH);
  } catch {
    // ignore
  }
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

function statFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return { exists: false };
    const st = fs.statSync(filePath);
    return {
      exists: true,
      size: st.size,
      mtime: st.mtime.toISOString(),
      ageMs: Date.now() - st.mtimeMs,
    };
  } catch (e) {
    return { exists: false, error: e?.message || 'stat failed' };
  }
}

function sniffWavHeader(filePath) {
  try {
    if (!fs.existsSync(filePath)) return { ok: false };
    const fd = fs.openSync(filePath, 'r');
    try {
      const buf = Buffer.alloc(12);
      const read = fs.readSync(fd, buf, 0, buf.length, 0);
      if (read < 12) return { ok: false };
      const riff = buf.slice(0, 4).toString('ascii');
      const wave = buf.slice(8, 12).toString('ascii');
      return { ok: riff === 'RIFF' && wave === 'WAVE', riff, wave };
    } finally {
      fs.closeSync(fd);
    }
  } catch (e) {
    return { ok: false, error: e?.message || 'read failed' };
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
  return {
    radio: list.find(p => p?.name === 'radio') || null,
    transcriber: list.find(p => p?.name === 'radio-transcriber') || null,
  };
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

function buildRadioStartArgs() {
  return [
    'start',
    'radio/radio_service.py',
    '--name',
    'radio',
    '--interpreter',
    PYTHON_INTERPRETER,
    '--output',
    RADIO_LOG_PATH,
    '--error',
    RADIO_LOG_PATH,
    '--',
    '--config',
    CONFIG_PATH,
  ];
}

function buildTranscriberStartArgs() {
  return [
    'start',
    'radio/transcribe_worker.py',
    '--name',
    'radio-transcriber',
    '--interpreter',
    PYTHON_INTERPRETER,
    '--restart-delay',
    '2000',
    '--exp-backoff-restart-delay',
    '2000',
    '--max-memory-restart',
    '1500M',
    '--output',
    TRANSCRIBE_LOG_PATH,
    '--error',
    TRANSCRIBE_LOG_PATH,
    '--',
    '--config',
    CONFIG_PATH,
  ];
}

async function pm2EnsureStarted(procName, startArgs) {
  const list = await pm2List();
  const exists = list.some(p => p?.name === procName);
  if (exists) return execPm2(['restart', procName]);
  return execPm2(startArgs);
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
  const livePath = path.join(RADIO_DATA_DIR, 'live.json');
  if (!fs.existsSync(livePath)) return res.json({ ok: false, exists: false });
  try {
    const obj = JSON.parse(fs.readFileSync(livePath, 'utf8'));
    return res.json({ ok: true, exists: true, live: obj });
  } catch (e) {
    return res.json({ ok: false, exists: true, error: 'Bad live.json' });
  }
});

router.get('/finder', (req, res) => {
  if (!fs.existsSync(FINDER_PATH)) return res.json({ ok: false, exists: false });
  try {
    const obj = JSON.parse(fs.readFileSync(FINDER_PATH, 'utf8'));
    return res.json({ ok: true, exists: true, finder: obj });
  } catch (e) {
    return res.json({ ok: false, exists: true, error: 'Bad finder.json' });
  }
});

// Near-real-time listen buffer (rolling WAV)
router.get('/live-audio', (req, res) => {
  const wavPath = path.join(RADIO_DATA_DIR, 'live-audio.wav');
  if (!fs.existsSync(wavPath)) return res.status(404).json({ ok: false, error: 'Live audio not available' });
  res.setHeader('Content-Type', 'audio/wav');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Accept-Ranges', 'bytes');
  return res.sendFile(wavPath);
});

router.get('/config', (req, res) => {
  const { cfg, source } = loadEffectiveConfig();
  const privileged = isPrivileged(req);
  return res.json({ ok: true, config: cfg, privileged, draft: source === 'live' });
});

router.post('/config', async (req, res) => {
  if (!requirePrivileged(req, res)) return;

  const body = req.body || {};
  if (body.discardDraft) {
    deleteLiveConfig();
    const { cfg } = loadEffectiveConfig();
    return res.json({ ok: true, config: cfg, discarded: true });
  }

  const prevEffective = loadEffectiveConfig().cfg;
  const prevSaved = loadSavedConfig();
  const commit = body.commit !== false; // default true (backward compatible)
  const prev = commit ? prevSaved : prevEffective;

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

  // Handle compressor settings
  const compressorObj = body.compressor || next.compressor || {};
  const compressor = {
    enabled: compressorObj.enabled !== false,
    threshold: safeFloat(compressorObj.threshold, -20),
    ratio: safeFloat(compressorObj.ratio, 6),
    attack: safeFloat(compressorObj.attack, 0.003),
    release: safeFloat(compressorObj.release, 0.08),
    makeupGain: safeFloat(compressorObj.makeupGain, 18),
  };

  // Handle carrier detection settings
  const carrierThreshold = safeInt(body.carrierThreshold ?? next.carrierThreshold, 18);
  const gateHoldTime = safeFloat(body.gateHoldTime ?? next.gateHoldTime, 0.1);

  const cfg = normalizeConfig({
    ...next,
    radioMode: String(body.radioMode ?? next.radioMode ?? 'manual'),
    radioModel: String(body.radioModel ?? next.radioModel ?? 'generic'),
    radioChannelPlan: String(body.radioChannelPlan ?? next.radioChannelPlan ?? 'custom'),
    scanDeltaDb: safeFloat(body.scanDeltaDb ?? next.scanDeltaDb, next.scanDeltaDb ?? 8),
    scanHoldS: safeFloat(body.scanHoldS ?? next.scanHoldS, next.scanHoldS ?? 1.0),
    scanConfirmN: safeInt(body.scanConfirmN ?? next.scanConfirmN, next.scanConfirmN ?? 3),
    // Noise squelch is implemented in the python pipeline; keep this value configurable.
    squelch: safeFloat(body.squelch ?? next.squelch, next.squelch),
    squelchDelay: safeFloat(body.squelchDelay ?? next.squelchDelay, next.squelchDelay),
    vadThreshold: safeFloat(body.vadThreshold ?? next.vadThreshold, next.vadThreshold),
    hangoverMs: safeInt(body.hangoverMs ?? next.hangoverMs, next.hangoverMs),
    model: String(body.model ?? next.model),
    device: String(body.device ?? next.device),
    computeType: String(body.computeType ?? next.computeType),
    compressor,
    carrierThreshold,
    gateHoldTime,
  });

  if (commit) {
    saveConfigTo(CONFIG_PATH, cfg);
    deleteLiveConfig();
  } else {
    saveConfigTo(CONFIG_LIVE_PATH, cfg);
  }

  const shouldRestart = !!body.restart;
  if (!shouldRestart) return res.json({ ok: true, config: cfg, draft: !commit });

  // Restart PM2 processes so tuner/model changes apply immediately (rarely needed; most settings hot-apply).
  const restartedRadio = await execPm2(['restart', 'radio']);
  const restartedTranscriber = await execPm2(['restart', 'radio-transcriber']);
  return res.json({
    ok: restartedRadio.code === 0 && restartedTranscriber.code === 0,
    config: cfg,
    draft: !commit,
    restarted: true,
    radio: { out: restartedRadio.out, err: restartedRadio.err },
    transcriber: { out: restartedTranscriber.out, err: restartedTranscriber.err },
  });
});

router.get('/service', (req, res) => {
  getRadioProc().then((procs) => {
    const radioStatus = procs?.radio?.pm2_env?.status || 'stopped';
    const transcriberStatus = procs?.transcriber?.pm2_env?.status || 'stopped';
    const radioRunning = radioStatus === 'online';
    const transcriberRunning = transcriberStatus === 'online';
    return res.json({
      ok: true,
      running: radioRunning || transcriberRunning,
      radio: {
        running: radioRunning,
        status: radioStatus,
        pid: procs?.radio?.pid || null,
        name: procs?.radio?.name || 'radio'
      },
      transcriber: {
        running: transcriberRunning,
        status: transcriberStatus,
        pid: procs?.transcriber?.pid || null,
        name: procs?.transcriber?.name || 'radio-transcriber'
      }
    });
  });
});

router.get('/diagnostics', (req, res) => {
  if (!requirePrivileged(req, res)) return;
  (async () => {
    const procs = await getRadioProc();
    const livePath = path.join(RADIO_DATA_DIR, 'live.json');
    const segmentsPath = path.join(RADIO_DATA_DIR, 'segments.jsonl');
    const liveAudioPath = path.join(RADIO_DATA_DIR, 'live-audio.wav');
    const transcriptsPath = path.join(RADIO_DATA_DIR, 'transcripts.jsonl');
    const metricsPath = path.join(RADIO_DATA_DIR, 'openvino_metrics.json');

    const liveStat = statFile(livePath);
    const segmentsStat = statFile(segmentsPath);
    const liveAudioStat = statFile(liveAudioPath);
    const transcriptsStat = statFile(transcriptsPath);
    const metricsStat = statFile(metricsPath);
    const wavHeader = sniffWavHeader(liveAudioPath);

    const stale = {
      live: liveStat.exists ? liveStat.ageMs > 30000 : true,
      segments: segmentsStat.exists ? segmentsStat.ageMs > 120000 : true,
      liveAudio: liveAudioStat.exists ? liveAudioStat.ageMs > 30000 : true,
      metrics: metricsStat.exists ? metricsStat.ageMs > 300000 : true,
    };

    return res.json({
      ok: true,
      now: new Date().toISOString(),
      pm2: {
        radio: {
          status: procs?.radio?.pm2_env?.status || 'stopped',
          pid: procs?.radio?.pid || null,
        },
        transcriber: {
          status: procs?.transcriber?.pm2_env?.status || 'stopped',
          pid: procs?.transcriber?.pid || null,
        },
      },
      files: {
        live: liveStat,
        segments: segmentsStat,
        liveAudio: liveAudioStat,
        transcripts: transcriptsStat,
        openvinoMetrics: metricsStat,
        wavHeader,
      },
      stale,
    });
  })();
});

router.post('/diagnostics/repair', (req, res) => {
  if (!requirePrivileged(req, res)) return;
  (async () => {
    const actions = [];
    const diag = await new Promise((resolve) => {
      const livePath = path.join(RADIO_DATA_DIR, 'live.json');
      const segmentsPath = path.join(RADIO_DATA_DIR, 'segments.jsonl');
      const liveAudioPath = path.join(RADIO_DATA_DIR, 'live-audio.wav');
      const metricsPath = path.join(RADIO_DATA_DIR, 'openvino_metrics.json');

      const liveStat = statFile(livePath);
      const segmentsStat = statFile(segmentsPath);
      const liveAudioStat = statFile(liveAudioPath);
      const metricsStat = statFile(metricsPath);

      resolve({ liveStat, segmentsStat, liveAudioStat, metricsStat });
    });

    const shouldRestartRadio = diag.liveStat.ageMs > 30000 || diag.liveAudioStat.ageMs > 30000 || !diag.liveStat.exists;
    const shouldRestartTranscriber = diag.segmentsStat.ageMs > 120000 || !diag.segmentsStat.exists || diag.metricsStat.ageMs > 300000;

    if (shouldRestartRadio) {
      actions.push('restart radio');
      await execPm2(['restart', 'radio']);
    }
    if (shouldRestartTranscriber) {
      actions.push('restart radio-transcriber');
      await execPm2(['restart', 'radio-transcriber']);
    }

    return res.json({ ok: true, actions });
  })();
});


router.post('/service/start', (req, res) => {
  if (!requirePrivileged(req, res)) return;

  (async () => {
    const existing = await getRadioProc();
    const radioOnline = existing?.radio?.pm2_env?.status === 'online';
    const transcriberOnline = existing?.transcriber?.pm2_env?.status === 'online';
    if (radioOnline && transcriberOnline) {
      return res.json({ ok: true, running: true, alreadyRunning: true, radioPid: existing.radio.pid, transcriberPid: existing.transcriber.pid });
    }

    // Stop legacy processes if they exist.
    try { await execPm2(['stop', 'radio-capture']); } catch {}

    ensureDir(RADIO_LOG_PATH);
    ensureDir(TRANSCRIBE_LOG_PATH);
    ensureSavedConfigFile();

    // Start radio service (RTL-SDR -> live audio + analyzer + segments)
    const radioArgs = buildRadioStartArgs();

    // Start transcriber (separate worker; reads segments -> writes transcripts)
    const transcribeArgs = buildTranscriberStartArgs();

    const startedRadio = radioOnline ? { code: 0, out: '', err: '' } : await execPm2(radioArgs);
    const startedTranscriber = transcriberOnline ? { code: 0, out: '', err: '' } : await execPm2(transcribeArgs);

    const procs = await getRadioProc();
    const radioStatus = procs?.radio?.pm2_env?.status || 'unknown';
    const transcriberStatus = procs?.transcriber?.pm2_env?.status || 'unknown';
    const ok = (startedRadio.code === 0 && radioStatus === 'online') || (startedTranscriber.code === 0 && transcriberStatus === 'online');

    return res.json({
      ok,
      radio: { status: radioStatus, pid: procs?.radio?.pid || null, out: startedRadio.out, err: startedRadio.err },
      transcriber: { status: transcriberStatus, pid: procs?.transcriber?.pid || null, out: startedTranscriber.out, err: startedTranscriber.err },
    });
  })();
});

router.post('/service/start-radio', (req, res) => {
  if (!requirePrivileged(req, res)) return;
  (async () => {
    ensureDir(RADIO_LOG_PATH);
    ensureSavedConfigFile();

    // Stop legacy processes that could still hold the dongle.
    try { await execPm2(['stop', 'radio-capture']); } catch {}

    const started = await pm2EnsureStarted('radio', buildRadioStartArgs());
    const procs = await getRadioProc();
    const radioStatus = procs?.radio?.pm2_env?.status || 'unknown';
    return res.json({
      ok: started.code === 0 && radioStatus === 'online',
      radio: { status: radioStatus, pid: procs?.radio?.pid || null, out: started.out, err: started.err },
      transcriber: { status: procs?.transcriber?.pm2_env?.status || 'unknown', pid: procs?.transcriber?.pid || null },
    });
  })();
});

// Backwards-compatible alias
router.post('/service/start-capture', (req, res) => {
  if (!requirePrivileged(req, res)) return;
  (async () => {
    ensureDir(RADIO_LOG_PATH);
    ensureSavedConfigFile();

    try { await execPm2(['stop', 'radio-capture']); } catch {}

    const started = await pm2EnsureStarted('radio', buildRadioStartArgs());
    const procs = await getRadioProc();
    const radioStatus = procs?.radio?.pm2_env?.status || 'unknown';
    return res.json({
      ok: started.code === 0 && radioStatus === 'online',
      radio: { status: radioStatus, pid: procs?.radio?.pid || null, out: started.out, err: started.err },
      transcriber: { status: procs?.transcriber?.pm2_env?.status || 'unknown', pid: procs?.transcriber?.pid || null },
    });
  })();
});

router.post('/service/stop-radio', (req, res) => {
  if (!requirePrivileged(req, res)) return;
  (async () => {
    const stopped = await execPm2(['stop', 'radio']);
    const procs = await getRadioProc();
    const radioStatus = procs?.radio?.pm2_env?.status || 'stopped';
    return res.json({
      ok: stopped.code === 0,
      radio: { status: radioStatus, out: stopped.out, err: stopped.err },
      transcriber: { status: procs?.transcriber?.pm2_env?.status || 'unknown', pid: procs?.transcriber?.pid || null },
    });
  })();
});

// Backwards-compatible alias
router.post('/service/stop-capture', (req, res) => {
  if (!requirePrivileged(req, res)) return;
  (async () => {
    const stopped = await execPm2(['stop', 'radio']);
    const procs = await getRadioProc();
    const radioStatus = procs?.radio?.pm2_env?.status || 'stopped';
    return res.json({
      ok: stopped.code === 0,
      radio: { status: radioStatus, out: stopped.out, err: stopped.err },
      transcriber: { status: procs?.transcriber?.pm2_env?.status || 'unknown', pid: procs?.transcriber?.pid || null },
    });
  })();
});

router.post('/service/start-transcriber', (req, res) => {
  if (!requirePrivileged(req, res)) return;
  (async () => {
    ensureDir(TRANSCRIBE_LOG_PATH);
    ensureSavedConfigFile();

    const started = await pm2EnsureStarted('radio-transcriber', buildTranscriberStartArgs());
    const procs = await getRadioProc();
    const transcriberStatus = procs?.transcriber?.pm2_env?.status || 'unknown';
    return res.json({
      ok: started.code === 0 && transcriberStatus === 'online',
      radio: { status: procs?.radio?.pm2_env?.status || 'unknown', pid: procs?.radio?.pid || null },
      transcriber: { status: transcriberStatus, pid: procs?.transcriber?.pid || null, out: started.out, err: started.err },
    });
  })();
});

router.post('/service/stop-transcriber', (req, res) => {
  if (!requirePrivileged(req, res)) return;
  (async () => {
    const stopped = await execPm2(['stop', 'radio-transcriber']);
    const procs = await getRadioProc();
    const transcriberStatus = procs?.transcriber?.pm2_env?.status || 'stopped';
    return res.json({
      ok: stopped.code === 0,
      radio: { status: procs?.radio?.pm2_env?.status || 'unknown', pid: procs?.radio?.pid || null },
      transcriber: { status: transcriberStatus, out: stopped.out, err: stopped.err },
    });
  })();
});

router.post('/service/stop', (req, res) => {
  if (!requirePrivileged(req, res)) return;
  (async () => {
    const stoppedRadio = await execPm2(['stop', 'radio']);
    const stoppedTranscriber = await execPm2(['stop', 'radio-transcriber']);
    const procs = await getRadioProc();
    const radioStatus = procs?.radio?.pm2_env?.status || 'stopped';
    const transcriberStatus = procs?.transcriber?.pm2_env?.status || 'stopped';
    const running = radioStatus === 'online' || transcriberStatus === 'online';
    return res.json({
      ok: stoppedRadio.code === 0 && stoppedTranscriber.code === 0,
      running,
      radio: { status: radioStatus, out: stoppedRadio.out, err: stoppedRadio.err },
      transcriber: { status: transcriberStatus, out: stoppedTranscriber.out, err: stoppedTranscriber.err },
    });
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
  const clipPath = path.join(RADIO_DATA_DIR, 'clips', safe);
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
  const livePath = path.join(RADIO_DATA_DIR, 'live.json');

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
