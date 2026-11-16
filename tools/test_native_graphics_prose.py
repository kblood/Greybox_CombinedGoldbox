"""Gate: `native/README.md`'s per-category `/G` table must match `native/src/gbboot.asm`.

WHY THIS EXISTS
---------------
`native/README.md:147` read "Amiga scene/sprite categories beyond this first wall-resource
set remain next" from 2026-07-15 (`23ba4970`) until 2026-09-05. It was falsified ten days
after it was written by the scene bridge (`198212d`, `3962d62`, `51bc7d5`, `0056fc3`, all
2026-07-25). The README was edited again on 2026-08-21 (`14c8e08`) without revisiting it,
and on 2026-09-05 an integrator read that line, believed it, and wrote "the graphics switch
covers ONE resource category" into `CLAUDE.md` -- hours after correcting a different
ten-week-stale claim in the same file. Prose that nothing re-derives is read with authority.

WHAT IT IS ANCHORED TO, AND WHAT IT IS NOT
------------------------------------------
It is anchored to the GATE CONDITIONS, not to line numbers and not to prose keywords:
for each routine named in the README table, this module locates the top-level label in
`gbboot.asm`, strips comments, finds `cmp byte [graphics_requested], 2` inside that
routine's body, follows the conditional branch taken when the answer is "not Amiga", and
asks whether that branch's block is a bare `ret` or real work. Promoting a category (turning
its bare-`ret` refusal into a DOS decode) changes the derived token and forces the table to
move; demoting one does too; renaming or deleting the routine fails the check outright.

There is deliberately no line-number pin anywhere in this file. The plan's must-decline-if
was "the gate conditions cannot be anchored without a brittle line-number pin" -- they can:
routine label + instruction pattern + branch-target shape survives arbitrary edits above,
below, and inside the routine, and only moves when the gate itself moves.

THE STATE VOCABULARY
--------------------
`amiga-only`     the routine tests `graphics_requested == 2` and returns without doing its
                 work when the answer is no. This is what BOTH scene and icon categories
                 were at `50b4444`, and what the stale line described.
`dos-fallback`   the routine tests it and, when the answer is no, continues into a DOS
                 decode path instead of returning.
`no-gate`        the routine does not test the requested set at all; the platform choice is
                 made downstream.

WHAT THIS CHECK WOULD *NOT* HAVE CAUGHT, SAID OUT LOUD
------------------------------------------------------
Measured, not assumed: run against the pre-round-36 README *and* the pre-round-36
assembler (both at `50b4444`), this check reports 3 violations and every one of them is
the format complaint "no per-category table row names this routine". The stale-sentence
guard does NOT fire in that frame, because on 2026-07-25 the scene commits added a DOS
decode path but left it behind the Amiga gate for non-demo play -- `present_precombat_pictures`
still derived `amiga-only`, so the sentence still agreed with the gate. This check is
therefore not a retrospective catch for the exact 2026-07-15 -> 2026-07-25 drift the round-36
plan describes; that drift was about a decode path becoming reachable in the demo frame, not
about a gate condition moving. What it does catch is any change to the gate conditions from
here on, in either direction, plus the absence of the table itself. Claiming more than that
would be the same overreach the README line was guilty of.

THE NULL
--------
`test_check_fails_on_the_pre_round_36_readme` is the mandated null: the check is run against
the README exactly as it read at `HEAD` (`50b4444`) with today's assembler, and MUST report
violations. A guard only ever seen passing on the text it was written for has not been shown
to detect anything -- round 35 shipped three checks that could not fail. That test reads the
old text from a committed fixture path via `git show`, and FAILS (not skips) if git cannot
produce it, because a skip is how a vacuous check passes.
"""

from __future__ import annotations

import re
import subprocess
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
ASM_PATH = REPO_ROOT / "native" / "src" / "gbboot.asm"
README_PATH = REPO_ROOT / "native" / "README.md"

# The commit this round started from; its README carries the stale line.
NULL_BASE_REV = "50b4444"

GATE_STATES = ("amiga-only", "dos-fallback", "no-gate")

