#!/usr/bin/env python3
"""Durably observe, and only then advance, one CoK GameLink trace boundary.

This is deliberately an attached worker: launch the isolated retail route with
``cok_gamelink_saved_outpost_route.ps1 -KeepOpen`` first.  It never opens a
DOSBox window, uses GameLink for every frame/RAM/input operation, writes a
flushed JSONL journal before each transition, and stops rather than guessing
when the visible tactical menu does not match its expected state.
"""

from __future__ import annotations

import argparse
import base64
import json
import re
import os
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path
from typing import Any

try:  # support both `python tools/...py` and `python -m unittest tools...`
    from tools.cok_trace_journal import TraceJournal, sha256_file
    from tools.dosbox_gamelink import GameLink, write_png
except ModuleNotFoundError:
    from cok_trace_journal import TraceJournal, sha256_file
    from dosbox_gamelink import GameLink, write_png


REPO = Path(__file__).resolve().parent.parent
MENU_ANALYZER = REPO / "tools" / "analyze_goldbox_menu_pixels.py"


def parse_region(value: str) -> tuple[int, int]:
    try:
        start, length = (int(part, 0) for part in value.split(":", 1))
    except ValueError as exc:
        raise argparse.ArgumentTypeError("region must be START:LENGTH (for example 0x48000:0x1000)") from exc
    if start < 0 or length < 1:
        raise argparse.ArgumentTypeError("region start must be non-negative and length positive")
    return start, length


def atomic_bytes(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, prefix=f".{path.name}.", delete=False) as temp:
        temp.write(data)
        temp.flush()
        os.fsync(temp.fileno())
        temporary = Path(temp.name)
    os.replace(temporary, path)


def atomic_png(path: Path, width: int, height: int, pixels: bytes) -> None:
    temporary = path.parent / f".{path.name}.tmp"
    try:
        write_png(temporary, width, height, pixels)
        # Windows only permits fsync on a writable descriptor.
        with temporary.open("r+b") as image:
            os.fsync(image.fileno())
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def menu_report(image: Path, font: Path | None, top: int, bottom: int, glyph_top: int) -> dict[str, Any]:
    command = [sys.executable, str(MENU_ANALYZER), str(image), "--top", str(top),
               "--bottom", str(bottom), "--glyph-top", str(glyph_top)]
    if font:
        command += ["--font", str(font)]
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode:
        raise RuntimeError(f"menu analysis failed: {result.stderr.strip() or result.stdout.strip()}")
    return json.loads(result.stdout)


def verify_menu(report: dict[str, Any], expected_profile: str | None,
                labels: list[str], selected_index: int | None) -> None:
    if expected_profile and report.get("cok_combat_profile") != expected_profile:
        raise RuntimeError(f"expected menu {expected_profile}, found {report.get('cok_combat_profile') or 'unknown'}")
    decoded = {run.get("text") for run in report.get("runs", []) if run.get("text")}
    missing = [label.upper() for label in labels if label.upper() not in decoded]
    if missing:
        raise RuntimeError(f"missing decoded label(s) {', '.join(missing)}; found {sorted(decoded)}")
    if selected_index is not None and report.get("selected_indices") != [selected_index]:
        raise RuntimeError(f"expected only selected index {selected_index}, found {report.get('selected_indices')}")


def vision_text(image: Path, model: str) -> str:
    """Ask the local Ollama vision model for a bounded text-only narration gate."""
    prompt = ("Read the visible DOS game screen. Reply as JSON only with a visible_text string "
              "containing the readable on-screen words; do not infer hidden state.")
    payload = json.dumps({"model": model, "prompt": prompt,
                          "images": [base64.b64encode(image.read_bytes()).decode("ascii")],
                          "stream": False, "think": False,
                          "options": {"temperature": 0, "num_predict": 400}}).encode("utf-8")
    request = urllib.request.Request("http://localhost:11434/api/generate", data=payload,
                                     headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=180) as response:
        raw = json.loads(response.read())
    answer = raw.get("response", "")
    candidate = answer
    if not candidate.lstrip().startswith("{"):
        match = re.search(r"\{.*\}", candidate, flags=re.DOTALL)
        if match:
            candidate = match.group(0)
    try:
        visible = json.loads(candidate).get("visible_text", "")
        return " ".join(str(part) for part in visible) if isinstance(visible, list) else str(visible)
    except json.JSONDecodeError:
        match = re.search(r'"visible_text"\s*:\s*"((?:[^"\\]|\\.)*)"', answer)
        if match:
            return json.loads(f'"{match.group(1)}"')
        raise RuntimeError("Ollama vision response did not contain visible_text")


