"""Pins for tools/encounter_art_model.py (T6-1). No DOSBox; skips without retail data."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import encounter_art_model as m  # noqa: E402

needs_ccfp = pytest.mark.skipif(not m.CCFP_ASM.is_file(), reason="ccfp.asm absent")


def _need(game):
    if not m.cpic_path(game).is_file():
        pytest.skip(f"{game} CPIC1.DAX not present")


@pytest.fixture(scope="module")
def surveys():
    out = {}
    for g in m.GAMES:
        if m.cpic_path(g).is_file():
            out[g] = m.survey_cpic(g)
    return out


@pytest.mark.parametrize("game", ["CoK", "DoK"])
def test_cpic_census(game, surveys):
    _need(game)
    s = surveys[game]
    assert s["blocks"] == m.EXPECTED_BLOCKS[game]
    assert len(set(s["ids"])) == s["blocks"]          # ids unique
    assert s["non_standard"] == []                     # frame 0 always standard
    assert s["oversize"] == []                         # <= 160x160
    assert s["all_transparent"] == []                  # no fully see-through icon
    assert s["n_24x24"] + s["n_other"] == s["blocks"]


def test_cpic_size_histograms(surveys):
    if "CoK" in surveys:
        assert surveys["CoK"]["sizes"] == {(24, 24): 38, (24, 48): 6, (48, 24): 8}
    if "DoK" in surveys:
        assert surveys["DoK"]["sizes"] == {
            (24, 24): 58, (24, 25): 4, (24, 48): 10, (40, 24): 1, (48, 24): 21, (48, 48): 12}
    if not surveys:
        pytest.skip("no retail data")


def test_colour0_transparency_is_substantial_but_not_total(surveys):
    if not surveys:
        pytest.skip("no retail data")
    for s in surveys.values():
        frac = s["zero_total"] / s["pixel_total"]
        assert 0.2 < frac < 0.8, frac                  # measured ~0.49 / ~0.46
        assert all(0 < z for z in s["zero_counts"].values())  # every icon has a background


@needs_ccfp
def test_geometry_parsed_from_source():
    g = m.parse_geometry(m.read_ccfp())
    assert g == {"cx": 92, "bottom": 132, "near_max": 1}
    assert m.expected_rect(24, 24, 1, g) == (68, 84, 48, 48, 2)
    assert m.expected_rect(24, 24, 0, g)[4] == 2
    assert m.expected_rect(24, 24, 2, g) == (80, 108, 24, 24, 1)
    assert m.expected_rect(48, 48, 3, g) == (68, 84, 48, 48, 1)


@needs_ccfp
def test_composite_synthetic_icon():
    g = {"cx": 92, "bottom": 132, "near_max": 1}
    icon = (2, 2, bytes([0, 5, 7, 0]))
    c = m.composite(m.blank_canvas(), icon, 2, g)
    x, y = 91, 130
    assert (c[y * 320 + x], c[y * 320 + x + 1]) == (0, 5)
    assert (c[(y + 1) * 320 + x], c[(y + 1) * 320 + x + 1]) == (7, 0)
    assert sum(1 for v in c if v) == 2
    c2 = m.composite(m.blank_canvas(), icon, 1, g)       # 2x scale: 4 px per source px
    assert sum(1 for v in c2 if v) == 8


@needs_ccfp
def test_composite_real_icon_bounds_and_background_untouched(surveys):
    if "CoK" not in surveys:
        pytest.skip("no CoK data")
    bid, icon = m.load_cpic("CoK")[0]
    for dist in (0, 1, 2, 5):
        c = m.composite(m.blank_canvas(fill=9), icon, dist)
        x, y, sw, sh, _ = m.expected_rect(icon[0], icon[1], dist)
        assert x >= 0 and y >= 0 and x + sw <= 320 and y + sh <= 200
        painted = [i for i, v in enumerate(c) if v != 9]
        assert painted and all(
            x <= i % 320 < x + sw and y <= i // 320 < y + sh for i in painted)
        # transparent pixels leave the background; opaque count scales by s*s
        s = 2 if dist <= 1 else 1
        opaque = icon[2].__len__() - icon[2].count(0)
        # painted pixels with colour 9 in the source would be indistinguishable; allow that
        nine = icon[2].count(9)
        assert len(painted) == (opaque - nine) * s * s


# ----------------------------------------------------------- source-gate pins
# Flipped deliberately by T6-2 (2026-10-13): both CCFP gates are GONE, so a DOS
# CPIC1 GBIM (graphics_alt_enabled == 0) draws.  The pic-id match must survive.
NL = chr(10)
ALT_GATE_DES = "        cmp     byte [graphics_alt_enabled], 0" + NL + "        je      .marker" + NL
ENABLED_ANCHOR = "        cmp     byte [gbim_enabled], 0" + NL + "        je      .marker"
LG_ANCHOR = "        mov     byte [cs:gbim_enabled], 1"
LG_GATE = "        cmp     byte [cs:graphics_alt_enabled], 0" + NL + "        je      .bad" + NL


@needs_ccfp
def test_gates_removed_by_t6_2():
    r = m.gate_report()
    assert r["draw_effect_setup_tests_alt"] == 0
    assert r["load_gbim_tests_alt"] == 0
    assert r["load_gbim_tests_scene_overlay"] == 0
    # The provenance control must survive any gate change.
    assert r["draw_effect_setup_checks_pic"] is True


@needs_ccfp
def test_gate_pin_mutation_is_detected():
    """Re-inserting either gate into an in-memory copy must flip the report."""
    src = m.read_ccfp()
    assert ENABLED_ANCHOR in m.routine_body(src, "draw_effect_setup")
    regated = src.replace(ENABLED_ANCHOR, ALT_GATE_DES + ENABLED_ANCHOR, 1)
    assert m.gate_report(regated)["draw_effect_setup_tests_alt"] == 1
    assert m.gate_report(regated) != m.gate_report(src)
    assert LG_ANCHOR in m.routine_body(src, "load_gbim")
    regated2 = src.replace(LG_ANCHOR, LG_GATE + LG_ANCHOR, 1)
    assert m.gate_report(regated2)["load_gbim_tests_alt"] == 1
    # removing the id match is also visible
    no_pic = src.replace("cmp     ax, [gbim_block]", "cmp     ax, ax", 1)
    assert m.gate_report(no_pic)["draw_effect_setup_checks_pic"] is False
    # and the geometry parser rejects a changed draw_gbim shape
    broken = src.replace("mov     dx, 132", "mov     dx, 133", 1)
    assert m.parse_geometry(broken)["bottom"] == 133
    broken2 = src.replace("ja      .scale_ready", "jb      .scale_ready", 1)
    with pytest.raises(ValueError):
        m.parse_geometry(broken2)


GBBOOT_ASM = m.REPO_ROOT / "native" / "src" / "gbboot.asm"


@pytest.mark.skipif(not GBBOOT_ASM.is_file(), reason="gbboot.asm absent")
def test_gbboot_dos_image_arm_is_wired():
    text = GBBOOT_ASM.read_text(encoding="utf-8", errors="replace")
    body = [" ".join(l.replace(",", ", ").split()) for l in m.code_lines(m.routine_body(text, "prepare_alt_graphics"))]
    body = [b.replace(",  ", ", ") for b in body]
    i = body.index("cmp byte [graphics_requested], 2")
    assert body[i + 1] == "jne .dos_image"
    assert body[body.index("cmp byte [graphics_amiga_available], 0") + 1] == "je .dos_image"
    j = body.index(".dos_image:")
    arm = body[j:body.index(".scene:", j)]
    assert "cmp word [enginep], eng_dax_gen1" in arm
    for need in ("call read_effect_setup_pic", "call find_dos_cpic",
                 "mov word [runpathp], child_gb", "mov byte [graphics_image_ready], 1"):
        assert need in arm, need
    # fxbuf is shared: the effect read must precede the archive lookup
    assert arm.index("call read_effect_setup_pic") < arm.index("call find_dos_cpic")
    # the Amiga success path must not fall into the DOS arm
    assert body[body.index("mov byte [graphics_image_ready], 1") + 1] == "jmp .scene"
