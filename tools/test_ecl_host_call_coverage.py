"""Tests for tools/ecl_host_call_coverage.py.

HISTORY: from 2026-09-09 to 2026-09-09, one of these tests --
`test_PIN_op_call_routine_id_dispatch_should_genuinely_diverge` -- was a
`pytest.mark.xfail(strict=True)` PIN of op_call's vacuous routine-id sub-dispatch (see MEMORY.md
`goldbox-corpus-suite-outside-the-gates.md` for why a bare red test is worse than a strict xfail
here). The ecl-op-call-real-dispatch item first closed that gap for two ids
(0xAE11, 0xE804) the same day, which -- per the pin's own design -- turned it into an XPASS and
a hard suite FAILURE, confirmed by actually running the suite before touching this file. That
forced follow-up is what renamed it to
`test_op_call_routine_id_dispatch_genuinely_diverges_for_grounded_ids`, a normal (non-xfail)
passing assertion. See that test's docstring for the grounding and scope limits.

Run with: python -m pytest tools/test_ecl_host_call_coverage.py -v
"""
from __future__ import annotations

import pytest

import ecl_host_call_coverage as m
import goldbox_corpus

# ---------------------------------------------------------------------------
# (a) Dispatch-table extraction, including the range-form defect the brief called out by name
# ---------------------------------------------------------------------------


def test_dispatch_map_handles_plain_je_pairs():
    comparisons = [(0x00, "je", "op_exit"), (0x01, "je", "op_goto")]
    mapping = m.dispatch_map_from_comparisons(comparisons, "op_default")
    assert mapping[0x00] == "op_exit"
    assert mapping[0x01] == "op_goto"
    assert mapping[0x02] == "op_default"


def test_dispatch_map_handles_range_form_like_ccecl_0x16_0x1b():
    # Mirrors the exact idiom in native/src/ccecl.asm: a `jb` guards the low end and an
    # unconditional fallthrough is only closed by a LATER `jbe` -- opcodes 0x16..0x1b all resolve
    # to op_if. This is the CRITICAL DEFECT the brief named: a naive cmp/je PAIR scraper (one
    # that assumes every cmp is immediately followed by its own je) misclassifies these six
    # opcodes, either dropping them or attributing them to op_default.
    comparisons = [
        (0x15, "je", "op_vertical_menu"),
        (0x16, "jb", "op_default"),
        (0x1B, "jbe", "op_if"),
        (0x1C, "je", "op_clearmonsters"),
    ]
    mapping = m.dispatch_map_from_comparisons(comparisons, "op_default")
    assert mapping[0x15] == "op_vertical_menu"
    for op in range(0x16, 0x1C):
        assert mapping[op] == "op_if", hex(op)
    assert mapping[0x1C] == "op_clearmonsters"
    assert mapping[0x1D] == "op_default"


def test_dispatch_map_pair_scraper_would_have_missed_the_range(monkeypatch=None):
    # Proves the defect is real, not hypothetical: a naive scraper that only understands
    # (cmp al,N / je LABEL) pairs and ignores jb/jbe entirely would see NO comparison at all for
    # 0x16..0x1b (both its jcc mnemonics are 'jb'/'jbe', not 'je') and so would classify every one
    # of those six opcodes as unimplemented (falling to the fallback), when they are not.
    comparisons_je_only = [(0x15, "je", "op_vertical_menu"), (0x1C, "je", "op_clearmonsters")]
    naive_mapping = m.dispatch_map_from_comparisons(comparisons_je_only, "op_default")
    for op in range(0x16, 0x1C):
        assert naive_mapping[op] == "op_default"  # the bug this tool must NOT have
    full_comparisons = [
        (0x15, "je", "op_vertical_menu"),
        (0x16, "jb", "op_default"),
        (0x1B, "jbe", "op_if"),
        (0x1C, "je", "op_clearmonsters"),
    ]
    correct_mapping = m.dispatch_map_from_comparisons(full_comparisons, "op_default")
    for op in range(0x16, 0x1C):
        assert correct_mapping[op] == "op_if"


def test_real_ccecl_dispatch_range_0x16_0x1b_resolves_to_op_if():
    mapping, fallback, _lines, _start, _end = m.build_dispatch_map()
    assert fallback == "op_default"
    for op in range(0x16, 0x1C):
        assert mapping[op] == "op_if", hex(op)
    # Boundaries just outside the range must NOT be swept in.
    assert mapping[0x15] == "op_vertical_menu"
    assert mapping[0x1C] == "op_clearmonsters"


def test_real_ccecl_spot_check_named_opcodes():
    mapping, fallback, _lines, _start, _end = m.build_dispatch_map()
    assert mapping[0x00] == "op_exit"
    assert mapping[0x2D] == "op_call"
    assert mapping[0x38] == "op_program"
    assert mapping[0xFF] == fallback


def test_extract_dispatch_chain_raises_on_missing_label():
    with pytest.raises(ValueError):
        m.extract_dispatch_chain(["no such label here"], start_label="does_not_exist")


# ---------------------------------------------------------------------------
# op_call vacuous-dispatch detector -- mutation-tested against synthetic fixtures.
# Real native/src/ccecl.asm is never edited anywhere in this file.
# ---------------------------------------------------------------------------

IDENTICAL_OP_CALL_ASM = """\
op_call:
        call    read_opp
        cmp     ax, 1
        je      .known
        cmp     ax, 2
        je      .known

        call    record_call_event
        mov     ax, [opp]
        mov     [pc], ax
        ret
.known:
        call    record_call_event
        mov     ax, [opp]
        mov     [pc], ax
        ret

op_next:
        ret
"""

DIVERGENT_OP_CALL_ASM = """\
op_call:
        call    read_opp
        cmp     ax, 1
        je      .known
        cmp     ax, 2
        je      .known

        call    record_call_event
        mov     ax, [opp]
        mov     [pc], ax
        ret
.known:
        call    dispatch_named_routine
        mov     ax, [opp]
        mov     [pc], ax
        ret

op_next:
        ret
"""


def test_detector_reports_no_divergence_on_identical_blocks():
    diverges, fallthrough, known = m.op_call_dispatch_diverges(IDENTICAL_OP_CALL_ASM.splitlines())
    assert diverges is False
    assert fallthrough == known


def test_detector_reports_divergence_when_mutated_MUTATION_PROOF():
    # This is the mutation test the brief requires for the vacuous-dispatch pin: take the
    # identical-blocks fixture above (which mirrors real op_call today), break the "always
    # identical" property in a controlled, synthetic copy, and prove the detector notices.
    # RED observed: test_detector_reports_no_divergence_on_identical_blocks would fail if run
    # against this fixture (diverges is True here, not False) -- restore below.
    diverges, fallthrough, known = m.op_call_dispatch_diverges(DIVERGENT_OP_CALL_ASM.splitlines())
    assert diverges is True
    assert fallthrough != known
    assert known[0] == "call dispatch_named_routine"
    # GREEN restore proof: the untouched identical fixture still reports no divergence, so the
    # detector distinguishes the two fixtures rather than always answering one way.
    diverges_control, _f, _k = m.op_call_dispatch_diverges(IDENTICAL_OP_CALL_ASM.splitlines())
    assert diverges_control is False


def test_detector_refuses_to_guess_when_extraction_assumption_breaks():
    broken = "op_call:\n        ret\n\nop_next:\n        ret\n"
    with pytest.raises(ValueError):
        m.op_call_dispatch_diverges(broken.splitlines())


def test_detector_refuses_empty_block_rather_than_report_false_pass():
    # A `.known:` immediately followed by the next function (empty known block) must refuse
    # rather than silently comparing [] == [] and reporting "no divergence" as if it had checked
    # something.
    degenerate = (
        "op_call:\n"
        "        cmp     ax, 1\n"
        "        je      .known\n"
        "        ret\n"
        ".known:\n"
        "op_next:\n"
        "        ret\n"
    )
    with pytest.raises(ValueError):
        m.op_call_dispatch_diverges(degenerate.splitlines())


def test_real_op_call_fallthrough_and_known_blocks_are_captured():
    lines = m.read_asm_lines()
    diverges, fallthrough, known = m.op_call_dispatch_diverges(lines)
    assert fallthrough, "fallthrough block extraction returned nothing"
    assert known, "known block extraction returned nothing"
    assert "record_call_event" in " ".join(fallthrough)
    assert "record_call_event" in " ".join(known)
    # FIXED 2026-09-09 (ecl-op-call-real-dispatch item): op_call's `.known:` now genuinely
    # diverges from its fallthrough for the two grounded ids (0xAE11, 0xE804) -- see the
    # formerly-xfailing pin immediately below, now a normal passing assertion.
    assert diverges is True


# ---------------------------------------------------------------------------
# FORMER STRICT XFAIL PIN, NOW A REAL PASSING ASSERTION (fixed 2026-09-09).
#
# This was `pytest.mark.xfail(strict=True)` from 2026-09-09 (opened the same day, by the
# ecl-coverage-metric-fix item) until the ecl-op-call-real-dispatch item closed it a few hours
# later. Per that pin's own design, making op_call genuinely diverge for ANY recognised id turns
# the old xfail into an XPASS, which `strict=True` converts into a hard suite FAILURE --
# confirmed by actually running the suite against the fix before touching this file:
# `test_PIN_op_call_routine_id_dispatch_should_genuinely_diverge` reported
# `[XPASS(strict)] KNOWN DEFECT (opened 2026-09-09, ...)` and the run exited non-zero. That is
# the pin doing exactly its documented job. This edit is the forced follow-up it demanded.
# ---------------------------------------------------------------------------