def capture(link: GameLink, journal: TraceJournal, label: str, regions: list[tuple[int, int]], full_ram: bool,
            font: Path | None, expected_profile: str | None, labels: list[str],
            selected_index: int | None, expected_vision_text: list[str], vision_model: str,
            top: int, bottom: int, glyph_top: int) -> dict[str, Any]:
    frame, pixels = link.frame()
    image = journal.output / f"{label}.png"
    atomic_png(image, frame["width"], frame["height"], pixels)
    report = menu_report(image, font, top, bottom, glyph_top) if (font or expected_profile) else None
    if report is not None:
        verify_menu(report, expected_profile, labels, selected_index)
    visible_text = None
    if expected_vision_text:
        visible_text = vision_text(image, vision_model)
        missing = [phrase for phrase in expected_vision_text if phrase.casefold() not in visible_text.casefold()]
        if missing:
            raise RuntimeError(f"Ollama narration gate missing {missing!r}; read {visible_text!r}")
    memory: list[dict[str, Any]] = []
    if full_ram:
        # A full snapshot is deliberately opt-in.  It is the only safe input to
        # runtime-structure recovery: a bounded DGROUP slice cannot show the
        # combatant allocations whose segment is not yet known.  GameLink is
        # read-only here; its reported RAM size guards the range.
        ram_size = int(link.status()["ram_size"])
        path = journal.output / f"{label}.ram-full.bin"
        atomic_bytes(path, link.peek(0, ram_size))
        memory.append({"path": path.name, "start": 0, "length": ram_size,
                       "sha256": sha256_file(path), "kind": "full-ram"})
    for index, (start, length) in enumerate(regions):
        path = journal.output / f"{label}.ram-{index:02d}-{start:05x}-{length:x}.bin"
        atomic_bytes(path, link.peek(start, length))
        memory.append({"path": path.name, "start": start, "length": length, "sha256": sha256_file(path)})
    if report is not None:
        report_path = journal.output / f"{label}.menu.json"
        atomic_bytes(report_path, (json.dumps(report, indent=2) + "\n").encode("utf-8"))
    entry = {"label": label, "image": image.name, "image_sha256": sha256_file(image),
             "frame": frame, "memory": memory}
    if report is not None:
        entry["menu"] = {"profile": report.get("cok_combat_profile"),
                         "selected_indices": report.get("selected_indices"),
                         "labels": [run.get("text") for run in report.get("runs", [])]}
    if visible_text is not None:
        entry["vision_visible_text"] = visible_text
    journal.record("observation", **entry)
    return entry


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True, help="new evidence directory; refuses to reuse one")
    parser.add_argument("--label", default="boundary", help="safe filename stem for the first observation")
    parser.add_argument("--samples", type=int, default=1, help="number of stable observations to preserve")
    parser.add_argument("--interval", type=float, default=1.0, help="seconds between observations")
    parser.add_argument("--region", type=parse_region, action="append", default=[], help="RAM START:LENGTH; repeatable")
    parser.add_argument("--full-ram", action="store_true",
                        help="also capture one complete read-only GameLink RAM snapshot per observation")
    parser.add_argument("--font", type=Path, help="retail CoK 8X8D1.DAX, required for --expect-label")
    parser.add_argument("--top", type=int, default=370, help="inclusive command-row pixel y (default: 370)")
    parser.add_argument("--bottom", type=int, default=400, help="exclusive command-row pixel y (default: 400)")
    parser.add_argument("--glyph-top", type=int, default=384, help="retail-font glyph y (default: 384)")
    parser.add_argument("--expect-profile", choices=("movement", "movement_active", "primary", "primary_short", "done", "done_short", "continue_battle", "treasure", "yes_no", "destination"))
    parser.add_argument("--expect-label", action="append", default=[])
    parser.add_argument("--expect-selected-index", type=int)
    parser.add_argument("--expect-vision-text", action="append", default=[], metavar="TEXT",
                        help="require local Ollama vision to read this narration substring; repeatable")
    parser.add_argument("--vision-model", default="qwen3.5:4b")
    parser.add_argument("--press", help="one GameLink key or combination to inject after all observations verify")
    parser.add_argument("--settle", type=float, default=2.0, help="seconds to wait before the post-input capture")
    parser.add_argument("--timeout", type=float, default=10.0)
    args = parser.parse_args()
    if args.samples < 1 or args.interval < 0 or args.settle < 0:
        parser.error("samples must be positive; interval and settle must be non-negative")
    if not (0 <= args.top < args.bottom <= 400 and 0 <= args.glyph_top <= 384):
        parser.error("command-row and glyph y values must fit a 640x400 GameLink frame")
    if args.expect_label and not args.font:
        parser.error("--expect-label requires --font")
    if not args.label.replace("-", "").replace("_", "").isalnum():
        parser.error("label may contain only letters, digits, '_' and '-'")

    journal = TraceJournal(args.output, {"tool": Path(__file__).name, "argv": sys.argv[1:],
                                         "input": "DOSBox-X GameLink v4 only"})
    try:
        with GameLink(args.timeout) as link:
            journal.record("attached", status=link.status())
            for sample in range(args.samples):
                label = args.label if args.samples == 1 else f"{args.label}-{sample + 1:02d}"
                capture(link, journal, label, args.region, args.full_ram, args.font, args.expect_profile,
                        args.expect_label, args.expect_selected_index, args.expect_vision_text, args.vision_model,
                        args.top, args.bottom, args.glyph_top)
                if sample + 1 < args.samples:
                    time.sleep(args.interval)
            if args.press:
                journal.record("action", key=args.press, preconditions="all requested observations verified")
                link.press(args.press)
                time.sleep(args.settle)
                capture(link, journal, f"{args.label}-after", args.region, args.full_ram, args.font, None, [], None, [], args.vision_model,
                        args.top, args.bottom, args.glyph_top)
        journal.summarize("complete", observations=args.samples, pressed=args.press)
    except Exception as exc:
        journal.record("stopped", error=str(exc))
        journal.summarize("stopped", error=str(exc))
        raise
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
