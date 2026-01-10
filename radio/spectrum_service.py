#!/usr/bin/env python3
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import socket
import subprocess
import sys
import time
import signal
from pathlib import Path


_stop_requested = False


def _handle_stop_signal(_signum, _frame) -> None:
    global _stop_requested
    _stop_requested = True


def utc_now_iso() -> str:
    return dt.datetime.utcnow().replace(tzinfo=dt.timezone.utc).isoformat()


def load_json(path: Path) -> dict:
    try:
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    return {}


def safe_int(v, default=0) -> int:
    try:
        return int(v)
    except Exception:
        return int(default)


def _extract_active_channel(cfg: dict) -> tuple[int, int]:
    """Returns (ppm, gain) from active channel if present, otherwise top-level."""
    if not isinstance(cfg, dict) or not cfg:
        return 0, 0

    channels = cfg.get("channels") if isinstance(cfg.get("channels"), list) else []
    active_id = str(cfg.get("activeChannelId") or "").strip()

    active = None
    if channels and active_id:
        for c in channels:
            if str(c.get("id") or "").strip() == active_id:
                active = c
                break
    if not active and channels:
        active = channels[0]

    if isinstance(active, dict):
        ppm = safe_int(active.get("ppm", cfg.get("ppm", 0)) or 0, 0)
        gain = safe_int(active.get("gain", cfg.get("gain", 0)) or 0, 0)
        return ppm, gain

    ppm = safe_int(cfg.get("ppm", 0) or 0, 0)
    gain = safe_int(cfg.get("gain", 0) or 0, 0)
    return ppm, gain


def parse_freq_arg(v: str) -> int:
    s = (v or "").strip()
    if not s:
        raise ValueError("empty freq")
    # Accept Hz number, or MHz like 446.01875M
    if s.lower().endswith("m"):
        return int(round(float(s[:-1]) * 1_000_000))
    if s.lower().endswith("hz"):
        return int(round(float(s[:-2])))
    # If it's a bare float like 446.01875 assume MHz when < 10_000
    n = float(s)
    if n < 10_000:
        return int(round(n * 1_000_000))
    return int(round(n))