def test_op_call_routine_id_dispatch_genuinely_diverges_for_grounded_ids():
    """FIXED 2026-09-09 (ecl-op-call-real-dispatch item) -- was the strict xfail pin above.

    Three named CALL routine ids -- 0xAE11/0xADCC ("redraw dungeon view") and 0xE804
    ("advance animated picture") -- now have per-id behavior in CoK/DoK's own
    retail ECL corpus -- now produce native state/trace output that an unrecognised id does not:
    `native/src/ccecl.asm`'s `.known:` reads `[call_routine_id]` and branches to
    `.redraw_dungeon_view` / `.advance_animated_picture`, each of which does real work beyond the
    universal `record_call_event` (a position/facing snapshot, and a persistent picture-frame
    counter, each ATTACHED AS EXTRA OPERANDS to that same CALL event rather than appended as a
    second event -- see `extend_call_event_redraw` for why appending was wrong) before the two
    blocks reconverge on the same `mov ax,[opp] / mov [pc],ax / ret` tail every path already had.

    MUTATION-TESTED 2026-09-10, in-process and without touching `native/src` (a native sweep was
    in flight). `op_call_dispatch_diverges` is a BLOCK-EQUALITY check, not a "does the source
    mention 0xAE11" check, and two weaker mutations confirmed that: deleting only the `cmp`/`je`
    chain while leaving the `.redraw_dungeon_view:`/`.advance_animated_picture:` label blocks in
    place still reads as diverging, and so does deleting the whole tail. It flips to
    `diverges=False` only when `.known:` is restored to EXACTLY its fallthrough shape
    (`call record_call_event / mov ax,[opp] / mov [pc],ax / ret`), which is the real regression
    this assertion exists to catch. See that label's comment
    block for the COAB-decompile grounding (`coab_extracted/engine/ovr003.cs` `CMD_Call`'s
    `case 0xAE11` / `case 0xE804`, and `Classes/DaxFiles/DaxArray.cs`'s `NextFrame()`) and the
    explicit, disclosed scope limits (no GEO wall/roof id; no numFrames wrap).

    The other five named ids (SetupDuel x2, contextual sound, MovePositionForward, refresh
    outdoor wall type) are deliberately NOT touched -- grounding them would need combat-duel,
    sound-channel, and outdoor-wall-type state this VM does not own, and inventing that state
    would be worse than leaving the gap named. They still fall through to the original vacuous
    tail, which is why this assertion tests `op_call_dispatch_diverges` (the function-level
    verdict on `.known:` as a whole) rather than claiming per-id parity.

    See docs/engine/research/ecl-host-call-coverage.md for the full writeup and
    build/ecl-host-call-coverage.json's `op_call_vacuous_dispatch_finding` (now `diverges: true`)
    for the machine-readable verdict this assertion reads.
    """
    lines = m.read_asm_lines()
    diverges, _fallthrough, _known = m.op_call_dispatch_diverges(lines)
    assert diverges is True, (
        "op_call's .known: block is identical to its fallthrough again -- the grounded "
        "0xAE11/0xE804 dispatch in native/src/ccecl.asm appears to have regressed. See "
        "docs/engine/research/ecl-host-call-coverage.md."
    )


# ---------------------------------------------------------------------------
# (b)/(c) CFG-walk determinism and state-limit disclosure
# ---------------------------------------------------------------------------


def test_reachable_opcode_counts_are_deterministic_across_two_runs():
    report_a = m.build_report()
    report_b = m.build_report()
    assert report_a == report_b


def test_no_state_limit_hits_are_silently_capped():
    report = m.build_report()
    for pid, game in report["games"].items():
        assert game["state_limit_hits"] == 0, (
            f"{pid}: {game['state_limit_hits']} block(s) hit the CFG state cap. That is not "
            "necessarily wrong, but it must be surfaced explicitly rather than silently "
            "truncating the occurrence counts below it -- raise --max-states or report the cap "
            "in the doc before trusting this profile's coverage numbers."
        )


def test_count_reachable_opcodes_reports_state_limit_reached_when_capped():
    # Mutation proof for the state-limit disclosure mechanism itself: force an unrealistically
    # tiny cap on a real retail block and confirm the flag actually flips (never silently
    # swallowed as a clean, complete result).
    ecl_files = m.find_ecl_dax_files("champions-of-krynn")
    assert ecl_files, "CoK ECL*.DAX not found -- cannot mutation-test the state-limit flag"
    name, path = ecl_files[0]
    assert name == "ECL1.DAX"
    word_sets = m.word_sets_for_profile("champions-of-krynn")
    opcodes = m.opcodes_for_profile("champions-of-krynn")
    hit_limit = False
    for block in goldbox_corpus.read_dax_blocks(path):
        result = m.count_reachable_opcodes(
            block["raw"], m.DEFAULT_ADDRESS_ADDEND, word_sets, opcodes, max_states=1
        )
        if result["state_limit_reached"]:
            hit_limit = True
            break
    assert hit_limit, "expected at least one CoK ECL1.DAX block to exceed a max_states=1 cap"
    # And confirm the REAL default cap used by the standing report does not hit it for the same
    # file -- i.e. the flag is not just permanently stuck on.
    for block in goldbox_corpus.read_dax_blocks(path):
        result = m.count_reachable_opcodes(
            block["raw"], m.DEFAULT_ADDRESS_ADDEND, word_sets, opcodes, m.DEFAULT_MAX_STATES
        )
        assert result["state_limit_reached"] is False


# ---------------------------------------------------------------------------
# (b)/(c) CoK/DoK corpus decode sanity
# ---------------------------------------------------------------------------


def test_finds_real_cok_and_dok_ecl_files():
    for profile_id in m.TITLES:
        files = m.find_ecl_dax_files(profile_id)
        names = {name for name, _ in files}
        assert {"ECL1.DAX", "ECL2.DAX", "ECL3.DAX"} <= names, (profile_id, names)


def test_coverage_report_has_nonzero_reachable_instructions_for_both_titles():
    report = m.build_report()
    for pid, game in report["games"].items():
        assert game["total_reachable_instructions"] > 1000, (pid, game["total_reachable_instructions"])
        assert game["detected"] is True


def test_call_opcode_is_dispatched_but_never_falls_to_default():
    report = m.build_report()
    for pid, game in report["games"].items():
        call_row = next(r for r in game["opcodes"] if r["opcode"] == "0x2d")
        assert call_row["has_handler"] is True
        assert call_row["is_placeholder_recorder"] is False  # op_call, not op_script_effect
        assert call_row["applied"] is True  # "applied" per the handler-identity rule only --
        # op_call's own vacuity is proven separately (op_call_dispatch_diverges), not by this flag
        assert call_row["handler"] == "op_call"
        assert call_row["occurrences"] > 0
        # FIXED 2026-09-09 (ecl-op-call-real-dispatch item): this field is now the REAL
        # op_call_dispatch_diverges verdict, not a static `opcode == 0x2D`. Two ids (0xAE11,
        # 0xE804) now genuinely diverge, so CALL is no longer WHOLLY vacuous -- this is False,
        # not a claim that CALL is now fully applied (the other five named ids still aren't).
        assert call_row["vacuous_dispatch"] is False


def test_no_handler_note_describes_both_title_writeback_guards():
    """Both titles admit 0x41; DoK requires CCPARTY's cache before it writes."""
    report = m.build_report()
    assert "Both Krynn titles admit 0x41" in report["no_handler_ranking_note"]
    assert "validated DoK GBPR writeback" in report["no_handler_ranking_note"]
    native = report["no_handler_native_runtime_note"]
    for needle in ("vm_run", "op_award_xp", "two-operand frame", "threshold-cache capability"):
        assert needle in native, needle


def test_no_handler_note_renders_into_the_markdown_in_BOTH_branches():
    """The disclosure used to hide itself exactly when it had something to disclose.

    `render_markdown` printed `no_handler_ranking_note` only in the `else` arm -- the one taken
    when the ranking is EMPTY. So for as long as the table had no rows the reader got the
    explanation, and the moment a real unhandled opcode appeared the explanation vanished and
    left a bare three-column table. Both arms must now carry it.
    """
    report = m.build_report()
    rendered = m.render_markdown(report)
    assert report["no_handler_ranking_note"] in rendered
    assert report["no_handler_native_runtime_note"] in rendered

    # Mutation: force the empty branch on a copied report and confirm the note still renders,
    # so this test cannot pass merely because the live report happens to be non-empty.
    empty = dict(report)
    empty["opcodes_with_no_handler_ranked_by_occurrence"] = []
    rendered_empty = m.render_markdown(empty)
    assert report["no_handler_ranking_note"] in rendered_empty
    assert report["no_handler_native_runtime_note"] in rendered_empty