TOP_LABEL_RE = re.compile(r"^([A-Za-z_][A-Za-z0-9_]*):")
LOCAL_LABEL_RE = re.compile(r"^(\.[A-Za-z0-9_]+):")
GATE_CMP_RE = re.compile(r"^cmp\s+byte\s+\[graphics_requested\]\s*,\s*2\s*$", re.IGNORECASE)
COND_JUMP_RE = re.compile(r"^(jne|jnz|je|jz)\s+(\.[A-Za-z0-9_]+)\s*$", re.IGNORECASE)

# Instructions that make a block a bare return rather than a real code path.
BARE_RET_OK = {"ret", "retn", "retf", "stc", "clc", "nop"}


def strip_comment(line: str) -> str:
    """Drop an assembler `;` comment, honouring single/double quoted operands."""
    out = []
    quote = ""
    for ch in line:
        if quote:
            out.append(ch)
            if ch == quote:
                quote = ""
            continue
        if ch in "'\"":
            quote = ch
            out.append(ch)
            continue
        if ch == ";":
            break
        out.append(ch)
    return "".join(out).rstrip()


def routine_body(asm_text: str, name: str) -> list[str]:
    """Return the comment-stripped instruction lines of one top-level routine.

    Raises LookupError when the routine is absent -- renaming a gated routine must fail
    this gate loudly rather than silently deriving nothing.
    """
    lines = asm_text.splitlines()
    start = None
    for i, raw in enumerate(lines):
        stripped = strip_comment(raw)
        m = TOP_LABEL_RE.match(stripped)
        if m and m.group(1) == name:
            start = i + 1
            break
    if start is None:
        raise LookupError(f"routine {name!r} has no top-level label in the assembler source")
    body: list[str] = []
    for raw in lines[start:]:
        stripped = strip_comment(raw)
        if TOP_LABEL_RE.match(stripped):
            break
        body.append(stripped)
    return body


def _block_after_local_label(body: list[str], label: str) -> list[str]:
    """Instructions belonging to `label` within a routine body, up to the next local label."""
    idx = None
    for i, line in enumerate(body):
        m = LOCAL_LABEL_RE.match(line.strip())
        if m and m.group(1) == label:
            idx = i
            break
    if idx is None:
        return []
    block: list[str] = []
    # A label may carry its first instruction on the same line.
    tail = body[idx].strip()[len(label) + 1 :].strip()
    if tail:
        block.append(tail)
    for line in body[idx + 1 :]:
        s = line.strip()
        if not s:
            continue
        if LOCAL_LABEL_RE.match(s):
            break
        block.append(s)
    return block


def _is_bare_return(block: list[str]) -> bool:
    if not block:
        return False
    mnemonics = [b.split()[0].lower() for b in block if b.split()]
    if "ret" not in mnemonics and "retn" not in mnemonics and "retf" not in mnemonics:
        return False
    return all(m in BARE_RET_OK for m in mnemonics)


def derive_gate_state(asm_text: str, routine: str) -> str:
    """Classify one routine's `/G` gate from the assembler source alone."""
    body = routine_body(asm_text, routine)
    instrs = [(i, line.strip()) for i, line in enumerate(body) if line.strip()]
    for pos, (idx, line) in enumerate(instrs):
        if not GATE_CMP_RE.match(line):
            continue
        if pos + 1 >= len(instrs):
            raise ValueError(f"{routine}: gate compare is the last instruction in the routine")
        nxt = instrs[pos + 1][1]
        m = COND_JUMP_RE.match(nxt)
        if not m:
            raise ValueError(
                f"{routine}: gate compare is not followed by a conditional branch "
                f"(found {nxt!r}); this classifier can no longer read the gate"
            )
        mnemonic, target = m.group(1).lower(), m.group(2)
        if mnemonic in ("jne", "jnz"):
            not_amiga_block = _block_after_local_label(body, target)
        else:
            # `je .amiga` -- the not-Amiga path is the fallthrough.
            not_amiga_block = [t for _, t in instrs[pos + 2 :]]
            trimmed: list[str] = []
            for s in not_amiga_block:
                if LOCAL_LABEL_RE.match(s):
                    break
                trimmed.append(s)
            not_amiga_block = trimmed
        return "amiga-only" if _is_bare_return(not_amiga_block) else "dos-fallback"
    return "no-gate"


README_TABLE_ROW_RE = re.compile(
    r"^\|[^|]*\|\s*`(?P<routine>[A-Za-z_][A-Za-z0-9_]*)`\s*\|\s*`(?P<state>[a-z-]+)`\s*\|\s*$"
)