def main() -> int:
    signal.signal(signal.SIGTERM, _handle_stop_signal)
    signal.signal(signal.SIGINT, _handle_stop_signal)

    parser = argparse.ArgumentParser(description="Radio spectrum/waterfall streamer (rtl_power -> UDP JSON)")
    parser.add_argument("--config", default="data/radio/config.json", help="Radio config JSON path")
    parser.add_argument("--udp-host", default="127.0.0.1", help="UDP host to send FFT frames")
    parser.add_argument("--udp-port", type=int, default=7356, help="UDP port to send FFT frames")

    parser.add_argument("--low", default="446.000M", help="Band low edge (MHz like 446.000M)")
    parser.add_argument("--high", default="446.200M", help="Band high edge (MHz like 446.200M)")
    parser.add_argument("--bin-hz", type=int, default=1000, help="Max bin size in Hz (rtl_power will choose convenient bins)")
    parser.add_argument("--interval-s", type=int, default=1, help="Integration interval seconds")
    parser.add_argument("--crop", default="30%", help="Crop percent for rtl_power (e.g. 30%)")
    parser.add_argument("--window", default="hamming", help="Window function")
    parser.add_argument("--direct-sampling", action="store_true", help="Enable rtl_power -D")
    parser.add_argument("--offset-tuning", action="store_true", help="Enable rtl_power -O")
    parser.add_argument("--device-index", type=int, default=0, help="RTL-SDR device index")
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[1]
    bin_path = root / ".local-rtl" / "bin" / "rtl_power"
    lib_dir = root / ".local-rtl" / "lib"

    if not bin_path.exists():
        print(f"Missing rtl_power: {bin_path}", file=sys.stderr)
        return 2

    cfg_path = root / args.config
    low_hz = parse_freq_arg(args.low)
    high_hz = parse_freq_arg(args.high)
    if high_hz <= low_hz:
        raise SystemExit("--high must be > --low")

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

    last_ppm_gain = None
    backoff_s = 0.5

    while True:
        if _stop_requested:
            return 0
        cfg = load_json(cfg_path)
        ppm, gain = _extract_active_channel(cfg)
        ppm = int(ppm)
        gain = int(gain)

        # Use rtl_power automatic gain if config gain is 0.
        gain_arg = None if gain == 0 else str(gain)

        freq_arg = f"{low_hz}:{high_hz}:{int(args.bin_hz)}"
        cmd = [
            str(bin_path),
            "-f",
            freq_arg,
            "-i",
            str(int(args.interval_s)),
            "-d",
            str(int(args.device_index)),
            "-w",
            str(args.window),
        ]

        if args.crop:
            cmd += ["-c", str(args.crop)]

        if args.direct_sampling:
            cmd.append("-D")
        if args.offset_tuning:
            cmd.append("-O")

        if gain_arg is not None:
            cmd += ["-g", gain_arg]
        if ppm:
            cmd += ["-p", str(ppm)]

        # Output CSV to stdout. (rtl_power treats '-' as a literal filename on some builds.)
        cmd.append("/dev/stdout")

        env = os.environ.copy()
        env["LD_LIBRARY_PATH"] = str(lib_dir) + (":" + env["LD_LIBRARY_PATH"] if env.get("LD_LIBRARY_PATH") else "")

        print(f"[radio-spectrum] starting rtl_power (ppm={ppm}, gain={gain})", flush=True)

        start_ts = time.time()
        fft_frames = 0
        non_csv_lines: list[str] = []
        restart_reason = "unknown"

        # Notify start
        try:
            sock.sendto(
                json.dumps(
                    {
                        "type": "status",
                        "ts": utc_now_iso(),
                        "ok": True,
                        "state": "starting",
                        "ppm": ppm,
                        "gain": gain,
                        "range": {"lowHz": low_hz, "highHz": high_hz, "binHz": int(args.bin_hz), "intervalS": int(args.interval_s)},
                    }
                ).encode("utf-8"),
                (args.udp_host, int(args.udp_port)),
            )
        except Exception:
            pass

        try:
            proc = subprocess.Popen(
                cmd,
                cwd=str(root),
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                env=env,
                bufsize=1,
            )
        except Exception as e:
            print(f"[radio-spectrum] failed to start rtl_power: {e}", flush=True)
            time.sleep(2.0)
            continue

        last_ppm_gain = (ppm, gain)

        try:
            assert proc.stdout is not None
            for line in proc.stdout:
                if _stop_requested:
                    restart_reason = "stopping"
                    break
                if not line:
                    continue
                s = line.strip()
                if not s:
                    continue

                # rtl_power CSV line: date, time, low, high, step, samples, dbm, dbm, ...
                parts = [p.strip() for p in s.split(",")]
                if len(parts) < 7:
                    non_csv_lines.append(s)
                    if len(non_csv_lines) > 80:
                        non_csv_lines.pop(0)
                    continue

                # Some rtl_power versions print non-CSV status; skip those.
                if not parts[0] or not parts[1]:
                    non_csv_lines.append(s)
                    if len(non_csv_lines) > 80:
                        non_csv_lines.pop(0)
                    continue

                try:
                    low_line = int(float(parts[2]))
                    high_line = int(float(parts[3]))
                    step_hz = int(float(parts[4]))
                    # parts[5] samples ignored
                    dbm = []
                    for v in parts[6:]:
                        try:
                            dbm.append(float(v))
                        except Exception:
                            dbm.append(float("nan"))
                except Exception:
                    continue

                payload = {
                    "type": "fft",
                    "ts": utc_now_iso(),
                    "lowHz": low_line,
                    "highHz": high_line,
                    "stepHz": step_hz,
                    "ppm": ppm,
                    "gain": gain,
                    "dbm": dbm,
                }

                fft_frames += 1

                try:
                    sock.sendto(json.dumps(payload, separators=(",", ":")).encode("utf-8"), (args.udp_host, int(args.udp_port)))
                except Exception:
                    pass

                # If ppm/gain changed, restart rtl_power so UI reflects it.
                cfg2 = load_json(cfg_path)
                ppm2, gain2 = _extract_active_channel(cfg2)
                if (int(ppm2), int(gain2)) != last_ppm_gain:
                    restart_reason = "config-changed"
                    raise RuntimeError("config changed")

        except Exception:
            try:
                proc.terminate()
            except Exception:
                pass
            try:
                proc.wait(timeout=2)
            except Exception:
                try:
                    proc.kill()
                except Exception:
                    pass
        finally:
            try:
                proc.kill()
            except Exception:
                pass

        if _stop_requested:
            return 0

        runtime_s = max(0.0, time.time() - start_ts)
        rc = None
        try:
            rc = proc.returncode
        except Exception:
            rc = None

        had_error = False
        if fft_frames <= 0 and restart_reason != "config-changed" and restart_reason != "stopping":
            # Common causes: RTL-SDR in use by another process, insufficient permissions,
            # or no device present. Surface the last few non-CSV lines as context.
            msg = "rtl_power exited without FFT output"
            detail = "\n".join(non_csv_lines[-12:]).strip()
            if detail:
                msg = msg + ": " + detail[:800]

            # Hint common root cause.
            if "usb_claim_interface" in msg or "Failed to open rtlsdr" in msg:
                msg = msg + "\nHint: The RTL-SDR is likely already in use (stop Capture or use a second dongle)."
            print(f"[radio-spectrum] ERROR: {msg}", flush=True)
            try:
                sock.sendto(
                    json.dumps(
                        {
                            "type": "status",
                            "ts": utc_now_iso(),
                            "ok": False,
                            "state": "error",
                            "message": msg,
                            "returnCode": rc,
                            "runtimeS": round(runtime_s, 3),
                        }
                    ).encode("utf-8"),
                    (args.udp_host, int(args.udp_port)),
                )
            except Exception:
                pass
            # Backoff to avoid tight loops.
            # If the dongle is busy (common with single-dongle setups), back off more
            # aggressively to reduce log spam.
            backoff_s = min(max(1.0, backoff_s * 1.5), 60.0)
            had_error = True
        else:
            backoff_s = 0.5

        # Only emit an explicit restart status when this was a config-driven restart.
        if restart_reason == "config-changed":
            try:
                sock.sendto(
                    json.dumps(
                        {
                            "type": "status",
                            "ts": utc_now_iso(),
                            "ok": True,
                            "state": "restarting",
                            "reason": restart_reason,
                        }
                    ).encode("utf-8"),
                    (args.udp_host, int(args.udp_port)),
                )
            except Exception:
                pass

        # If there was an error, do not immediately overwrite the UI with restarting.
        time.sleep(float(backoff_s))


if __name__ == "__main__":
    raise SystemExit(main())