def test_naive_raw_scan_overcounts_relative_to_cfg_reachable_landing():
    """Demonstrates that a whole-file raw-byte scan overcounts an opcode value relative to a
    reachability-aware decode, because most file bytes are operand payload rather than opcode
    bytes and a raw scan also counts unreachable blocks.

    STRENGTHENED 2026-09-10 because this test went VACUOUS and stayed green while doing it.
    Its sole assertion was `demo["total"] > demo["cfg_reachable_landing_count"]`, and that field
    read `unknown_opcode_landings["0x41"]`. The moment 0x41 gained a decoder definition, a known
    opcode could no longer appear in the unknown table, so the right-hand side became a
    STRUCTURAL zero and the assertion degenerated to `617 > 0` -- true forever, regardless of
    what the walker does. It passed. Nothing went red. The comparison is now against the decoded
    occurrence count, and the bar is a ratio rather than mere inequality, so a right-hand side
    that collapses toward zero FAILS instead of passing harder.
    """
    report = m.build_report()
    demos = report["methodology_discrepancy_demo_opcode_0x41"]
    assert set(demos) == {"champions-of-krynn", "death-knights-of-krynn"}
    for pid, demo in demos.items():
        decoded = demo["cfg_reachable_decoded_occurrences"]
        # A real, non-degenerate right-hand side: the walker must actually be finding sites.
        assert decoded > 0, (pid, demo)
        assert demo["cfg_reachable_landing_count"] == decoded, (pid, demo)
        assert demo["total"] > decoded, (pid, demo)
        # The overcount is large but BOUNDED. An unbounded ">" would go on passing if the
        # decoded count silently collapsed again; requiring the ratio to sit inside a window
        # means both a vanishing denominator and an exploding one go red.
        ratio = demo["total"] / decoded
        assert 5.0 < ratio < 40.0, (pid, demo, ratio)
    assert demos["champions-of-krynn"]["cfg_reachable_decoded_occurrences"] == 33
    assert demos["death-knights-of-krynn"]["cfg_reachable_decoded_occurrences"] == 56
    # The retired quantity is still published, and its zero is expected -- but it must be zero
    # for the stated STRUCTURAL reason (0x41 decodes), which is what this pins.
    for pid, demo in demos.items():
        assert demo["cfg_reachable_unknown_byte_landings"] == 0, (pid, demo)
        assert demo["opcode_is_decoded_by_this_profile"] is True, (pid, demo)


def test_corroboration_sentence_says_MISMATCH_when_the_figures_disagree():
    """The rendered corroboration sentence used to contradict itself in a single clause.

    `render_markdown` computed `'a match' if corrob['cok_matches_exactly'] else 'a mismatch'`
    and then appended the literal string "two independent implementations agreeing exactly."
    unconditionally -- so when the figures disagreed the doc read "**a mismatch, two independent
    implementations agreeing exactly.**" That is not a wrong number; it is a sentence that
    asserts a conclusion its own computed word has just denied, and it SHIPPED, rendered into
    `docs/engine/research/ecl-host-call-coverage.md`.

    Both branches are exercised here against a copied report, so the false branch is proven
    reachable and proven not to claim agreement.
    """
    report = m.build_report()
    assert report["corroboration_0x41_vs_gen1_opcode_41_doc"]["cok_matches_exactly"] is True
    rendered = m.render_markdown(report)
    assert "a match, two independent implementations agreeing exactly." in rendered

    mismatched = dict(report)
    corrob = dict(report["corroboration_0x41_vs_gen1_opcode_41_doc"])
    corrob["cok_matches_exactly"] = False
    corrob["cok_this_tool_value"] = 999
    mismatched["corroboration_0x41_vs_gen1_opcode_41_doc"] = corrob
    rendered_bad = m.render_markdown(mismatched)
    assert "agreeing exactly" not in rendered_bad
    assert "does NOT hold" in rendered_bad


def test_corroboration_0x41_cok_matches_gen1_opcode_41_doc():
    # docs/engine/research/gen1-opcode-41.md's own independent from-scratch walker reports
    # CoK = 33 reached 0x41 sites, matching this tool's CFG-reachable landing count exactly --
    # free corroboration from a second implementation. (DoK is NOT asserted to match: that doc
    # discloses its own DoK undercount as a limitation of its own walker's GOSUB/GOTO handling.)
    report = m.build_report()
    corrob = report["corroboration_0x41_vs_gen1_opcode_41_doc"]
    assert corrob["cok_doc_value"] == 33
    assert corrob["cok_this_tool_value"] == 33
    assert corrob["cok_matches_exactly"] is True


# ---------------------------------------------------------------------------
# THE PRIMARY DELIVERABLE FOR THIS ITEM: applied-vs-recorded(placeholder) metric.
# ---------------------------------------------------------------------------


def test_derive_placeholder_opcodes_matches_real_ccecl_ten_opcodes():
    dispatch_map, _fallback, _lines, _start, _end = m.build_dispatch_map()
    placeholder = m.derive_placeholder_opcodes(dispatch_map)
    assert placeholder == {0x0E, 0x11, 0x12, 0x1F, 0x27, 0x28, 0x31, 0x33, 0x3A, 0x3D}


def test_derive_placeholder_opcodes_is_programmatic_not_hardcoded_MUTATION_PROOF():
    # Proves derive_placeholder_opcodes actually READS the dispatch map rather than returning a
    # literal constant set: build a synthetic map, derive against it, then MUTATE the map (add
    # one more opcode routed to the placeholder handler, remove one that was) and confirm the
    # derived set tracks the mutation exactly, in both directions, with a restore-proof at the
    # end showing the original fixture still answers as it did before either mutation.
    synthetic = {0x01: "op_default", 0x02: "op_script_effect", 0x03: "op_real_handler"}
    assert m.derive_placeholder_opcodes(synthetic) == {0x02}

    mutated_add = dict(synthetic)
    mutated_add[0x04] = "op_script_effect"
    assert m.derive_placeholder_opcodes(mutated_add) == {0x02, 0x04}, "did not pick up an added placeholder opcode"

    mutated_remove = dict(synthetic)
    del mutated_remove[0x02]
    assert m.derive_placeholder_opcodes(mutated_remove) == set(), "did not notice the only placeholder opcode was removed"

    # A different placeholder_handler argument must change the answer entirely -- proves the
    # function keys off the PARAMETER, not a baked-in literal string match on "op_script_effect".
    assert m.derive_placeholder_opcodes(synthetic, placeholder_handler="op_real_handler") == {0x03}

    # Restore-proof: the untouched original fixture still answers exactly as it did originally.
    assert m.derive_placeholder_opcodes(synthetic) == {0x02}


def test_opcode_rows_mark_placeholder_opcodes_correctly():
    placeholder_mnemonics = {
        "PRINT", "PRINTCLEAR", "DELAY", "PICTURE", "PRINT_RETURN", "TREASURE", "CLEAR_BOX",
        "ROB", "SHORT_MENU", "UNKNOWN_1F",
    }
    report = m.build_report()
    for pid, game in report["games"].items():
        for row in game["opcodes"]:
            if row["mnemonic"] in placeholder_mnemonics:
                assert row["is_placeholder_recorder"] is True, (pid, row)
                assert row["applied"] is False, (pid, row)
                assert row["has_handler"] is True, (pid, row)
            else:
                assert row["is_placeholder_recorder"] is False, (pid, row)


def test_award_xp_is_applied_for_both_krynn_titles():
    report = m.build_report()
    cok = next(row for row in report["games"]["champions-of-krynn"]["opcodes"] if row["opcode"] == "0x41")
    dok = next(row for row in report["games"]["death-knights-of-krynn"]["opcodes"] if row["opcode"] == "0x41")
    assert (cok["handler"], cok["applied"], cok["is_recorded_only"]) == ("op_award_xp", True, False)
    assert (dok["handler"], dok["applied"], dok["is_recorded_only"], dok["has_handler"]) == ("op_award_xp", True, False, True)
    assert report["games"]["champions-of-krynn"]["recorded_only_opcodes_title_override"] == []
    assert report["games"]["death-knights-of-krynn"]["unadmitted_opcodes_title_override"] == []


def test_applied_placeholder_no_handler_partition_sums_to_total():
    # The three buckets must be a strict partition of every reachable instruction -- no double
    # counting, nothing dropped.
    report = m.build_report()
    for pid, game in report["games"].items():
        assert (
            game["applied_instructions"] + game["placeholder_instructions"] + game["no_handler_instructions"]
            == game["total_reachable_instructions"]
        ), (pid, game)
    avr = report["applied_vs_recorded_combined"]
    assert (
        avr["applied_instructions"] + avr["placeholder_instructions"] + avr["no_handler_instructions"]
        == avr["total_reachable_instructions"]
    )


