# Radio SDR System + Admin UI — Implementation Plan (Stockroom Dashboard)

Date: 2026-01-06

## 0) Current State (What’s already in this repo)

- `radio/capture_walkie.py`
  - Runs `rtl_fm` (via `radio/run-rtl-fm.sh`) tuned to **one active channel**.
  - Demodulates FM to **PCM audio** (default `--rtl-sample-rate` is **24,000 Hz** *audio output*, not IQ sample rate).
  - Does simple **VAD (RMS)** + segmenting, writes WAV clips and a rolling live-audio buffer.
  - Writes segment queue JSONL and minimal live status JSON.

- `radio/transcribe_worker.py`
  - Polls segments JSONL, resamples audio to **16 kHz**, runs `faster-whisper`, writes transcript JSONL.

- `routes/radio.js`
  - Provides `/api/radio/config`, `/api/radio/service`, and WS `/ws/radio-monitor` (live audio monitor).

**Implication:**
- We currently do **not** have RF-domain data (IQ) in-process, so we can’t produce a true spectrum/waterfall view without additional tooling.
- We do **not** do privacy-code gating (CTCSS/DCS). We only do VAD.

---

## 1) Product Requirements (from your spec)

- Radios: Motorola CLP446e on **PMR446** (446.0–446.2 MHz), **Analog NFM**, 12.5 kHz channel spacing, ±2.5 kHz deviation.
- Multi-channel support (preferably one SDR per channel; practically can also do one SDR covering full band and channelize).
- Privacy codes:
  - Per channel: none OR CTCSS OR DCS.
  - Must continuously detect and only open audio when detected code matches configured code.
  - Must expose lock status: MATCH / NO MATCH, with ~300 ms debounce/confidence window.

- Admin UI:
  - Real-time FFT spectrum + waterfall.
  - Center frequency marker + 12.5 kHz channel highlight.
  - Controls: PMR channel selector, gain, PPM, privacy config, monitor, auto-detect + “Press PTT now”, save.
  - Backend streams: FFT, waterfall, tuned freq, gain, PPM, detected CTCSS/DCS, lock status.

---

## 2) Critical Engineering Decision: SDR++ reuse vs standalone SDR engine

You asked to reuse/borrow from SDR++ (RTL-SDR input, NFM demod, FFT/waterfall, CTCSS/DCS logic).

### Important license note
SDR++ is commonly distributed under GPL-family terms (verify the exact license in their repo before embedding).
- If it’s GPL, **linking** SDR++ code into a proprietary server can impose strong copyleft obligations.
- A safer approach is running a **separate headless process** (SDR++ fork/headless) and talking over IPC/HTTP/WebSocket.

This document supports both paths:

### Path A (recommended MVP): Standalone “sdr-engine” service
- Keep your Node app as control plane.
- Add a separate service that:
  - Reads IQ (RTL-SDR)
  - Produces FFT/waterfall
  - Channelizes PMR446
  - Demods NFM
  - Detects CTCSS/DCS
  - Gates audio
  - Outputs 16 kHz mono PCM

Implementation options for `sdr-engine`:
- **Python** (fastest MVP): `pyrtlsdr` + `numpy` (+ optional `scipy`) + simple DSP.
- **GNU Radio** (stable, heavy): flowgraphs + custom blocks.
- **C++** (best long-term): SoapySDR/rtl-sdr + custom DSP.

### Path B (long-term): SDR++ headless mode / fork
- Run SDR++ headless (or a fork) as a service.
- Expose an API for:
  - Tune, gain, ppm
  - FFT/waterfall streaming
  - Demod audio
  - CTCSS/DCS detection

---

## 3) Architecture (repo-friendly)

### Components
1) **stockroom-dashboard (Node/Express)**
- Owns auth, admin UI, config persistence, PM2 orchestration.
- Talks to engine(s) over local network (localhost) using WS/HTTP.

2) **sdr-engine (new service)**
- Long-running process managed by PM2 (like `radio-capture`, `radio-transcriber`).
- Owns DSP + privacy lock.
- Publishes:
  - FFT frames
  - Waterfall frames
  - Detected privacy tone/code
  - Lock status
  - Optional: audio monitor stream

3) **transcriber (already exists)**
- Should consume **gated** 16 kHz PCM segments (only when privacy code matches).

### Dataflow
RTL-SDR IQ → (engine) → per-channel NFM audio → privacy detect → gate → 16 kHz mono PCM segments → transcriber.

---

## 4) Config Schema (compatible with existing `data/radio/config.json`)

Today you have:
- `channels[]: {id,label,freq,ppm,gain}`
- `vadThreshold`, `hangoverMs`
- Whisper settings: `model`, `device`, `computeType`