# The exact stale claim family this gate exists to stop recurring, plus the shape of it.
STALE_SCENE_SPRITE_RE = re.compile(
    r"(?i)amiga[^.\n]*\b(scene|sprite)[^.]*\bremains?\s+next"
)

# The honest replacement prose QUOTES the retracted sentence, which is the repo's
# convention for a correction. A same-line `"..."` span is therefore treated as
# historical citation and removed before the recurrence guard runs. The cost is stated
# rather than hidden: a future stale claim written inside same-line double quotes would
# evade this one guard. It would not evade the table comparison above, which is the
# primary anchor -- this regex is a second, narrower net for the specific sentence that
# caused the 2026-09-05 false claim.
SAME_LINE_QUOTE_RE = re.compile(r'"[^"\n]*"')


def parse_readme_table(readme_text: str) -> dict[str, str]:
    """Routine name -> claimed gate state, from the README's per-category table."""
    claims: dict[str, str] = {}
    for line in readme_text.splitlines():
        m = README_TABLE_ROW_RE.match(line.strip())
        if m:
            claims[m.group("routine")] = m.group("state")
    return claims


def check(asm_text: str, readme_text: str) -> list[str]:
    """Return every contradiction between the README's table and the assembler gates."""
    violations: list[str] = []
    claims = parse_readme_table(readme_text)

    # The three categories `/G` reaches. Each name must exist in the assembler.
    required = (
        "prepare_alt_graphics",
        "present_precombat_pictures",
        "prepare_combat_graphics",
    )

    derived: dict[str, str] = {}
    for routine in required:
        try:
            derived[routine] = derive_gate_state(asm_text, routine)
        except LookupError as exc:
            violations.append(f"{routine}: {exc}")

    for routine in required:
        if routine not in derived:
            continue
        if routine not in claims:
            violations.append(
                f"{routine}: the assembler gates this category ({derived[routine]}) but "
                f"native/README.md carries no per-category table row naming it"
            )
            continue
        claimed = claims[routine]
        if claimed not in GATE_STATES:
            violations.append(
                f"{routine}: README claims unknown gate state {claimed!r}; "
                f"expected one of {GATE_STATES}"
            )
            continue
        if claimed != derived[routine]:
            violations.append(
                f"{routine}: README says `{claimed}` but gbboot.asm gates it as "
                f"`{derived[routine]}`"
            )

    for routine in sorted(set(claims) - set(required)):
        violations.append(
            f"{routine}: README claims a `/G` gate state for a routine this check does not "
            f"derive; add it to `required` or drop the row"
        )

    # Recurrence guard for the specific sentence that caused the 2026-09-05 false claim.
    scene_state = derived.get("present_precombat_pictures")
    icon_state = derived.get("prepare_combat_graphics")
    if scene_state not in (None, "amiga-only") or icon_state not in (None, "amiga-only"):
        m = STALE_SCENE_SPRITE_RE.search(SAME_LINE_QUOTE_RE.sub("", readme_text))
        if m:
            violations.append(
                "native/README.md still says Amiga scene/sprite categories "
                f"{m.group(0)!r}, but gbboot.asm gates the scene category as "
                f"`{scene_state}` and the combat-icon category as `{icon_state}`"
            )
    return violations


def check_c64_picture_order(asm_text: str) -> list[str]:
    """Return ordering violations for the live `/G 3` scene branch.

    `prepare_c64_scene` validates its imported GBIM's logical picture id against
    `graphics_picture_id`. A pre-combat replay deliberately supplies that id and
    sets `graphics_picture_locked`; an ordinary live effect does neither. Its
    branch must therefore read the current effect before it attempts the C64
    match. This is a control-flow contract, separate from the README's Amiga
    gate table, and is inspectable without a locally installed C64 fixture.
    """
    try:
        body = routine_body(asm_text, "prepare_alt_graphics")
    except LookupError as exc:
        return [str(exc)]
    text = "\n".join(line.strip() for line in body if line.strip())
    required = (
        "cmp     byte [graphics_requested], 3\njne     .not_c64\n"
        "cmp     byte [graphics_picture_locked], 0\njne     .c64_picture_ready\n"
        "call    read_effect_picture\njc      .not_c64\n"
        ".c64_picture_ready:\ncall    prepare_c64_scene"
    )
    if required not in text:
        return [
            "prepare_alt_graphics: the unpinned `/G 3` branch must read the current "
            "effect picture before prepare_c64_scene"
        ]
    return []


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _git_show(rev: str, path: str) -> str:
    proc = subprocess.run(
        ["git", "show", f"{rev}:{path}"],
        cwd=REPO_ROOT,
        capture_output=True,
    )
    if proc.returncode != 0:
        raise RuntimeError(
            f"`git show {rev}:{path}` failed: {proc.stderr.decode('utf-8', 'replace').strip()}"
        )
    return proc.stdout.decode("utf-8")