def test_PIN_applied_vs_recorded_matches_measured_figures():
    """PIN of the measured applied-vs-recorded figures, reproduced independently here via this
    tool's own CFG walker rather than copied from any prose.

    RE-PINNED 2026-09-10, and the WHOLE TABLE moved for one reason, stated here so the next
    reader does not go hunting for a regression. Opcode 0x41 gained a grounded extended-opcode
    definition for both Gen1 titles (`GEN1_AWARD_XP`, two operand words, read from each title's
    own retail `GAME.OVR` handler prefetch). Before that it was an unknown byte, so a walk that
    reached one STOPPED there and everything past it in that block was never explored. Framing
    0x41 reopens those paths, and the reachable totals rise across the board -- CoK 13244 ->
    13544, DoK 13571 -> 14277. Every count below inherits that: this is a WIDER DENOMINATOR, not
    a behavioural change in `ccecl.asm` and not a change to the retail corpus, neither of which
    moved.

    The superseded pin read: CoK 2789/13244 (21.1% recorded-only), DoK 2669/13571 (19.7%),
    combined 5458/26815 (20.4%), ranking PRINT 1210/624, PRINTCLEAR 1045/1490, DELAY 173/137,
    PICTURE 139/88, PRINT_RETURN 131/161, TREASURE 49/43, CLEAR_BOX 34/25, ROB 8/2,
    SHORT_MENU 0/63, UNKNOWN_1F 0/36.

    Read the FRACTIONS, not the counts, to see what actually happened to the finding: CoK's
    recorded-only share moved 0.211 -> 0.214 and DoK's 0.197 -> 0.199. The headline claim --
    that roughly a fifth of reachable ECL volume is decoded perfectly and applied never -- is
    unchanged; a third of a percentage point is not a new result. What IS new is the third
    partition below.
    """
    report = m.build_report()
    cok = report["games"]["champions-of-krynn"]
    dok = report["games"]["death-knights-of-krynn"]

    assert (cok["placeholder_instructions"], cok["total_reachable_instructions"]) == (2904, 13544)
    assert (dok["placeholder_instructions"], dok["no_handler_instructions"], dok["total_reachable_instructions"]) == (2845, 0, 14277)

    # Keep the three-way partition explicit: a future fallback must not hide behind
    # total-minus-placeholder arithmetic merely because both titles currently have none.
    assert cok["no_handler_instructions"] == 0
    assert dok["no_handler_instructions"] == 0
    assert cok["applied_instructions"] == 13544 - 2904
    assert dok["applied_instructions"] == 14277 - 2845

    combined = report["applied_vs_recorded_combined"]
    assert (combined["placeholder_instructions"], combined["no_handler_instructions"], combined["total_reachable_instructions"]) == (5749, 0, 27821)
    assert combined["no_handler_instructions"] == 0
    assert combined["applied_instructions"] == 27821 - 5749

    assert round(cok["fraction_recorded_only_placeholder"], 3) == 0.214
    assert round(dok["fraction_recorded_only_placeholder"], 3) == 0.199
    assert round(combined["fraction_recorded_only_placeholder"], 3) == 0.207

    expected_by_mnemonic = {
        "PRINT": (1256, 658),
        "PRINTCLEAR": (1077, 1589),
        "DELAY": (194, 147),
        "PICTURE": (146, 97),
        "PRINT_RETURN": (138, 169),
        "TREASURE": (49, 50),
        "CLEAR_BOX": (36, 25),
        "ROB": (8, 1),
        "SHORT_MENU": (0, 69),
        "UNKNOWN_1F": (0, 40),

    }
    by_mnemonic = {
        row["mnemonic"]: (
            row["occurrences_by_title"].get("champions-of-krynn", 0),
            row["occurrences_by_title"].get("death-knights-of-krynn", 0),
        )
        for row in report["placeholder_opcode_occurrences_ranked_combined"]
    }
    assert by_mnemonic == expected_by_mnemonic


def test_PIN_applied_vs_recorded_figures_MUTATION_PROOF(monkeypatch):
    # Mutation-tests the pin above: swap in a WRONG placeholder set (drop PRINT from it) via
    # monkeypatching derive_placeholder_opcodes, rebuild the report, and confirm the combined
    # placeholder/applied totals move in the exact, predictable direction -- proving the pin
    # above is actually sensitive to which opcodes are classified as placeholder, not a
    # constant that would pass regardless of what coverage_for_profile computes.
    real_dispatch_map, _fallback, _lines, _s, _e = m.build_dispatch_map()
    original_derive = m.derive_placeholder_opcodes  # capture BEFORE patching -- see below
    real_placeholder = original_derive(real_dispatch_map)
    assert 0x11 in real_placeholder  # PRINT

    def _wrong_derive(dispatch_map, placeholder_handler=m.PLACEHOLDER_HANDLER):
        # Must call the captured ORIGINAL, not m.derive_placeholder_opcodes -- by the time this
        # runs, that name is rebound to this very wrapper, and calling it would recurse forever.
        return original_derive(dispatch_map, placeholder_handler) - {0x11}

    monkeypatch.setattr(m, "derive_placeholder_opcodes", _wrong_derive)
    mutated_report = m.build_report()
    monkeypatch.undo()
    real_report = m.build_report()

    mutated_cok = mutated_report["games"]["champions-of-krynn"]
    real_cok = real_report["games"]["champions-of-krynn"]
    # PRINT occurs 1256 times in CoK (1210 before the 0x41 port widened the reachable set --
    # see the pin above for why every count in this file moved together); dropping it from the
    # placeholder set must move exactly that many instructions from "placeholder" to "applied",
    # not an unrelated amount.
    assert real_cok["placeholder_instructions"] - mutated_cok["placeholder_instructions"] == 1256
    assert mutated_cok["applied_instructions"] - real_cok["applied_instructions"] == 1256
    assert mutated_cok["placeholder_instructions"] == 2904 - 1256
    # And the restore actually restored the real behaviour (this pin's own numbers still hold).
    assert real_cok["placeholder_instructions"] == 2904


# ---------------------------------------------------------------------------
# (f) op_call routine-id census
#
# WHY THIS SECTION EXISTS (2026-09-10): this module's docstring shipped two per-id counts --
# "0xae11 (307 CoK hits)" and "0xe804 (114 combined)" -- that no frame reproduces, and NOTHING
# in the repo could have gone red for it. The tests above pinned the FACT that op_call's
# sub-dispatch diverges; none pinned the population it diverges over, so a wrong number in the
# prose describing that population was invisible to the standing gate. These tests pin the
# population, in the frame the rest of this report uses, and mutation-test both halves of how it
# is derived (the id arithmetic, and the asm-parsed id lists).
# ---------------------------------------------------------------------------


def test_call_routine_id_matches_ccecl_gen1_and_gen2_arms():
    # Gen1 (`is_gen2 == 0`) ALWAYS subtracts 0x7fff -- `cmp byte [is_gen2],0 / je .coab_id`.
    # These three pairs are the on-disk operand words the retail corpus actually carries.
    assert m.call_routine_id(0x2E10, is_gen2=False) == 0xAE11
    assert m.call_routine_id(0x2DCB, is_gen2=False) == 0xADCC
    assert m.call_routine_id(0x6803, is_gen2=False) == 0xE804
    # The `test ax, 8000h` guard belongs to the GEN2 arm: high bit clear means no subtraction.
    assert m.call_routine_id(0x2E10, is_gen2=True) == 0x2E10
    assert m.call_routine_id(0x8FFF, is_gen2=True) == 0x1000
    assert m.call_routine_id(0x8FFF, is_gen2=False) == 0x1000


def test_op_call_recognized_and_grounded_ids_are_parsed_from_the_real_ccecl():
    lines = m.read_asm_lines()
    recognized, grounded = m.extract_op_call_routine_ids(lines)
    # Eight named constants, including DoK's retail-confirmed redraw sibling,
    # and the three that reach real behaviour.
    assert recognized == [0xAE11, 0xADCC, 0x0001, 0x0002, 0x3201, 0x401F, 0x4019, 0xE804]
    assert grounded == [0xAE11, 0xADCC, 0xE804]
    assert set(grounded) < set(recognized)


def test_op_call_id_extraction_is_programmatic_not_hardcoded_MUTATION_PROOF():
    # Insert a NINTH recognizer comparison into a copy of the real source. If the id lists were
    # transcribed rather than parsed, this would be invisible; the extractor must report it.
    lines = list(m.read_asm_lines())
    idx = next(i for i, line in enumerate(lines) if "cmp     ax, 0e804h" in line)
    mutated = lines[:idx] + ["        cmp     ax, 0beefh", "        je      .known"] + lines[idx:]
    recognized, grounded = m.extract_op_call_routine_ids(mutated)
    assert 0xBEEF in recognized
    assert 0xBEEF not in grounded  # recognized-but-ungrounded is a real, distinct state
    assert 0xBEEF not in m.extract_op_call_routine_ids(lines)[0]  # and the real source lacks it


def test_PIN_call_routine_id_census_matches_measured_figures():
    """PIN of the per-id CALL census, re-derived here from the retail corpus.

    Frame, stated because the retracted 307/114 figures were missing exactly this: DISTINCT
    reachable code offsets decoding to opcode 0x2D, from the same CFG walk that produces this
    report's 13,544 CoK / 14,277 DoK reachable-instruction totals. In that frame CoK has 155
    reachable CALL sites and DoK 166 (321 combined), so no per-id count in either title can
    exceed its title's own CALL population -- which is what made 307 impossible on its face.

    RE-PINNED 2026-09-10 along with every other figure in this file, and for the same single
    cause: opcode 0x41 became decodable, so CFG walks that used to stop at a 0x41 byte now
    continue past it and reach more of each block. The frame sentence above previously read
    "13,244 CoK / 13,571 DoK ... CoK has 154 reachable CALL sites and DoK 155 (309 combined)".
    Eleven of the twelve newly-counted CALL sites are DoK's. NOTE WHAT DID NOT MOVE: the id
    ARITHMETIC is untouched, `0x3204` holds at 15, and `0xe804` holds at exactly 24/45 -- a
    census that had shifted for some other reason would be unlikely to leave two ids pinned to
    the digit.
    """
    report = m.build_report()
    census = report["call_routine_id_census"]
    by_id = {row["routine_id"]: row for row in census["ranked"]}

    assert by_id["0xae11"]["occurrences_by_title"] == {
        "champions-of-krynn": 112,
        "death-knights-of-krynn": 0,
    }
    assert by_id["0xe804"]["occurrences_by_title"] == {
        "champions-of-krynn": 24,
        "death-knights-of-krynn": 45,
    }
    assert by_id["0xe804"]["occurrences_combined"] == 69
    # The dominant DoK id is grounded through the retail-confirmed redraw sibling.
    assert by_id["0xadcc"]["occurrences_by_title"] == {
        "champions-of-krynn": 0,
        "death-knights-of-krynn": 109,
    }
    assert by_id["0xadcc"]["recognized_by_op_call"] is True
    assert by_id["0xadcc"]["grounded_in_known_block"] is True
    assert by_id["0x3204"]["occurrences_combined"] == 15
    assert by_id["0x401f"]["occurrences_combined"] == 16

    # Every reachable CALL site is accounted for, and the per-id sum closes against the CALL
    # occurrence figure the `call_scale_of_vacuous_dispatch` table publishes independently.
    assert census["literal_operand_call_sites"] == 321
    assert census["dynamic_operand_call_sites"] == 0
    assert sum(r["occurrences_combined"] for r in census["ranked"]) == 321
    assert report["call_scale_of_vacuous_dispatch"]["combined"]["call_occurrences"] == 321
    for pid, expected in (("champions-of-krynn", 155), ("death-knights-of-krynn", 166)):
        assert report["games"][pid]["call_routine_id_literal_sites"] == expected
        assert report["call_scale_of_vacuous_dispatch"][pid]["call_occurrences"] == expected

    # 112 (0xae11) + 109 (0xadcc) + 69 (0xe804) = 290 grounded; 0x401f is recognized but still falls through,
    # which is why the recognized figure is exactly 16 higher than the grounded one -- 16 being
    # 0x401f's own occurrence count, so this pair of numbers cross-checks the per-id table above
    # rather than restating it. (Was 180 / 193 / 0.583, with 0x401f at 13, before the 0x41 port
    # widened the reachable frame; the STRUCTURE of the relationship is unchanged.)
    assert census["calls_reaching_grounded_id"] == 290
    assert census["calls_reaching_recognized_id"] == 306
    assert (
        census["calls_reaching_recognized_id"] - census["calls_reaching_grounded_id"]
        == by_id["0x401f"]["occurrences_combined"]
    )
    assert round(census["fraction_of_calls_grounded"], 3) == 0.903


