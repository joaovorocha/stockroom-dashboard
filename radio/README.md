# Radio → Text (RTL-SDR + Whisper)

This folder runs a walkie‑talkie transcription pipeline on the Shuttle server.

## Hardware / default channel
- Motorola CLP446e / PMR446 (analog NFM)
- Channel 2 default frequency: **446.01875 MHz**

## 1) One-time: allow RTL-SDR access (required)
The RTL-SDR USB device is `root:root` by default, so non-root processes can’t open it.

Run:
```bash
cd /var/www/stockroom-dashboard
./scripts/install-rtl-sdr-udev.sh
```
Unplug/replug the dongle, then verify:
```bash
LD_LIBRARY_PATH=$PWD/.local-rtl/lib $PWD/.local-rtl/bin/rtl_test -t
```

If you still see an error after udev rules are installed, the kernel DVB driver may be grabbing the device.
In that case we’ll add a blacklist (needs sudo too).

## 2) Python deps
```bash
python3 -m pip install --user numpy faster-whisper
```

## 3) Run transcription
Writes JSONL to: `data/radio/transcripts.jsonl`
```bash
cd /var/www/stockroom-dashboard
python3 radio/transcribe_walkie.py
```

Useful options:
```bash
python3 radio/transcribe_walkie.py --freq 446.01875M --model tiny --squelch 0 --gain 0
```

If you’re not seeing transcripts, run once with energy debugging and talk on the radio:
```bash
python3 radio/transcribe_walkie.py --debug-energy
```
Then adjust `--vad-threshold` (example: `0.01` or `0.03`).