GATE_LINES = ("        cmp     byte [graphics_requested], 2", "        jne     .gbpin_bare_ret")
PIN_RET_BLOCK = (".gbpin_bare_ret:", "        ret")


def _mutate_gate(asm_text: str, routine: str, state: str) -> str:
    """Return `asm_text` with one routine's `/G` gate flipped, for the side-B mutation.

    Direction-aware so the helper does not encode which state any routine is currently
    in (that would smuggle back the constant this test exists to avoid):

    * a routine that HAS a gate loses it -- the `cmp byte [graphics_requested], 2` and the
      conditional branch that follows it are deleted, so the routine must fall to `no-gate`;
    * a routine that has NO gate gains one -- a compare plus `jne` to an injected bare-`ret`
      local label is spliced in directly after the routine's label, so it must leave `no-gate`.

    Raises rather than returning the input unchanged: a mutation that silently no-ops is how
    a mutation test passes without mutating anything.
    """
    lines = asm_text.splitlines()
    start = None
    end = len(lines)
    for i, raw in enumerate(lines):
        m = TOP_LABEL_RE.match(strip_comment(raw))
        if m and m.group(1) == routine:
            start = i + 1
            break
    if start is None:
        raise LookupError(f"routine {routine!r} not found for mutation")
    for j in range(start, len(lines)):
        if TOP_LABEL_RE.match(strip_comment(lines[j])):
            end = j
            break

    region = lines[start:end]
    if state == "no-gate":
        for line in region:
            if GATE_CMP_RE.match(strip_comment(line).strip()):
                raise AssertionError(
                    f"{routine}: classified `no-gate` but the body does contain a gate compare"
                )
        mutated_region = list(GATE_LINES) + region + list(PIN_RET_BLOCK)
    else:
        mutated_region = []
        drop_next_branch = False
        removed = 0
        for line in region:
            bare = strip_comment(line).strip()
            if GATE_CMP_RE.match(bare):
                drop_next_branch = True
                removed += 1
                continue
            if drop_next_branch:
                drop_next_branch = False
                if COND_JUMP_RE.match(bare):
                    continue
            mutated_region.append(line)
        if removed == 0:
            raise AssertionError(
                f"{routine}: classified {state!r} but no gate compare was found to delete"
            )
    mutated = lines[:start] + mutated_region + lines[end:]
    out = "\n".join(mutated)
    if out == asm_text:
        raise AssertionError(f"{routine}: mutation produced an identical source")
    return out


FIRST_PERSON_README_SENTENCE = "First-person encounter art (DOS), T6-2/T6-3"


def check_first_person_encounter_art(asm: str, ccfp: str, readme: str) -> list[str]:
    """First-person approach marker (T6, 2026-10-13): DOS now draws real CPIC1 art.

    Derived from instructions, like the table above: `prepare_alt_graphics` must have a
    `.dos_image` arm that reaches `find_dos_cpic` and `child_gb`, and CCFP's
    `load_gbim` / `draw_effect_setup` must not test `graphics_alt_enabled`.  The README
    must carry the measured paragraph and must no longer say the marker stays "until
    native CPIC/sprite encounter art exists".
    """
    out: list[str] = []
    try:
        body = chr(10).join(strip_comment(l).strip() for l in routine_body(asm, "prepare_alt_graphics"))
    except LookupError as exc:
        return [str(exc)]
    for need in ("jne     .dos_image", ".dos_image:", "call    find_dos_cpic",
                 "mov     word [runpathp], child_gb"):
        if need.replace(" ", "") not in body.replace(" ", ""):
            out.append(f"prepare_alt_graphics lost the DOS encounter-art arm ({need!r})")
    for routine in ("load_gbim", "draw_effect_setup"):
        try:
            rb = chr(10).join(strip_comment(l) for l in routine_body(ccfp, routine))
        except LookupError as exc:
            out.append(str(exc))
            continue
        if "graphics_alt_enabled" in rb:
            out.append(f"ccfp.asm {routine} tests graphics_alt_enabled again: DOS icons cannot draw")
    if FIRST_PERSON_README_SENTENCE not in readme:
        out.append("README lacks the measured first-person encounter art paragraph")
    if "until native CPIC/sprite encounter art exists" in readme:
        out.append("README still says the marker stays until native CPIC art exists")
    return out