def test_module_docstring_per_id_figures_agree_with_the_measured_census():
    """The docstring's per-id prose must agree with the artifact, not merely sound plausible.

    This is the check that was missing when 307/114 shipped: the numbers lived only in prose,
    and no test read them. Now the prose figures are compared against the measured census, so a
    census that moves without the prose moving (or vice versa) goes red.
    """
    report = m.build_report()
    by_id = {row["routine_id"]: row for row in report["call_routine_id_census"]["ranked"]}
    doc = m.__doc__ or ""
    assert f"0xae11 (**{by_id['0xae11']['occurrences_combined']}**" in doc
    assert f"0xadcc (**{by_id['0xadcc']['occurrences_combined']}**" in doc
    assert f"0xe804 (**{by_id['0xe804']['occurrences_combined']}**" in doc
    # The retracted figures must not come back as a LIVE claim. They are still quoted inside the
    # CORRECTED paragraph as history, which is deliberate -- so this pins the claim form, not the
    # digits' absence from the file.
    assert "0xae11 (307" not in doc
    assert "0xe804 (114" not in doc


def test_PIN_call_routine_id_census_MUTATION_PROOF(monkeypatch):
    """Mutation-test the pin above by breaking the id arithmetic the way it is easy to break it.

    Misreading `op_call`'s `test ax, 8000h` guard as Gen1's (rather than Gen2's) leaves every
    Gen1 id un-subtracted, shifting all of them by 0x8001: 0xae11 becomes 0x2e10 and every named
    constant reads as absent from the corpus. If the pin were insensitive to the id rule -- if it
    were counting CALL sites and labelling them from a hardcoded list -- this mutation would not
    move it.
    """
    monkeypatch.setattr(
        m,
        "call_routine_id",
        lambda word, is_gen2=False: (word - 0x7FFF) & 0xFFFF if word & 0x8000 else word,
    )
    mutated = m.build_report()
    monkeypatch.undo()
    real = m.build_report()

    mutated_by_id = {row["routine_id"]: row for row in mutated["call_routine_id_census"]["ranked"]}
    assert "0xae11" not in mutated_by_id
    assert mutated_by_id["0x2e10"]["occurrences_combined"] == 112
    assert mutated_by_id["0x2dcb"]["occurrences_combined"] == 109
    # Nothing matches a named constant any more, so grounded coverage collapses to zero...
    assert mutated["call_routine_id_census"]["calls_reaching_grounded_id"] == 0
    # ...while the CALL POPULATION is untouched, proving the mutation moved the id attribution
    # and not the walk. A census whose total also moved would be measuring something else.
    assert mutated["call_routine_id_census"]["literal_operand_call_sites"] == 321
    assert real["call_routine_id_census"]["calls_reaching_grounded_id"] == 290


# ---------------------------------------------------------------------------
# (z) PROPAGATION GUARDS -- added 2026-09-10 after a survey found two claims that
#     no test in the repository was capable of contradicting.
# ---------------------------------------------------------------------------


def test_dispatch_coverage_is_flat_for_both_krynn_titles():
    """Both titles' reachable opcodes now reach a non-default handler.

    This does not certify semantic application: the primary metric still names
    generic recorder opcodes separately.
    """
    report = m.build_report()
    cok = report["games"]["champions-of-krynn"]
    dok = report["games"]["death-knights-of-krynn"]
    assert cok["dispatch_coverage_fraction_by_distinct_opcode"] == 1.0
    assert dok["dispatch_coverage_fraction_by_distinct_opcode"] == 1.0
    assert dok["no_handler_instructions"] == 0

    rendered = m.render_markdown(report)
    assert "DoK's per-member class-slot split" in rendered


def test_dispatch_coverage_prose_is_DERIVED_not_restated():
    """Mutation proof that the sentence above reads the report instead of quoting a constant.

    The defect this replaces was not a wrong number -- it was a number written out by hand in a
    string, which cannot go stale loudly. Feeding `render_markdown` a report with different
    coverage fractions must change the sentence; if it does not, the literal is back.
    """
    report = m.build_report()
    baseline = m.render_markdown(report)
    assert "1.000" in baseline

    mutated = dict(report)
    games = {k: dict(v) for k, v in report["games"].items()}
    for game in games.values():
        game["dispatch_coverage_fraction_by_distinct_opcode"] = 0.5
    mutated["games"] = games
    rendered = m.render_markdown(mutated)

    # Scope this to the PROSE section (everything above the "Scope" heading), because the table
    # far below renders the same fractions from the same report -- a whole-document check would
    # pass on the table alone while the sentence carried a hard-coded literal, which is exactly
    # the defect under test. This assertion was originally written unscoped and DID pass against
    # a deliberately re-hardcoded sentence; it is scoped now because that mutation exposed it.
    prose = rendered.split("## Scope and what this does NOT establish")[0]
    assert "0.500" in prose, prose[-1500:]
    # The former 0.983 figure was a stale implementation state, not a live claim.
    assert "0.983" not in prose


def test_native_readme_call_id_counts_agree_with_the_census():
    """The propagation guard. This is the test whose ABSENCE was the actual defect.

    On 2026-09-09 `native/README.md` recorded per-routine-id occurrence counts of 307 (`0xAE11`)
    and 114 (`0xE804`). `307` was not a superseded measurement -- it was impossible on its own
    terms, exceeding CoK's ENTIRE 155-site CALL population by a factor of two. It was caught and
    retracted the same day, in the same repository, in `ecl_host_call_coverage.py`'s module
    docstring. The retraction never reached `native/README.md`, so for a day the repo held both a
    written proof that a number could not exist and a document asserting it.

    A retraction is not complete when it is written; it is complete when every copy of the claim
    carries it. Nothing mechanised that, so this does: `native/README.md`'s figures for these ids
    are checked against the census that produces them. If the census moves and the README does
    not, this goes red -- which is the direction the failure actually ran.
    """
    readme = (goldbox_corpus.REPO_ROOT / "native" / "README.md").read_text(encoding="utf-8")
    census = m.build_report()["call_routine_id_census"]
    by_id = {row["routine_id"]: row for row in census["ranked"]}

    # The three ids this README section grounds, and the population figure that makes 307 absurd.
    assert by_id["0xae11"]["occurrences_combined"] == 112
    assert by_id["0xadcc"]["occurrences_combined"] == 109
    assert by_id["0xe804"]["occurrences_combined"] == 69
    assert census["literal_operand_call_sites"] == 321

    # Every id count the README states for these two must be the live one.
    assert f'(**{by_id["0xae11"]["occurrences_combined"]}** CoK occurrences)' in readme
    assert f'(**{by_id["0xadcc"]["occurrences_combined"]}** DoK occurrences)' in readme
    assert f'(**{by_id["0xe804"]["occurrences_combined"]}** combined occurrences' in readme

    # The impossible figures may appear ONLY inside the retraction, never as a live claim. Pinned
    # in CLAIM FORM rather than as a bare `not in`: forbidding the strings outright would push the
    # next editor into ERASING the record, which is the opposite of what this repo wants.
    assert "CORRECTED 2026-09-10." in readme
    retraction_at = readme.index("> **CORRECTED 2026-09-10. The two occurrence counts")
    for stale in ("307", "`114`"):
        for hit in _all_indexes(readme, stale):
            assert hit > retraction_at, (stale, hit, retraction_at)


def _all_indexes(haystack: str, needle: str) -> list[int]:
    out, start = [], 0
    while True:
        i = haystack.find(needle, start)
        if i < 0:
            return out
        out.append(i)
        start = i + 1


# ---------------------------------------------------------------------------
# (aa) THE IF->0x41 ADJACENCY CENSUS
#
# Settled 2026-09-10. These pins exist because the PREVIOUS state of this question -- the word
# UNESTABLISHED sitting in a prose string -- was unfalsifiable by construction: no assertion
# anywhere could go red when it stopped being true. Pin the POPULATION and its denominators,
# not only the headline, per the goldbox-probe-must-be-able-to-fail memory's 2026-09-10 entry.
# ---------------------------------------------------------------------------


