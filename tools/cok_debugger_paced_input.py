#!/usr/bin/env python3
"""Advance one CoK DEBUGBOX input edge without bypassing a BPINT16 stop.

The game key is delivered only through DOSBox-X GameLink.  The host debugger helper
is used solely for debugger-console commands/snapshots.  This deliberately does not
launch DOSBox or choose a route: callers attach to an owned DEBUGBOX process that was
already armed with ``BPINT 16 0`` while stopped.  ``--running-input`` covers
the special bootstrap case where CoK must see a normal GameLink key before it
ever reaches its first AH=00 read; the default queues a key at an existing stop.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

try:
    from tools.dosbox_gamelink import GameLink, SCAN_CODES, write_png
except ModuleNotFoundError:
    from dosbox_gamelink import GameLink, SCAN_CODES, write_png


REPO = Path(__file__).resolve().parent.parent
HELPER = REPO / "tools" / "dosbox_debugger_input" / "bin" / "Release" / "net9.0-windows" / "DosboxDebuggerInput.dll"


def stopped(console: str) -> bool:
    return "(Running)" not in console


def registers(console: str) -> dict[str, str]:
    result: dict[str, str] = {}
    for name in ("CS", "EIP", "DS", "SS", "ESP"):
        marker = f"{name}="
        for token in console.replace("\n", " ").split():
            if token.startswith(marker):
                result[name.lower()] = token[len(marker):]
                break
    return result


def key_code(name: str) -> int:
    """Resolve a user-facing GameLink key name before touching the debugger."""
    code = SCAN_CODES.get(name.lower())
    if code is None:
        raise ValueError(f"unsupported GameLink key: {name}; supported: {', '.join(sorted(SCAN_CODES))}")
    return code


def debugger(pid: int, output: Path, label: str, command: str | None = None, timeout: float = 10.0) -> tuple[dict[str, Any], str]:
    status = output / f"{label}-debugger-status.json"
    console = output / f"{label}-debugger-console.txt"
    args = ["dotnet", str(HELPER), "--pid", str(pid), "--status", str(status), "--snapshot", str(console)]
    args += ["--snapshot-only"] if command is None else ["--command", command]
    try:
        completed = subprocess.run(args, text=True, capture_output=True, check=False, timeout=timeout)
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(f"debugger helper timed out during {label} after {timeout:g}s") from exc
    if completed.returncode:
        raise RuntimeError(f"debugger helper failed ({completed.returncode}): {completed.stderr.strip() or completed.stdout.strip()}")
    payload = json.loads(status.read_text(encoding="utf-8"))
    if not payload.get("Success"):
        raise RuntimeError(f"debugger helper rejected {label}: {payload.get('Error')}")
    return payload, console.read_text(encoding="utf-8", errors="replace")


def wait_for_stop(pid: int, output: Path, label: str, timeout: float, poll: float) -> str:
    """Return a fresh stopped console snapshot, never trusting a running one."""
    deadline = time.monotonic() + timeout
    attempt = 0
    console = ""
    while True:
        attempt += 1
        _, console = debugger(pid, output, f"{label}-{attempt:03d}", timeout=timeout)
        if stopped(console):
            return console
        if time.monotonic() >= deadline:
            raise RuntimeError(f"guest did not reach a debugger stop within {timeout:g}s")
        time.sleep(poll)


def frame(link: GameLink, path: Path) -> dict[str, Any]:
    metadata, pixels = link.frame()
    write_png(path, metadata["width"], metadata["height"], pixels)
    return metadata


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pid", type=int, required=True, help="owned DEBUGBOX DOSBox-X PID")
    parser.add_argument("--key", required=True, help="one GameLink key name")
    parser.add_argument("--output", type=Path, required=True, help="new evidence directory")
    parser.add_argument("--timeout", type=float, default=10.0)
    parser.add_argument("--poll", type=float, default=0.15)
    parser.add_argument("--consume-timeout", type=float, default=3.0, help="maximum wait for DOSBox-X to consume the queued key")
    parser.add_argument("--wait-for-stop", type=float, default=0.0, help="wait this long for an initial BPINT stop instead of rejecting a running guest")
    parser.add_argument(
        "--running-input",
        action="store_true",
        help="deliver a normal GameLink press while the guest is running, then wait for the next BPINT stop",
    )
    parser.add_argument(
        "--require-frame-change",
        action="store_true",
        help="fail after recording evidence unless GameLink's frame sequence advanced",
    )
    parser.add_argument(
        "--require-progress",
        action="store_true",
        help="fail after recording evidence unless the frame or stopped debugger registers changed",
    )
    args = parser.parse_args()
    if args.timeout <= 0 or args.poll <= 0 or args.consume_timeout <= 0 or args.wait_for_stop < 0:
        parser.error("--timeout, --poll, and --consume-timeout must be positive; --wait-for-stop cannot be negative")
    if args.require_frame_change and args.require_progress:
        parser.error("--require-frame-change and --require-progress are mutually exclusive")
    try:
        scan_code = key_code(args.key)
    except ValueError as exc:
        parser.error(str(exc))
    if args.output.exists():
        parser.error("--output must not already exist")
    if not HELPER.is_file():
        parser.error(f"debugger helper not built: {HELPER}")
    args.output.mkdir(parents=True)

    _, before_console = debugger(args.pid, args.output, "before", timeout=args.timeout)
    if not args.running_input and not stopped(before_console) and args.wait_for_stop:
        before_console = wait_for_stop(args.pid, args.output, "initial-wait", args.wait_for_stop, args.poll)
    if args.running_input and stopped(before_console):
        raise RuntimeError("guest is stopped; use the queued-edge mode or resume it before --running-input")
    if not args.running_input and not stopped(before_console):
        raise RuntimeError("guest is running; refuse to send a game key without a debugger stop")
    before_registers = registers(before_console)
    if not args.running_input and not before_registers:
        raise RuntimeError("stopped snapshot did not expose registers")

    with GameLink(args.timeout) as link:
        before_frame = frame(link, args.output / "before.png")
        key_held = False
        after_console = ""
        if args.running_input:
            # Some games only invoke AH=00 after a polling loop has observed a key.
            # In that state, queueing a key at a halted BPINT stop starves GameLink.
            # Deliver one ordinary, consumption-confirmed GameLink press while CPU
            # execution is live, then wait for the following BPINT stop.
            link.press(args.key, hold=0.05)
            after_console = wait_for_stop(args.pid, args.output, "after-running-input", args.timeout, args.poll)
        else:
            # Game input is GameLink only. Keep the key held while DEBUGBOX resumes
            # so the stopped INT 16h can consume it; release on every error path.
            try:
                link._set_key(scan_code, True)
                key_held = True
                debugger(args.pid, args.output, "run", "RUN", timeout=args.timeout)
                # A BPINT16 stop can occur before DOSBox-X processes this edge. Do
                # not call that a successful cycle until it has consumed the input.
                link._wait_consumed(args.consume_timeout)
                after_console = wait_for_stop(args.pid, args.output, "poll", args.timeout, args.poll)
            finally:
                if key_held:
                    # Even on a debugger error, GameLink is the sole game-input path
                    # and the next trace must begin without a synthetic held key.
                    link._set_key(scan_code, False)
        after_frame = frame(link, args.output / "after.png")

    after_registers = registers(after_console)
    frame_sequence_changed = before_frame.get("sequence") != after_frame.get("sequence")
    registers_changed = before_registers != after_registers
    payload = {
        "schema_version": 1,
        "input": "DOSBox-X GameLink only",
        "debugger_transport": "process-owned debugger-console helper only",
        "key": args.key,
        "mode": "running-input" if args.running_input else "queued-edge",
        "before": {"registers": before_registers, "frame": before_frame},
        "after": {"registers": after_registers, "frame": after_frame},
        "frame_sequence_changed": frame_sequence_changed,
        "debugger_registers_changed": registers_changed,
        "edge_progressed": frame_sequence_changed or registers_changed,
    }
    (args.output / "result.json").write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    if args.require_frame_change and not frame_sequence_changed:
        raise RuntimeError("GameLink frame sequence did not advance; reject this input edge")
    if args.require_progress and not payload["edge_progressed"]:
        raise RuntimeError("neither GameLink frame nor stopped debugger registers advanced; reject this input edge")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
