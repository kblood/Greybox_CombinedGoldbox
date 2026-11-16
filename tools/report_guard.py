"""Refuse to replace a broad corpus report with a narrower one.

Why this exists
---------------
Several report generators under ``tools/`` write a corpus-wide Markdown report and also accept a
scope-narrowing flag such as ``--profile``. Run one with a narrow scope and it happily rewrites the
checked-in corpus-wide report with a single-title version. The loss is silent: the command exits 0
and prints a plausible summary line, and the damage only shows up in ``git diff``.

This has destroyed checked-in reports twice:

* ``docs/engine/research/gen1-ecl-natural-encounters.md`` -- 242 lines covering 11 titles, lost to
  ``gen1_ecl_encounter_scan.py --markdown <that path>`` run for one game. The path came from the
  recipe documented in the repo, not from a default argument.
* ``docs/engine/research/gen1-area-mode-writes.md`` -- 172 lines covering 11 titles, lost to
  ``map_gen1_area_mode_writes.py`` run with ``--profile``. The path came from the tool's own
  ``DEFAULT_MARKDOWN``. This happened despite the operator brief naming that exact tool and that
  exact file as a hazard.

Two incidents, two different doors (explicit argument, default argument), and a written warning
failed to prevent the second. So the guard belongs on the write itself rather than on the argument
parsing or on the instructions: whatever route the path arrives by, a write that would shrink a
report's title coverage stops here.

What it checks
--------------
Coverage is the set of corpus game titles named anywhere in the report text. A write is refused
when the new text's coverage is a *proper subset* of the existing file's. Equal coverage passes
(an ordinary regeneration), and growing coverage passes (Gateway going 0 -> 24 sites added a
section and widened coverage). Disjoint or overlapping-but-not-subset coverage also passes, since
that is a different report rather than a narrowed one -- this guard deliberately catches the one
failure mode it can identify with certainty, and does not try to be a general-purpose diff police.

``--force`` is honoured by the callers for the legitimate case of deliberately re-scoping a report.
"""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Iterable


def _corpus_titles() -> list[str]:
    """Game titles from the corpus profile table, longest first so substrings do not shadow."""
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import goldbox_corpus as gc  # imported lazily: this module is used by goldbox_corpus's siblings

    titles = []
    for profile in gc.PROFILES:
        title = profile.get("title") if isinstance(profile, dict) else getattr(profile, "title", None)
        if title:
            titles.append(title)
    return sorted(set(titles), key=len, reverse=True)


def coverage(text: str, titles: Iterable[str] | None = None) -> set[str]:
    """The set of corpus game titles named in ``text``."""
    return {title for title in (titles or _corpus_titles()) if title in text}


def guard_narrowing_write(path: Path, new_text: str, *, force: bool = False, label: str = "") -> None:
    """Exit non-zero if writing ``new_text`` to ``path`` would shrink the report's title coverage.

    Call this immediately before the write. Raises SystemExit rather than returning a status so a
    caller cannot proceed by ignoring a return value -- the whole point is that the failure mode is
    silent success.
    """
    path = Path(path)
    if force or not path.exists():
        return

    try:
        existing = path.read_text(encoding="utf-8")
    except OSError:
        return  # unreadable existing file is not this guard's problem

    titles = _corpus_titles()
    before = coverage(existing, titles)
    after = coverage(new_text, titles)

    if not before or not after < before:
        return

    lost = sorted(before - after)
    what = label or path.name
    raise SystemExit(
        f"\nREFUSING TO WRITE {path}\n"
        f"  This would narrow {what} from {len(before)} title(s) to {len(after)}.\n"
        f"  Titles that would be dropped ({len(lost)}):\n"
        + "".join(f"    - {t}\n" for t in lost)
        + "  The checked-in report is corpus-wide; this run is scoped to a subset, so writing it\n"
        "  here would silently delete the other titles' sections (this has happened twice).\n"
        "  Send scoped output somewhere else instead:\n"
        f"    --markdown <scratchpad>/{path.name}\n"
        "  Or, if you really do intend to re-scope the checked-in report, pass --force.\n"
    )