def test_PIN_guarded_0x41_after_if_census():
    census = m.build_report()["guarded_0x41_after_if_census"]

    # The headline, and BOTH liveness slices. false_branch_live is the load-bearing one: only the
    # false branch calls skip_one_instruction, so a site whose false branch is dead cannot reach
    # the out-of-bounds get_operand_meta at all.
    assert census["sites_combined"] == 5
    assert census["sites_by_title"] == {"champions-of-krynn": 3, "death-knights-of-krynn": 2}
    assert census["sites_with_false_branch_live"] == 5
    assert census["sites_with_both_branches_live"] == 5

    # The denominators. A count without one is how "307 CALL sites in a title with 155" shipped.
    assert census["denominator_blocks"] == 47
    assert census["denominator_decoded_instruction_offsets"] == 27821
    assert census["denominator_if_sites_with_decodable_guarded_instruction"] == 3560

    # No silent caps: a block that hit the 50,000-state limit, or a truncated offset, would make
    # the count a floor of unknown tightness rather than the stated figure.
    assert census["blocks_hitting_state_limit"] == 0
    assert census["truncated_offsets"] == 0

    # The upper-bound control, and the range it produces.
    assert census["raw_byte_pair_upper_bound_by_title"] == {
        "champions-of-krynn": 33,
        "death-knights-of-krynn": 11,
    }
    assert census["raw_byte_pair_upper_bound_combined"] == 44
    assert census["sites_combined"] < census["raw_byte_pair_upper_bound_combined"]

    # The five sites themselves, byte-exact. Verified independently against the retail
    # ECL{1,2,3}.DAX before being pinned here -- see the census's own `frame` field.
    flat = {
        (pid, row["file"], row["block_id"], row["offset"]): row
        for pid, rows in census["sites"].items()
        for row in rows
    }
    expected = {
        ("champions-of-krynn", "ECL2.DAX", 50, 5529): "18 41 00 01 02 dc 05",
        ("champions-of-krynn", "ECL2.DAX", 66, 592): "16 41 00 01 02 10 27",
        ("champions-of-krynn", "ECL2.DAX", 67, 7166): "17 41 00 00 03 79 7f",
        ("death-knights-of-krynn", "ECL3.DAX", 83, 4721): "16 41 00 01 02 88 13",
        ("death-knights-of-krynn", "ECL3.DAX", 99, 2514): "18 41 00 00 02 50 c3",
    }
    assert set(flat) == set(expected)
    for key, bytes_hex in expected.items():
        assert flat[key]["bytes_hex"] == bytes_hex, key
        assert flat[key]["guarded_opcode"] == 0x41
        assert 0x16 <= flat[key]["if_opcode"] <= 0x1B


def test_guarded_0x41_census_denominator_agrees_with_the_coverage_tables():
    """The corpus-scale control.

    This walk's own instruction total must equal the one the per-title coverage tables publish.
    If a future change to the CFG model silently moves the reachable frame, the census and the
    tables would drift apart while both still looked internally consistent.
    """
    report = m.build_report()
    census = report["guarded_0x41_after_if_census"]
    assert census["denominator_decoded_instruction_offsets"] == sum(
        g["total_reachable_instructions"] for g in report["games"].values()
    )
    assert census["denominator_blocks"] == sum(
        g["ecl_block_count"] for g in report["games"].values()
    )


def test_guarded_0x41_census_still_discloses_what_it_does_NOT_establish():
    """Settling one question must not quietly close the three it does not answer."""
    census = m.build_report()["guarded_0x41_after_if_census"]
    joined = " ".join(census["still_unestablished"])
    assert "No DOSBox session was run" in census["frame"]
    # Runtime execution, selected-target mapping, and undecomposed raw candidates remain separate.
    assert "runtime" in joined
    assert "selected-character" in joined
    assert "not decomposed" in joined


def test_guarded_0x41_census_is_context_not_a_runtime_failure_claim():
    report = m.build_report()
    census = report["guarded_0x41_after_if_census"]
    assert "corpus context rather than a runtime hazard" in census["question"]
    note = report["no_handler_native_runtime_note"]
    assert "not an active runtime-failure claim" in note
    assert census["sites_combined"] == 5


def test_guarded_0x41_census_renders_into_the_markdown():
    rendered = m.render_markdown(m.build_report())
    assert "IF-adjacency census" in rendered
    assert "descriptive corpus evidence" in rendered


def test_guarded_0x41_census_discloses_the_CoK_digit_collision():
    """A true number under the wrong subject is this repo's most-repeated defect.

    Champions of Krynn's raw IF->0x41 byte-pair upper bound and its CFG-reachable decoded 0x41
    OCCURRENCE count are both 33, and neither is its IF-guarded site count, which is 3. A third
    copy of the same digits lives in docs/engine/research/gen1-opcode-41.md. Nothing in this
    repo can catch a reader who quotes one for another, so the collision is disclosed in the
    artifact -- and this pin fails if that disclosure is dropped, or if it goes on naming a
    collision that has stopped existing.
    """
    report = m.build_report()
    census = report["guarded_0x41_after_if_census"]
    naive = report["methodology_discrepancy_demo_opcode_0x41"]

    pair = census["raw_byte_pair_upper_bound_by_title"]["champions-of-krynn"]
    occurrences = naive["champions-of-krynn"]["cfg_reachable_decoded_occurrences"]
    sites = census["sites_by_title"]["champions-of-krynn"]

    # The collision is real, and the three quantities are genuinely distinct.
    assert pair == occurrences == 33
    assert sites == 3
    assert sites != pair

    warning = census["numeric_collision_warning"]
    assert warning.startswith("COLLIDING DIGITS, DIFFERENT SUBJECTS")
    assert "Champions of Krynn" in warning
    # Derived, not restated: all three live figures must appear in the warning text.
    for value in (pair, occurrences, sites):
        assert str(value) in warning, value
    # DoK does not collide (11 vs 56), so it must NOT be named as one.
    assert "Death Knights of Krynn" not in warning


def test_guarded_0x41_cross_implementation_check_agrees_on_sites_and_DISCLOSES_the_divergence():
    """A second implementation is only worth citing if its disagreement is carried too.

    The TypeScript walker agrees exactly on the five sites and on the block counts, and
    disagrees on the reachable-offset denominator in OPPOSITE directions per title. Both halves
    are pinned: an edit that quietly dropped the divergence note, or that let the site sets
    drift apart, fails here.
    """
    census = m.build_report()["guarded_0x41_after_if_census"]
    x = census["cross_implementation_check"]

    # The agreement that matters: the finding itself, from code sharing nothing with this tool.
    assert x["sites_agree"] is True
    assert len(x["ts_sites"]) == census["sites_combined"] == 5
    assert x["block_counts_agree"] is True

    # The disagreement, still true and still disclosed.
    assert x["reachable_offset_totals_agree"] is False
    assert x["this_tool_reachable_offsets_by_title"]["champions-of-krynn"] == 13544
    assert x["ts_reachable_offsets_by_title"]["champions-of-krynn"] == 13540
    assert x["this_tool_reachable_offsets_by_title"]["death-knights-of-krynn"] == 14277
    assert x["ts_reachable_offsets_by_title"]["death-knights-of-krynn"] == 14783
    # Opposite signs per title -- the fact that kills any single-cause explanation.
    cok_delta = (
        x["this_tool_reachable_offsets_by_title"]["champions-of-krynn"]
        - x["ts_reachable_offsets_by_title"]["champions-of-krynn"]
    )
    dok_delta = (
        x["this_tool_reachable_offsets_by_title"]["death-knights-of-krynn"]
        - x["ts_reachable_offsets_by_title"]["death-knights-of-krynn"]
    )
    assert cok_delta > 0 > dok_delta
    assert "NOT resolved here" in x["divergence_note"]
    assert "OPPOSITE" in x["divergence_note"]

    # And the limit that stops the cross-check being over-cited.
    assert "cannot confirm" in x["does_not_corroborate_branch_liveness"]
    assert "must not be cited for it" in x["does_not_corroborate_branch_liveness"]


# ---------------------------------------------------------------------------
# (zz) THE C64 TRAMPOLINE ALIAS -- added 2026-09-10.
#
# Hypothesis (H1), formed on CoK/DoK only: a Gen1 title's ECL `op_call` REDRAW routine id,
# transformed back to its raw on-disk operand word (`raw = id - 0x8001`), is numerically that
# same title's OWN C64 `LIBRARY` leading-jump-table slot whose target is `JMP $0803` -- the
# generic overlay-call trampoline. It was then tested OUT OF SAMPLE on two titles that played no
# part in forming it (Secret of the Silver Blades, Gateway to the Savage Frontier) and held on
# both. These tests pin the result, its two controls, and -- deliberately -- its limit.
#
# WHAT THIS DOES NOT ESTABLISH, pinned below so it cannot be quietly dropped:
#   * `$0803` is GENERIC overlay dispatch ("jump 3 bytes into whatever overlay is currently
#     staged at $0800"), so a match identifies WHICH SLOT the operand names and nothing about
#     what that slot's staged overlay does. It is not evidence for the label "redraw dungeon
#     view"; that still rests on the DOS-side script-shape reading in
#     docs/engine/research/gen1-demo-sequence-patterns.md, unchecked against GAME.OVR.
#   * It does NOT show "23 entries were deleted ahead of it". CoK/Gateway carry a 32-slot table
#     and DoK/Secret a 3-slot one; those are differently-built tables, not one table minus rows.
#   * It is a C64 fact. Nothing here authorises the `native/src/ccecl.asm` alias, which the
#     BUILD-QUEUE item gates on a DOS-side GAME.OVR check that has not been done.
#
# The live C64 half SKIPS when the never-vendored D:\ image corpus is absent (repo convention).
# Because a test that can skip itself can pass without running, the metric's accept/reject
# behaviour is ALSO exercised on synthetic tables in a test that always runs.
# ---------------------------------------------------------------------------