### Proposed extension (backward compatible)
Keep current fields, add:

```json
{
  "sdr": {
    "device": "rtlsdr",
    "ppm": 32,
    "gainDb": 35,
    "sampleRate": 240000,
    "centerFreqHz": 446100000
  },
  "channels": [
    {
      "id": "ch2",
      "label": "Sales Floor",
      "freq": "446.01875M",
      "ppm": 32,
      "gain": 35,
      "bandwidthHz": 12500,
      "privacy": { "type": "CTCSS", "value": 67.0 }
    }
  ],
  "privacy": {
    "confidenceMs": 300,
    "debounceMs": 300
  },
  "audio": {
    "outSampleRate": 16000
  }
}
```

Notes:
- Store frequencies as either numeric Hz OR the existing string `"446.01875M"`.
- Each channel privacy is explicit: `OFF|CTCSS|DCS`.
- Engine can optionally keep your old VAD as a second-stage gate.

---

## 5) Backend APIs + Streaming

### Engine control API (localhost)
- `GET /health` → engine status
- `GET /state` → current tune/gain/ppm + detected privacy + lock
- `POST /config` → apply full config
- `POST /auto-detect` → start “press PTT now” window; returns detected type/value + confidence

### Dashboard-facing routes (Node)
Expose to browser via existing auth:
- `GET /api/sdr/config` (proxy to config file)
- `POST /api/sdr/config` (save config)
- `POST /api/sdr/auto-detect` (proxy)
- `GET /api/sdr/state` (proxy)

### WebSocket streaming
- `WS /ws/sdr` (Node terminates, proxies or relays from engine)

Message types (examples):
- `fft`: `{ type: "fft", ts, centerHz, binHz, bins: [..float..] }`
- `waterfall`: `{ type: "waterfall", ts, rows: [[..float..], ..] }`
- `privacy`: `{ type: "privacy", ts, channelId, detected: {type,value}, lock: "MATCH"|"NO_MATCH"|"NONE" }`
- `state`: `{ type: "state", ts, gainDb, ppm, tunedHz, ... }`

---

## 6) Admin UI Layout (in `public/admin.html` Radio tab)

Keep it “simple SDR-like” in one page:

1) **Spectrum panel** (canvas)
- FFT line plot
- Center marker
- Highlight 12.5 kHz window around selected channel

2) **Waterfall panel** (canvas)
- Rolling rows

3) **Controls**
- PMR channel dropdown (16 channels)
- Gain slider
- PPM input + “Auto-calibrate” (later)
- Privacy mode: Off / CTCSS / DCS
- Privacy value input (CTCSS Hz dropdown; DCS code dropdown)
- Status: detected code + ✅ LOCKED / ❌ NOT MATCHING

4) Buttons
- Monitor (opens audio monitor)
- Auto Detect (shows “Press PTT now”, then displays result)
- Save Channel

---

## 7) Phased Implementation Plan (production-minded)

### Phase 1 — MVP visuals + basic gating (fast)
Goal: ship a working UI + pipeline without SDR++.
- Visuals: run `rtl_power` (or capture IQ + FFT in Python) to feed FFT/waterfall.
- Audio: keep `rtl_fm` tuned to active channel.
- Privacy detection MVP:
  - Implement **CTCSS detector** (Goertzel bank 60–300 Hz on demod audio).
  - Provide detected tone + confidence window.
  - Gate audio when match.
- DCS: stub UI + status “not supported yet”.

### Phase 2 — DCS detection + robust lock
- Implement DCS decoding (FSK-based) or integrate a proven library/tool.
- Add debounce, confidence scoring, and stable MATCH/NO_MATCH.

### Phase 3 — Multi-channel
Two options:
- One SDR covering entire PMR band (240 kHz complex IQ is enough) + digital channelizer (best).
- Multiple SDRs/processes each tuned per channel (simpler conceptually, more hardware).

### Phase 4 — SDR++ / headless integration (optional)
- Confirm license compatibility.
- Either:
  - fork SDR++ to headless + API, or
  - keep SDR++ separate and bridge via IPC.

---

## 8) What Codex should build first (very specific)

1) Create `services/sdr-engine/` (or `radio/sdr_engine.py`) as a new PM2-managed service.
2) Add engine → Node proxy routes and WS relay.
3) Add FFT/waterfall canvases to the Radio admin UI and render incoming frames.
4) Add privacy UI: Off/CTCSS/DCS + detected + lock indicator.
5) Implement CTCSS detection and gating in the engine.

---

## 9) Safety / operational notes
- Engine must restart cleanly and never crash the Node app.
- Protect CPU usage (FFT frame rate, decimation, batching).
- Do not block Node event loop; keep DSP in the engine process.

