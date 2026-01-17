 #!/usr/bin/env python3

import argparse
import json
import math
import os
import time
from pathlib import Path

import numpy as np


def utc_now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def load_json(path: Path) -> dict:
    try:
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    return {}


def write_json_atomic(path: Path, obj: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(obj, ensure_ascii=False), encoding="utf-8")
    tmp.replace(path)


def parse_freq_to_hz(text: str) -> int:
    s = str(text).strip().upper().replace("M", "")
    n = float(s)
    if n < 10_000:
        return int(round(n * 1_000_000))
    return int(round(n))


def default_pmr446_channels() -> list[dict]:
    freqs = [
        ("ch1", "Ch 1", "446.00625M"),
        ("ch2", "Ch 2", "446.01875M"),
        ("ch3", "Ch 3", "446.03125M"),
        ("ch4", "Ch 4", "446.04375M"),
        ("ch5", "Ch 5", "446.05625M"),
    ]
    out = []
    for cid, label, f in freqs:
        out.append({"id": cid, "label": label, "freq": f, "freqHz": parse_freq_to_hz(f)})
    return out


def resolve_default_path(rel_path: str) -> Path:
    candidate = Path("/var/lib/stockroom-dashboard").joinpath(rel_path)
    if candidate.exists():
        return candidate
    return Path(rel_path)


def compute_channel_power(snapshot: dict, freq_hz: int, half_bw_hz: float = 6250.0) -> float | None:
    try:
        low_hz = float(snapshot.get("lowHz"))
        step_hz = float(snapshot.get("stepHz"))
        dbm = snapshot.get("dbm")
        if not isinstance(dbm, list) or not dbm:
            return None
        idx = int(round((float(freq_hz) - low_hz) / step_hz))
        half_bins = max(1, int(round(half_bw_hz / step_hz)))
        i0 = max(0, idx - half_bins)
        i1 = min(len(dbm) - 1, idx + half_bins)
        if i1 <= i0:
            return None
        return float(np.mean(np.asarray(dbm[i0:i1], dtype=np.float32)))
    except Exception:
        return None


def main() -> int:
    parser = argparse.ArgumentParser(description="Find best PMR446 channel from spectrum snapshots")
    parser.add_argument("--duration-s", type=float, default=300.0, help="How long to observe spectrum")
    parser.add_argument("--poll-s", type=float, default=1.0, help="Polling interval for spectrum snapshots")
    parser.add_argument("--max-channels", type=int, default=5, help="Max channels to consider")
    parser.add_argument("--focus-id", default="ch2", help="Preferred channel id")
    parser.add_argument("--focus-margin-db", type=float, default=3.0, help="Bias toward focus if within this margin")
    parser.add_argument("--spectrum", default=None, help="Spectrum JSON path")
    parser.add_argument("--out", default=None, help="Finder output JSON path")
    args = parser.parse_args()

    spectrum_path = Path(args.spectrum) if args.spectrum else resolve_default_path("data/radio/spectrum.json")
    out_path = Path(args.out) if args.out else resolve_default_path("data/radio/finder.json")

    channels = default_pmr446_channels()[: max(0, int(args.max_channels)) or len(default_pmr446_channels())]

    start = time.time()
    last_ts = ""
    samples = {c["id"]: [] for c in channels}
    noise_samples = []
    avg_dbm = None
    avg_count = 0
    last_snapshot = None

    while time.time() - start < float(args.duration_s):
        snap = load_json(spectrum_path)
        ts = str(snap.get("ts") or "")
        if snap and ts and ts != last_ts and isinstance(snap.get("dbm"), list):
            last_ts = ts
            last_snapshot = snap
            dbm_arr = np.asarray(snap.get("dbm"), dtype=np.float32)
            if dbm_arr.size:
                noise_samples.append(float(np.median(dbm_arr)))
                if avg_dbm is None:
                    avg_dbm = dbm_arr.astype(np.float64)
                else:
                    if avg_dbm.size == dbm_arr.size:
                        avg_dbm += dbm_arr
                avg_count += 1
            for ch in channels:
                p = compute_channel_power(snap, int(ch.get("freqHz") or 0))
                if p is not None:
                    samples[ch["id"]].append(float(p))
        time.sleep(max(0.2, float(args.poll_s)))

    results = []
    noise_floor = float(np.mean(noise_samples)) if noise_samples else None
    for ch in channels:
        vals = samples.get(ch["id"], [])
        if not vals:
            continue
        avg = float(np.mean(vals))
        peak = float(np.max(vals))
        stdev = float(np.std(vals))
        snr = float(avg - noise_floor) if noise_floor is not None else None
        results.append({
            "id": ch["id"],
            "label": ch["label"],
            "freq": ch["freq"],
            "freqHz": ch["freqHz"],
            "avgDb": avg,
            "peakDb": peak,
            "stdevDb": stdev,
            "snrDb": snr,
            "samples": len(vals),
        })

    results.sort(key=lambda r: (r.get("snrDb") is None, -(r.get("snrDb") or -9999), -(r.get("avgDb") or -9999)))

    best = results[0] if results else None
    focus = next((r for r in results if r.get("id") == str(args.focus_id)), None)
    if best and focus and focus != best:
        best_db = float(best.get("avgDb") or -9999)
        focus_db = float(focus.get("avgDb") or -9999)
        if best_db < focus_db + float(args.focus_margin_db):
            best = focus

    avg_spectrum = None
    if avg_dbm is not None and avg_count > 0:
        avg_spectrum = (avg_dbm / float(avg_count)).astype(np.float32).tolist()

    out = {
        "ts": utc_now_iso(),
        "durationS": round(time.time() - start, 2),
        "samples": int(avg_count),
        "noiseFloorDb": noise_floor,
        "focusId": str(args.focus_id),
        "focusMarginDb": float(args.focus_margin_db),
        "best": best,
        "channels": results,
        "spectrum": {
            "avgDbm": avg_spectrum,
            "last": last_snapshot,
        },
    }

    write_json_atomic(out_path, out)
    print(json.dumps(out, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
