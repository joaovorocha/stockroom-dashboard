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
    freq: '446.01875M',
    ppm: 0,
    gain: 0,
    squelch: 0,
    squelchDelay: 1,
    vadThreshold: 0.03,
    hangoverMs: 800,
    model: 'tiny',
    device: 'cpu',
    computeType: 'int8',
  };
}

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {}
  return defaultConfig();
}

function saveConfig(cfg) {
  ensureDir(CONFIG_PATH);
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
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

router.get('/config', (req, res) => {
  const cfg = loadConfig();
  const privileged = isPrivileged(req);
  return res.json({ ok: true, config: cfg, privileged });
});

router.post('/config', (req, res) => {
  if (!requirePrivileged(req, res)) return;

  const body = req.body || {};
  const prev = loadConfig();
  const cfg = {
    ...prev,
    freq: String(body.freq ?? prev.freq),
    ppm: safeInt(body.ppm ?? prev.ppm, prev.ppm),
    gain: safeInt(body.gain ?? prev.gain, prev.gain),
    // rtl_fm squelch tends to stop PCM output entirely, which breaks live metering and VAD.
    // Keep squelch at 0 and do "squelch-like" behavior via VAD threshold instead.
    squelch: 0,
    squelchDelay: 1,
    vadThreshold: safeFloat(body.vadThreshold ?? prev.vadThreshold, prev.vadThreshold),
    hangoverMs: safeInt(body.hangoverMs ?? prev.hangoverMs, prev.hangoverMs),
    model: String(body.model ?? prev.model),
    device: String(body.device ?? prev.device),
    computeType: String(body.computeType ?? prev.computeType),
  };

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

module.exports = router;
