#!/usr/bin/env python3
"""Run a bounded visual DOS test through Ollama and DOSBox-X GameLink."""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import re
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    import dosbox_gamelink
except ModuleNotFoundError:  # Imported as tools.dosbox_ollama_agent by tests.
    from tools import dosbox_gamelink


DEFAULT_MODEL = "qwen3.5:4b"
DEFAULT_ACTIONS = ("esc", "up", "down", "left", "right", "enter", "kp_enter", "space", "wait", "stop")


def ambiguous_goldbox_menu(observation: dict[str, Any]) -> str | None:
    """Recognize visible menu contracts for which a vision model may not activate a default.

    This is intentionally a narrow, host-side safety rail, not an OCR or game-state claim.  It
    covers the known Gold Box destination/encamp contracts whose default Enter can alter party
    state; a model may describe such a screen, but only a caller with an explicit menu policy may
    select an action there.
    """
    visible = str(observation.get("visible_text", "")).upper()
    if "WHERE DO YOU WISH TO GO" in visible:
        return "visible destination menu"
    if all(word in visible for word in ("SAVE", "VIEW", "MAGIC", "REST", "ALTER", "FIX", "EXIT")):
        return "visible encamp menu"
    return None


def extract_json(response: str) -> dict[str, Any]:
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", response, re.DOTALL)
    candidates = [fenced.group(1)] if fenced else []
    candidates.extend(match.group(0) for match in re.finditer(r"\{.*\}", response, re.DOTALL))
    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            return parsed
    raise ValueError("model response contains no valid JSON object")


def normalize_decision(parsed: dict[str, Any], allowed_actions: set[str]) -> dict[str, Any]:
    action = str(parsed.get("action", "stop")).lower().strip()
    if action not in allowed_actions:
        raise ValueError(f"model selected disallowed action: {action}")
    observation = parsed.get("observation", {})
    if not isinstance(observation, dict):
        observation = {"note": str(observation)}
    return {
        "observation": observation,
        "action": action,
        "reason": str(parsed.get("reason", "")),
        # The action is authoritative. A model occasionally emits done=true while
        # also selecting Enter for a visible continuation prompt; stopping before
        # that keypress strands the mechanical test at the prompt.
        "done": action == "stop",
        "verdict": str(parsed.get("verdict", "in_progress")),
    }


def build_prompt(
    goal: str,
    allowed_actions: tuple[str, ...],
    step: int,
    previous: dict[str, Any] | None,
) -> str:
    previous_text = json.dumps(previous, separators=(",", ":")) if previous else "null"
    no_progress = ""
    if previous and previous.get("framebuffer_changed") is False:
        previous_action = previous.get("action", "the previous action")
        no_progress = (
            f"\nThe current framebuffer is byte-identical after {previous_action}. "
            "That action made no visible progress; choose a different action and do not repeat it."
        )
    return f"""You are operating one DOS game test through a focusless GameLink connection.
Goal: {goal}
This is step {step}. Inspect only the attached current framebuffer.
Allowed actions: {', '.join(allowed_actions)}.
Previous mechanical result: {previous_text}{no_progress}

Choose exactly one next action. Use kp_enter when a highlighted SSI Gold Box menu item must be
activated; ordinary enter may not activate keypad-oriented menus. Use wait only for a screen that
is visibly loading. Set done=true only when the visible goal is reached or a visible error makes it
impossible. Do not claim that a save, address, or code path is proven from pixels alone.

Safety rule for menus: do not activate a menu unless the selected item is visibly identified and it
matches the current checkpoint. If the selection highlight is ambiguous, choose `stop` with
verdict `uncertain`; never guess a character-creation, overwrite, or exit choice.
Keep visible_text under 160 characters and reason under 20 words so the JSON always closes.

Return only this JSON shape:
{{"observation":{{"state":"title|main_menu|submenu|game_world|combat|error|loading|unknown","visible_text":"...","selected_item":"...","looks_crashed":false}},"action":"one allowed action","reason":"short visible reason","done":false,"verdict":"in_progress|visible_goal_reached|visible_error|uncertain"}}"""