C64_TRAMPOLINE_EXPECTATION = {
    # title -> (expected trampoline slot address, expected slot index, table slot count)
    "cok": (0x2E10, 24, 32),
    "dok": (0x2DCB, 1, 3),
    "secret": (0x2DCB, 1, 3),      # out-of-sample
    "gateway": (0x2E10, 24, 32),   # out-of-sample
}


def _c64_kernel_or_skip():
    import c64_kernel

    try:
        c64_kernel.side1_path("cok")
    except c64_kernel.SourceUnavailable as exc:
        pytest.skip("external C64 corpus unavailable: %s" % exc)
    return c64_kernel


def _slot_verdict(slots, addr):
    """The three-part metric: is `addr` inside the table span, ON a 3-byte slot boundary, and
    does that slot target $0803? Returns (in_span, on_slot, target_or_None, accept)."""
    if not slots:
        return (False, False, None, False)
    lo = slots[0][1]
    hi = lo + 3 * len(slots)
    in_span = lo <= addr < hi
    on_slot = in_span and (addr - lo) % 3 == 0
    target = slots[(addr - lo) // 3][2] if on_slot else None
    return (in_span, on_slot, target, target == 0x0803)


def test_call_operand_word_gen1_round_trips_and_matches_the_known_pairs():
    """Always-on: the raw/id arithmetic itself, independent of any corpus."""
    for routine_id, raw in (
        (0xAE11, 0x2E10),
        (0xADCC, 0x2DCB),
        (0xE804, 0x6803),
        (0x401F, 0xC01E),
        (0x3204, 0xB203),
    ):
        assert m.call_operand_word_gen1(routine_id) == raw, hex(routine_id)
        assert m.call_routine_id(raw, is_gen2=False) == routine_id
    # It is exactly `id - 0x8001` mod 2**16, the form the research docs quote.
    for routine_id in (0x0000, 0x0001, 0x3204, 0x8000, 0xAE11, 0xFFFF):
        assert m.call_operand_word_gen1(routine_id) == (routine_id - 0x8001) & 0xFFFF


def test_PIN_call_routine_id_census_publishes_the_raw_operand_word():
    """The census must publish the RAW word beside every transformed id, since the raw word is
    the quantity the C64 correspondence is about. Pins all five ids the corpus actually uses."""
    census = m.build_report()["call_routine_id_census"]
    by_id = {row["routine_id"]: row for row in census["ranked"]}
    assert {row["routine_id"] for row in census["ranked"]} == {
        "0xae11", "0xadcc", "0xe804", "0x401f", "0x3204"
    }
    assert by_id["0xae11"]["raw_operand_word"] == "0x2e10"
    assert by_id["0xadcc"]["raw_operand_word"] == "0x2dcb"
    assert by_id["0xe804"]["raw_operand_word"] == "0x6803"
    assert by_id["0x401f"]["raw_operand_word"] == "0xc01e"
    assert by_id["0x3204"]["raw_operand_word"] == "0xb203"
    # And the disclosure that travels with it.
    note = census["raw_operand_word_note"]
    assert "generic overlay dispatch" in note
    assert "not the routine's semantics" in note


def test_PIN_call_redraw_operand_equals_c64_overlay_trampoline_slot():
    """H1, pinned on all four titles -- two in-sample (CoK/DoK), two OUT of sample.

    Secret and Gateway played no part in forming the hypothesis: it was formed from CoK's
    $2E10 and DoK's $2DCB, and predicted these two titles' C64 trampoline addresses BEFORE the
    tables were read. Null, denominator 65536 (the whole 16-bit operand word space): landing on
    the one $0803 slot of a given title by chance is 1/65536, so both out-of-sample predictions
    being right by luck is (1/65536)**2 = 2.3e-10. Even the weakest form of the metric -- merely
    landing anywhere inside the right title's table span, 9/65536 for Secret's 3-slot table and
    96/65536 for Gateway's 32-slot one -- is 2.0e-7 jointly.
    """
    c64_kernel = _c64_kernel_or_skip()
    for title, (addr, index, count) in C64_TRAMPOLINE_EXPECTATION.items():
        body = c64_kernel.kernel_body(title)
        slots = c64_kernel.library_jump_table(body)
        assert len(slots) == count, (title, len(slots))
        hit = c64_kernel.overlay_trampoline_slot(body)
        assert hit == (index, addr), (title, hit)
        # ... and exactly one slot in the table carries the trampoline target, which is what
        # makes "the trampoline slot" a well-defined address at all.
        assert sum(1 for _, _, t in slots if t == 0x0803) == 1, title

    # The DOS side of the same claim, from this module's own census: the two Gen1 titles it
    # covers use exactly the raw word their own C64 table places the trampoline at.
    by_id = {r["routine_id"]: r for r in m.build_report()["call_routine_id_census"]["ranked"]}
    assert by_id["0xae11"]["raw_operand_word"] == "0x2e10"   # CoK, and CoK's slot 24 is $2E10
    assert by_id["0xadcc"]["raw_operand_word"] == "0x2dcb"   # DoK, and DoK's slot 1 is $2DCB


def test_c64_trampoline_metric_CONTROL_A_cross_assignment_misses():
    """CONTROL A: the metric must MISS when a title's operand is scored against another title's
    table. It does -- but note WHICH clause carries it, because two of the four cross-pairings
    are not separated by span at all.

    $2E10 is outside DoK's and Secret's 3-slot span, so those reject on span. $2DCB IS inside
    CoK's and Gateway's 32-slot span AND on a 3-byte boundary -- it is their slot 1 -- and is
    rejected only because that slot targets $2E2B, not $0803. So a two-part span+boundary metric
    would fire on the WRONG title half the time; the $0803 target clause is what discriminates.
    """
    c64_kernel = _c64_kernel_or_skip()
    slots = {t: c64_kernel.library_jump_table(c64_kernel.kernel_body(t))
             for t in C64_TRAMPOLINE_EXPECTATION}

    for title, (own_addr, _, _) in C64_TRAMPOLINE_EXPECTATION.items():
        for other, (other_addr, _, _) in C64_TRAMPOLINE_EXPECTATION.items():
            verdict = _slot_verdict(slots[title], other_addr)
            assert verdict[3] is (own_addr == other_addr), (title, other, verdict)

    # The specific weak pairings, pinned so the caveat above cannot rot into "it misses cleanly".
    for wide in ("cok", "gateway"):
        in_span, on_slot, target, accept = _slot_verdict(slots[wide], 0x2DCB)
        assert (in_span, on_slot, target, accept) == (True, True, 0x2E2B, False), wide
    for narrow in ("dok", "secret"):
        assert _slot_verdict(slots[narrow], 0x2E10) == (False, False, None, False), narrow


def test_c64_trampoline_metric_CONTROL_B_separates_the_other_census_operands():
    """CONTROL B: the metric must ACCEPT $2E10/$2DCB and REJECT every other raw operand word the
    corpus actually uses. Measured: 2 of 5 accept, 3 reject, in all four titles.

    A CORRECTION rides here, because the brief that commissioned this test named the other two
    operands as `$3203` and `$401E`. Those are `id - 1`, not `id - 0x8001`: the real raw words
    for ids 0x3204 and 0x401f are **$B203** and **$C01E**. $3203/$401E occur ZERO times as raw
    16-bit words in CoK's, DoK's, Secret's or Gateway's retail ECL*.DAX, so scoring them would
    have tested two values the corpus does not contain. The verdict the brief expected survives
    the correction -- neither is grounded by H1 -- but it survives on the right numbers.
    """
    c64_kernel = _c64_kernel_or_skip()
    accept_expected = {0x2E10: {"cok", "gateway"}, 0x2DCB: {"dok", "secret"}}
    reject_always = (0x6803, 0xC01E, 0xB203)

    for title in C64_TRAMPOLINE_EXPECTATION:
        slots = c64_kernel.library_jump_table(c64_kernel.kernel_body(title))
        lo, hi = slots[0][1], slots[0][1] + 3 * len(slots)
        for addr, titles in accept_expected.items():
            assert _slot_verdict(slots, addr)[3] is (title in titles), (title, hex(addr))
        for addr in reject_always:
            in_span, on_slot, target, accept = _slot_verdict(slots, addr)
            assert accept is False and in_span is False, (title, hex(addr))
            # ...and they are not merely off-by-a-slot: none is even inside the table span.
            assert not (lo <= addr < hi)

    # Both accepted and rejected buckets are non-empty, so the metric discriminates rather than
    # accepting or rejecting everything -- the failure mode the brief asked to be ruled out.
    assert len(accept_expected) == 2 and len(reject_always) == 3


def test_c64_trampoline_metric_SYNTHETIC_CONTROLS_always_run():
    """The accept/reject logic, exercised on hand-built tables so this coverage exists even on a
    machine with no D: corpus (where the three tests above skip). A skip is not a pass."""
    import c64_kernel

    # A 3-slot table with the trampoline at slot 1, like DoK's/Secret's.
    body = bytes([0x4C, 0x90, 0x4A,  0x4C, 0x03, 0x08,  0x4C, 0x98, 0x3A,  0x60])
    slots = c64_kernel.library_jump_table(body, 0x2DC8)
    assert len(slots) == 3
    assert c64_kernel.overlay_trampoline_slot(body, 0x2DC8) == (1, 0x2DCB)
    assert _slot_verdict(slots, 0x2DCB)[3] is True
    assert _slot_verdict(slots, 0x2DC8)[3] is False   # in span, on slot, wrong target
    assert _slot_verdict(slots, 0x2DCC)[3] is False   # in span, OFF the 3-byte boundary
    assert _slot_verdict(slots, 0x2E10)[3] is False   # outside the span entirely

    # MUTATION: retarget the trampoline slot. The accept must vanish -- proving the assertion is
    # reading the slot's TARGET and not just its address.
    mutated = bytearray(body)
    mutated[4:6] = (0x04, 0x08)  # JMP $0804, three bytes past the real trampoline target
    assert c64_kernel.overlay_trampoline_slot(bytes(mutated), 0x2DC8) is None
    assert _slot_verdict(c64_kernel.library_jump_table(bytes(mutated), 0x2DC8), 0x2DCB)[3] is False

    # AMBIGUITY: two $0803 slots means "the trampoline slot" is not a well-defined address, and
    # the helper must refuse rather than pick one.
    ambiguous = bytearray(body)
    ambiguous[1:3] = (0x03, 0x08)
    assert c64_kernel.overlay_trampoline_slot(bytes(ambiguous), 0x2DC8) is None


def test_c64_trampoline_alias_DISCLOSES_what_it_does_not_establish():
    """The semantic limit must live in the shipped artifact, not only in a report. If someone
    deletes the disclosure while keeping the finding, this goes red."""
    note = m.build_report()["call_routine_id_census"]["raw_operand_word_note"]
    assert "$0803" in note and "generic overlay dispatch" in note

    import c64_kernel

    doc = c64_kernel.__doc__ or ""
    assert "GENERIC overlay dispatch" in doc
    assert "not evidence for the semantic label" in doc
    assert "not 29 deleted entries" in doc
    # And Gateway's origin caveat: it has no BASIC `SYS` to ground $2DC8 with.
    assert "SYS 2059" in doc and "78.1%" in doc


# ---------------------------------------------------------------------------
# Flag-gated dispatch (plan §33.4, 2026-09-23): exec_one's 0x31 entry, gated on is_gen2 /
# short_menu_opframes / interactive_menu, and a synthetic idiom to test the parser in isolation.
# ---------------------------------------------------------------------------


def test_gated_0x31_default_configuration_is_the_recorder():
    """`build_dispatch_map()`'s default flags are the report's configuration: both Gen1 titles,
    CCECL run without `/!`. Under that configuration 0x31 stays the placeholder recorder."""
    mapping, fallback_label, _lines, _start, _end = m.build_dispatch_map()
    assert mapping[0x31] == "op_script_effect"
    assert fallback_label == "op_default"
    assert mapping[0x32] == "op_find_item"
    assert mapping[0x16] == "op_if"


def test_gated_0x31_resolves_per_configuration():
    """Gen1, Gen2 and enum2 configurations preserve their own menu gates,
    with the fallback and every other opcode held constant."""
    configurations = [
        ({"is_gen2": 0, "short_menu_opframes": 0, "interactive_menu": 0}, "op_script_effect"),
        ({"is_gen2": 0, "short_menu_opframes": 1, "interactive_menu": 0}, "op_script_effect"),
        ({"is_gen2": 0, "short_menu_opframes": 1, "interactive_menu": 1}, "op_horizontal_menu"),
        ({"is_gen2": 1, "short_menu_opframes": 0, "interactive_menu": 0}, "op_horizontal_menu"),
        ({"is_gen2": 2, "short_menu_opframes": 0, "interactive_menu": 0}, "op_script_effect"),
        ({"is_gen2": 2, "short_menu_opframes": 1, "interactive_menu": 1}, "op_horizontal_menu"),
    ]
    default_mapping, default_fallback, _lines, _start, _end = m.build_dispatch_map()
    for flags, expected_0x31 in configurations:
        flags = {**m.DEFAULT_DISPATCH_FLAGS, **flags}
        mapping, fallback_label, _lines, _start, _end = m.build_dispatch_map(flags=flags)
        assert mapping[0x31] == expected_0x31, flags
        assert fallback_label == "op_default", flags
        restricted = {op: label for op, label in mapping.items() if op != 0x31}
        default_restricted = {op: label for op, label in default_mapping.items() if op != 0x31}
        assert restricted == default_restricted, flags


def test_matrix_gate_changes_only_the_0x4c_dispatch():
    default, *_ = m.build_dispatch_map()
    matrix, *_ = m.build_dispatch_map(flags={**m.DEFAULT_DISPATCH_FLAGS, "is_matrix": 1})
    assert default[0x4C] == "op_buck_ext_zero"
    assert matrix[0x4C] == "op_buck_ext_two"
    assert {op: label for op, label in default.items() if op != 0x4C} == {
        op: label for op, label in matrix.items() if op != 0x4C
    }


def test_missing_matrix_configuration_still_raises():
    flags = {key: value for key, value in m.DEFAULT_DISPATCH_FLAGS.items() if key != "is_matrix"}
    with pytest.raises(ValueError, match="is_matrix"):
        m.build_dispatch_map(flags=flags)


_SYNTHETIC_GATE_FIXTURE = """\
exec_one:
        cmp al, 0x10
        je op_a
        cmp al, 0x11
        jne .n
        cmp byte [f], 0
        je op_b
        jmp op_c
.n:
        cmp al, 0x12
        je op_d
        jmp op_default
"""


def test_synthetic_gate_resolves_and_chain_continues():
    lines = _SYNTHETIC_GATE_FIXTURE.splitlines()

    comparisons, fallback_label, _start, _end = m.extract_dispatch_chain(lines, flags={"f": 0})
    mapping = m.dispatch_map_from_comparisons(comparisons, fallback_label)
    assert mapping[0x10] == "op_a"
    assert mapping[0x11] == "op_b"
    assert mapping[0x12] == "op_d"
    assert mapping[0x13] == "op_default"

    comparisons, fallback_label, _start, _end = m.extract_dispatch_chain(lines, flags={"f": 1})
    mapping = m.dispatch_map_from_comparisons(comparisons, fallback_label)
    assert mapping[0x11] == "op_c"


def test_unmodelled_gate_flag_raises():
    lines = _SYNTHETIC_GATE_FIXTURE.replace("[f]", "[mystery]").splitlines()
    with pytest.raises(ValueError, match="mystery"):
        m.extract_dispatch_chain(lines, flags={})


@pytest.mark.parametrize('literal,expected', [('1', 1), ('0x01', 1), ('01h', 1),
                                            ('2', 2), ('0x02', 2), ('02H', 2)])
@pytest.mark.parametrize('branch', ['je', 'jne'])
@pytest.mark.parametrize('state', [0, 1, 2])
def test_constant_byte_gate_preserves_numeric_enum_state(literal, expected, branch, state):
    source = _SYNTHETIC_GATE_FIXTURE.replace('cmp byte [f], 0', 'cmp byte [f], '+literal)
    source = source.replace('je op_b', branch+' op_b')
    comparisons, fallback, *_ = m.extract_dispatch_chain(source.splitlines(), flags={'f': state})
    mapping = m.dispatch_map_from_comparisons(comparisons, fallback)
    taken = state == expected if branch == 'je' else state != expected
    assert mapping[0x11] == ('op_b' if taken else 'op_c')
    assert mapping[0x10] == 'op_a' and mapping[0x12] == 'op_d'


@pytest.mark.parametrize('constant', ['256', '0x100', '100h', '-1', 'f', '1+1'])
def test_gate_rejects_non_byte_or_unmodeled_rhs(constant):
    source = _SYNTHETIC_GATE_FIXTURE.replace('cmp byte [f], 0', 'cmp byte [f], '+constant)
    with pytest.raises(ValueError):
        m.extract_dispatch_chain(source.splitlines(), flags={'f': 2})


@pytest.mark.parametrize('state', [-1, 256, 1.5, '2', None])
def test_gate_rejects_non_byte_configuration(state):
    with pytest.raises(ValueError, match='byte state'):
        m.extract_dispatch_chain(_SYNTHETIC_GATE_FIXTURE.splitlines(), flags={'f': state})


def test_live_gen2_equality_gate_detects_nonzero_counterfactual():
    lines = m.read_asm_lines()
    source = '\n'.join(lines)
    exact = '        cmp     byte [is_gen2], 1\n        je     op_horizontal_menu'
    assert source.count(exact) == 1
    changed = source.replace(exact, '        cmp     byte [is_gen2], 0\n        jne     op_horizontal_menu', 1)
    for state in (0, 1, 2):
        flags = {**m.DEFAULT_DISPATCH_FLAGS, 'is_gen2': state}
        real_cmp, real_default, *_ = m.extract_dispatch_chain(lines, flags=flags)
        changed_cmp, changed_default, *_ = m.extract_dispatch_chain(changed.splitlines(), flags=flags)
        real = m.dispatch_map_from_comparisons(real_cmp, real_default)
        counterfactual = m.dispatch_map_from_comparisons(changed_cmp, changed_default)
        if state == 2:
            assert real[0x31] == 'op_script_effect'
            assert counterfactual[0x31] == 'op_horizontal_menu'
        else:
            assert real == counterfactual
        assert {op: target for op, target in real.items() if op != 0x31} == {
            op: target for op, target in counterfactual.items() if op != 0x31}


def test_malformed_gate_block_raises():
    injected = _SYNTHETIC_GATE_FIXTURE.replace(
        "        jmp op_c\n", "        mov ax, 1\n        jmp op_c\n"
    ).splitlines()
    with pytest.raises(ValueError):
        m.extract_dispatch_chain(injected, flags={"f": 0})

    no_closing_label = _SYNTHETIC_GATE_FIXTURE.replace(".n:\n", "").splitlines()
    with pytest.raises(ValueError):
        m.extract_dispatch_chain(no_closing_label, flags={"f": 0})
