#!/usr/bin/env python3
"""Describe existing screenshots with a local Ollama vision model."""

from __future__ import annotations

import argparse
import base64
import json
import urllib.error
import urllib.request
from pathlib import Path


DEFAULT_MODEL = "qwen3.5:4b"
DEFAULT_PROMPT = """You are inspecting DOS game screenshots supplied in chronological order.
Return only one JSON object with a `frames` array. Each frame must contain:
`index`, `state` (title, main_menu, slot_menu, game_world, combat, dos_prompt, error, black,
loading, or unknown), `visible_text`, `selected_item`, `looks_crashed`, and `note`.
Transcribe visible menu and error text carefully. Describe only what is visible; do not infer a
successful load from a menu transition. Also include a short `sequence_summary` field."""


def describe(paths: list[Path], model: str, host: str, prompt: str, timeout: int) -> str:
    images = [base64.b64encode(path.read_bytes()).decode("ascii") for path in paths]
    ordered = "\n".join(f"Image {index}: {path.name}" for index, path in enumerate(paths))
    payload = {
        "model": model,
        "prompt": f"{prompt}\n\nImage order:\n{ordered}",
        "images": images,
        "stream": False,
        "think": False,
        "options": {"temperature": 0, "num_predict": 800},
    }
    request = urllib.request.Request(
        f"{host.rstrip('/')}/api/generate",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read()
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Ollama HTTP {error.code}: {detail}") from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"Ollama request failed at {host}: {error}") from error
    result = json.loads(body)
    if result.get("error"):
        raise RuntimeError(f"Ollama returned error: {result['error']}")
    return result.get("response", "").strip()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("images", nargs="+", type=Path)
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--host", default="http://localhost:11434")
    parser.add_argument("--prompt", default=DEFAULT_PROMPT)
    parser.add_argument("--timeout", type=int, default=180)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    missing = [str(path) for path in args.images if not path.is_file()]
    if missing:
        parser.error(f"image files not found: {', '.join(missing)}")
    response = describe(args.images, args.model, args.host, args.prompt, args.timeout)
    print(response)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(response + "\n", encoding="utf-8", newline="\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