def sequence_goal(overall_goal: str, checkpoints: tuple[str, ...], index: int) -> str:
    if not checkpoints:
        return overall_goal
    return (
        f"Overall test: {overall_goal}\n"
        f"Current checkpoint {index + 1}/{len(checkpoints)}: {checkpoints[index]}\n"
        "Return action=stop and verdict=visible_goal_reached only when this current checkpoint is visible. "
        "The harness will then continue to the next checkpoint in the same DOSBox process."
    )


def ask_ollama(image_path: Path, model: str, host: str, prompt: str, timeout: int) -> str:
    payload = {
        "model": model,
        "prompt": prompt,
        "images": [base64.b64encode(image_path.read_bytes()).decode("ascii")],
        "stream": False,
        "think": False,
        "format": "json",
        "options": {"temperature": 0, "num_predict": 1200},
    }
    request = urllib.request.Request(
        f"{host.rstrip('/')}/api/generate",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            result = json.loads(response.read())
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Ollama HTTP {error.code}: {detail}") from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"Ollama request failed at {host}: {error}") from error
    if result.get("error"):
        raise RuntimeError(f"Ollama returned error: {result['error']}")
    return str(result.get("response", "")).strip()


def append_jsonl(path: Path, record: dict[str, Any]) -> None:
    with path.open("a", encoding="utf-8", newline="\n") as output:
        output.write(json.dumps(record, separators=(",", ":")) + "\n")


def run_agent(
    output_dir: Path,
    goal: str,
    model: str,
    host: str,
    allowed_actions: tuple[str, ...],
    max_steps: int,
    timeout: int,
    pace: float,
    hold: float,
    checkpoints: tuple[str, ...] = (),
) -> dict[str, Any]:
    invalid = [action for action in allowed_actions if action not in dosbox_gamelink.SCAN_CODES and action not in {"wait", "stop"}]
    if invalid:
        raise ValueError(f"unsupported allowed actions: {', '.join(invalid)}")
    if len(set(allowed_actions)) != len(allowed_actions):
        raise ValueError("allowed actions must be unique")

    output_dir.mkdir(parents=True, exist_ok=False)
    log_path = output_dir / "agent.jsonl"
    started = datetime.now(timezone.utc).isoformat()
    previous: dict[str, Any] | None = None
    previous_frame_sha256: str | None = None
    final_decision: dict[str, Any] = {"done": False, "verdict": "max_steps"}
    checkpoint_index = 0
    completed_checkpoints: list[dict[str, Any]] = []

    with dosbox_gamelink.GameLink(timeout=10.0) as link:
        initial_status = link.status()
        for step in range(max_steps):
            metadata, pixels = link.frame()
            frame_path = output_dir / f"frame-{step:02d}.png"
            dosbox_gamelink.write_png(frame_path, metadata["width"], metadata["height"], pixels)
            frame_sha256 = hashlib.sha256(frame_path.read_bytes()).hexdigest()
            prompt_previous = dict(previous) if previous else None
            if prompt_previous is not None:
                prompt_previous["framebuffer_changed"] = frame_sha256 != previous_frame_sha256
                prompt_previous["current_frame_sha256"] = frame_sha256
            prompt = build_prompt(
                sequence_goal(goal, checkpoints, checkpoint_index),
                allowed_actions,
                step,
                prompt_previous,
            )
            called_at = time.monotonic()
            raw = ask_ollama(frame_path, model, host, prompt, timeout)
            elapsed = time.monotonic() - called_at
            try:
                decision = normalize_decision(extract_json(raw), set(allowed_actions))
                parse_error = None
            except ValueError as error:
                decision = {
                    "observation": {"state": "unknown", "visible_text": "", "selected_item": "", "looks_crashed": False},
                    "action": "stop",
                    "reason": "invalid model response",
                    "done": True,
                    "verdict": "uncertain",
                }
                parse_error = str(error)
            menu_reason = ambiguous_goldbox_menu(decision["observation"])
            if menu_reason and decision["action"] != "stop":
                decision = {
                    **decision,
                    "action": "stop",
                    "done": True,
                    "verdict": "uncertain",
                    "reason": f"host guard: {menu_reason}",
                }

            record = {
                "schema_version": 1,
                "step": step,
                "frame": {"file": frame_path.name, "sha256": frame_sha256, **metadata},
                "model": model,
                "model_elapsed_seconds": round(elapsed, 3),
                "raw_response": raw,
            "parse_error": parse_error,
            "host_menu_guard": menu_reason,
                "model_call_skipped": False,
                "decision": decision,
                "previous_mechanical_result": previous,
            }
            append_jsonl(log_path, record)
            final_decision = decision
            previous_frame_sha256 = frame_sha256
            print(json.dumps({"step": step, "frame_sha256": frame_sha256, "decision": decision}))
            if decision["done"]:
                checkpoint_reached = (
                    bool(checkpoints)
                    and decision["verdict"] == "visible_goal_reached"
                    and checkpoint_index < len(checkpoints)
                )
                if checkpoint_reached:
                    completed_checkpoints.append({
                        "index": checkpoint_index,
                        "goal": checkpoints[checkpoint_index],
                        "step": step,
                        "frame": frame_path.name,
                        "frame_sha256": frame_sha256,
                        "observation": decision["observation"],
                    })
                    checkpoint_index += 1
                    if checkpoint_index < len(checkpoints):
                        previous = {
                            "checkpoint_completed": checkpoints[checkpoint_index - 1],
                            "frame_sequence_before": metadata["sequence"],
                            "frame_sequence_after": metadata["sequence"],
                            "frame_sequence_changed": False,
                            "previous_frame_sha256": frame_sha256,
                        }
                        continue
                break

            action = decision["action"]
            before_sequence = metadata["sequence"]
            if action == "wait":
                time.sleep(pace)
            else:
                link.press(action, hold)
                time.sleep(pace)
            after = link.status()["frame"]
            previous = {
                "action": action,
                "frame_sequence_before": before_sequence,
                "frame_sequence_after": after["sequence"],
                "frame_sequence_changed": after["sequence"] != before_sequence,
                "previous_frame_sha256": frame_sha256,
            }

    summary = {
        "schema_version": 1,
        "started_utc": started,
        "goal": goal,
        "model": model,
        "allowed_actions": list(allowed_actions),
        "max_steps": max_steps,
        "initial_status": initial_status,
        "final_decision": final_decision,
        "checkpoints": list(checkpoints),
        "completed_checkpoints": completed_checkpoints,
        "all_checkpoints_completed": bool(checkpoints) and checkpoint_index == len(checkpoints),
        "log": log_path.name,
        "claim_boundary": "model observations navigate and annotate pixels; hashes and debugger/runtime evidence remain authoritative",
    }
    (output_dir / "summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8", newline="\n")
    return summary


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--goal", required=True)
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--host", default="http://localhost:11434")
    parser.add_argument("--actions", nargs="+", default=list(DEFAULT_ACTIONS))
    parser.add_argument("--max-steps", type=int, default=12)
    parser.add_argument("--timeout", type=int, default=180)
    parser.add_argument("--pace", type=float, default=1.0)
    parser.add_argument("--hold", type=float, default=0.15)
    parser.add_argument(
        "--checkpoint",
        action="append",
        default=[],
        help="ordered visible checkpoint; repeat to keep one agent/process running through a full test",
    )
    args = parser.parse_args()
    if not 1 <= args.max_steps <= 100:
        parser.error("--max-steps must be between 1 and 100")
    summary = run_agent(
        args.output,
        args.goal,
        args.model,
        args.host,
        tuple(args.actions),
        args.max_steps,
        args.timeout,
        args.pace,
        args.hold,
        tuple(args.checkpoint),
    )
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