class NativeGraphicsProseGate(unittest.TestCase):
    def test_sources_exist(self) -> None:
        self.assertTrue(ASM_PATH.is_file(), f"missing {ASM_PATH}")
        self.assertTrue(README_PATH.is_file(), f"missing {README_PATH}")

    def test_readme_table_matches_assembler_gates(self) -> None:
        violations = check(_read(ASM_PATH), _read(README_PATH))
        self.assertEqual([], violations, "\n".join(violations))

    def test_first_person_encounter_art_is_wired_and_documented(self) -> None:
        asm, readme = _read(ASM_PATH), _read(README_PATH)
        ccfp = _read(ASM_PATH.parent / "ccfp.asm")
        self.assertEqual([], check_first_person_encounter_art(asm, ccfp, readme))
        # nulls: each regression is reported
        self.assertTrue(check_first_person_encounter_art(
            asm.replace("jne     .dos_image", "jne     .scene"), ccfp, readme))
        nl = chr(10)
        anchor = "        cmp     byte [gbim_enabled], 0" + nl + "        je      .marker"
        regated = "        cmp     byte [graphics_alt_enabled], 0" + nl + "        je      .marker" + nl + anchor
        self.assertIn(anchor, ccfp)
        self.assertTrue(check_first_person_encounter_art(asm, ccfp.replace(anchor, regated, 1), readme))
        self.assertTrue(check_first_person_encounter_art(
            asm, ccfp, readme.replace(FIRST_PERSON_README_SENTENCE, "x")))

    def test_c64_scene_reads_the_current_live_picture_before_matching(self) -> None:
        asm = _read(ASM_PATH)
        violations = check_c64_picture_order(asm)
        self.assertEqual([], violations, "\n".join(violations))

        # The null removes only the current-effect read. The `locked` replay
        # arm remains intact, so a guard that merely looks for either token in
        # the routine cannot pass this mutation.
        mutated = asm.replace(
            "        call    read_effect_picture\n        jc      .not_c64\n.c64_picture_ready:\n"
            "        call    prepare_c64_scene\n",
            "        ; missing current picture read\n.c64_picture_ready:\n",
            1,
        )
        self.assertNotEqual(asm, mutated, "C64 ordering mutation did not apply")
        violations = check_c64_picture_order(mutated)
        self.assertNotEqual(
            [],
            violations,
            "removing the current-picture read did not trip the C64 ordering guard",
        )

    def test_each_gate_is_pinned_two_sided(self) -> None:
        """Two-sided pin on every `/G` gate, read out of `native/src/gbboot.asm`.

        REPLACED 2026-09-05. What stood here was named
        `test_classifier_reads_all_three_categories` and its whole assertion was
        `self.assertIn(state, GATE_STATES)` -- where `state` came from
        `derive_gate_state`, which returns nothing but the three literals that MAKE UP
        `GATE_STATES`. It could not fail for any state of the source it claimed to pin,
        while its docstring told the reader it was the two-sided one. That is the fifth
        vacuous probe this project has shipped in two rounds; see
        `goldbox-probe-must-be-able-to-fail`.

        The two sides, and what each actually detects:

        SIDE A (the gate moved) -- the token derived from the assembler must equal the
        token `native/README.md`'s per-category table claims for that routine. Flipping a
        real gate in `gbboot.asm` turns this red immediately. No expected state is written
        into this file: the README table is the single source of truth, so a deliberate
        gate change is landed by moving the code and the table together, not three places.

        SIDE B (the classifier went blind) -- mutate that routine's gate in memory and the
        derived token MUST move, and `check()` MUST then report a violation against the
        unchanged README. A classifier that had degenerated to a constant passes side A
        trivially (it would agree with any table that happened to match); it cannot pass
        side B. The mutation is direction-aware: a gated routine has its gate deleted and
        must fall to `no-gate`; an ungated routine has one injected and must leave it.

        What this does NOT catch, said out loud: side A only fires when code and README
        disagree, so a change that edits both in the same commit passes -- which is the
        intended behaviour, not a hole. And neither side says anything about whether the
        gate is the RIGHT gate; it says the prose and the instructions agree."""
        asm = _read(ASM_PATH)
        claims = parse_readme_table(_read(README_PATH))
        for routine in (
            "prepare_alt_graphics",
            "present_precombat_pictures",
            "prepare_combat_graphics",
        ):
            body = routine_body(asm, routine)  # LookupError if renamed/deleted
            self.assertTrue(
                [line for line in body if line.strip()],
                f"{routine}: located but its body is empty; the classifier is reading nothing",
            )
            state = derive_gate_state(asm, routine)

            # SIDE A: pinned against the README table, not against a constant in here.
            self.assertIn(
                routine, claims, f"{routine}: no per-category table row in native/README.md"
            )
            self.assertEqual(
                claims[routine],
                state,
                f"{routine}: gbboot.asm gates it as `{state}` but native/README.md's "
                f"per-category table says `{claims[routine]}`",
            )

            # SIDE B: the token has to be a function of the gate text, not a constant.
            mutated = _mutate_gate(asm, routine, state)
            mutated_state = derive_gate_state(mutated, routine)
            self.assertNotEqual(
                state,
                mutated_state,
                f"{routine}: mutating its gate left the derived state at {state!r}; "
                f"derive_gate_state is not reading this routine's gate",
            )
            self.assertNotEqual(
                [],
                check(mutated, _read(README_PATH)),
                f"{routine}: a mutated gate did not contradict the README table",
            )

    def test_check_fails_on_the_pre_round_36_readme(self) -> None:
        """THE NULL. The check must go red on the README as it read at `50b4444`.

        This deliberately does not skip when git is unavailable: a check that can skip
        itself can pass without running, which is how three vacuous probes shipped in
        round 35."""
        old_readme = _git_show(NULL_BASE_REV, "native/README.md")
        violations = check(_read(ASM_PATH), old_readme)
        self.assertNotEqual(
            [],
            violations,
            "the pre-round-36 README did not trip this check; it detects nothing",
        )

    def test_check_fails_when_a_promoted_gate_is_demoted_in_code(self) -> None:
        """Mutation in the OTHER direction: revert the combat-icon gate to its
        `50b4444` shape and the current README must contradict it."""
        asm = _read(ASM_PATH)
        body_start = asm.index("prepare_combat_graphics:")
        head = asm[:body_start]
        tail = asm[body_start:]
        mutated_tail = tail.replace("jne     .try_dos", "jne     .ret", 1)
        self.assertNotEqual(tail, mutated_tail, "mutation did not apply")
        violations = check(head + mutated_tail, _read(README_PATH))
        self.assertNotEqual(
            [],
            violations,
            "demoting prepare_combat_graphics back to Amiga-only did not trip the check",
        )

    def test_stale_sentence_regex_matches_the_sentence_it_was_written_for(self) -> None:
        stale = (
            "Amiga scene/sprite categories beyond this first wall-resource set remain next."
        )
        self.assertIsNotNone(STALE_SCENE_SPRITE_RE.search(stale))
        self.assertIsNone(
            STALE_SCENE_SPRITE_RE.search(
                "No standalone sprite/portrait bank is on `/G` at all."
            ),
            "the recurrence guard must not fire on the honest replacement prose",
        )

    def test_recurrence_guard_fires_on_an_unquoted_reintroduction(self) -> None:
        """Two-sided pin on the quote exemption.

        Left one-sided, the exemption could swallow the guard entirely: a `sub` that
        deleted more than it should would make the guard silently unable to fire."""
        readme = _read(README_PATH)
        stale = (
            "\nAmiga scene/sprite categories beyond this first wall-resource set "
            "remain next.\n"
        )
        self.assertEqual([], check(_read(ASM_PATH), readme), "baseline must be clean")
        violations = check(_read(ASM_PATH), readme + stale)
        self.assertTrue(
            any("scene/sprite" in v for v in violations),
            f"re-introducing the stale sentence did not trip the guard: {violations}",
        )


if __name__ == "__main__":
    unittest.main()
