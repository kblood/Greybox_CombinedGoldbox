"""Re-checkable string census backing round 34 R4's correction to round 33's GLBR claim.

Round 33 published "6 GLBR titles" including Buck Rogers: Matrix Cubed, on the strength of
Matrix's `MUSIC.DAX` decoding as 8 `GLBR` songs byte-identical to Countdown to Doomsday's own
`MUSIC.DAX`. That identity is exactly the problem: it is file identity, not two independent
confirmations that the game actually *opens* that file for music. Matrix's own install also
ships `BUCKA.XMI`/`BUCKB.XMI`/`BUCKC.XMI`, five Miles AIL `.ADV` hardware drivers
(`ADLIB`/`MT32MPU`/`SBFM`/`TANDY`/`PCSPKR`) and an `FATV9.AD`/`.BNK`/`.CAT` instrument bank --
DQK's own Miles/XMI stack -- which Countdown does not ship at all.

This module censuses both titles' own binaries -- `START.EXE` (EXEPACK-compressed; unpacked via
`exepack_unpack.unpack`) and `GAME.OVR` (a `TPOV`/`FBOV` overlay container, NOT EXEPACK-compressed
-- `exepack_unpack.unpack` correctly rejects it on the 'MZ' magic check, so it is read raw) -- for:

  - `.ADV` / `.XMI` filename-shaped strings and `BUCK[A-C]` / `FATV` substrings (Matrix's XMI/AIL
    stack).
  - The literal file-open construction this loader family builds a DAX path from: a Pascal
    (length-prefixed) `"MUSIC"` string immediately followed by a length-prefixed `".dax"` string
    -- verified against Countdown's own unpacked `START.EXE` at file offsets 0x7e3b/0x7f9e:
    `\\x05MUSIC\\x04.dax`. This is deliberately distinct from any bare "MUSIC" substring, because
    Matrix's `GAME.OVR` contains exactly one bare "MUSIC" -- a credits-screen label
    ("...Susan Manley  MUSIC: Ralph Thomas & The Fat Man...") at file offset 0x2cb, not a file
    open -- and Countdown's own `GAME.OVR` contains a bare "MUSICAL SCORE:" credits label too, so
    counting bare "MUSIC" would not discriminate a label from an open.

The alternative this discriminates against ("Matrix plays MUSIC.DAX via a GLBR driver like
Countdown") predicts a `MUSIC.DAX`-shaped open string in Matrix's own loader; measured: zero,
in either binary.

Honest limitation: `XMI_RE` requires a fused `NAME.xmi`-shaped token, but Matrix's own loader
builds an XMI path the SAME two-Pascal-string way it builds `MUSIC`+`.dax` (a length-prefixed
base name immediately followed by a separate length-prefixed `.xmi` extension string, verified
at file offset 0x8d34: `\\x04.xmi\\x06fatv9.`), so `xmi_names` comes back empty for Matrix even
though the extension string and the `BUCKA/B/C` base-name strings are both genuinely present
(caught separately by `BUCK_ABC_RE`/`FATV_RE`). Bar A does not require `xmi_names` to be
non-empty for Matrix for exactly this reason -- it checks `.ADV` names, `BUCK[A-C]` hits and the
absence of a `MUSIC.DAX` open. `xmi_names` is kept, and required EMPTY, for Countdown's side of
the discriminator (which builds no XMI strings of any shape at all).
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))

from exepack_unpack import ExepackError, unpack  # noqa: E402

ADV_RE = re.compile(rb"[A-Za-z0-9_]{2,12}\.ADV", re.IGNORECASE)
XMI_RE = re.compile(rb"[A-Za-z0-9_]{2,12}\.XMI", re.IGNORECASE)
BUCK_ABC_RE = re.compile(rb"BUCK[ABC]", re.IGNORECASE)
FATV_RE = re.compile(rb"FATV[A-Za-z0-9_]*", re.IGNORECASE)
# The actual DOS-loader file-open construction: a Pascal "MUSIC" string immediately followed by
# a Pascal ".dax" string. Case-sensitive on purpose -- the two real occurrences in Countdown's
# own START.EXE are both exactly this byte sequence; loosening this would start matching on
# coincidence rather than on the verified construction.
MUSIC_DAX_OPEN_RE = re.compile(rb"\x05MUSIC\x04\.dax")
BARE_MUSIC_RE = re.compile(rb"MUSIC", re.IGNORECASE)

# Default title paths, matching the two manifests' own source conventions (`gameAudio.ts`'s
# `GLBR_MUSIC_GAMES` doc comment): Countdown is the user's external `D:/` DOS install (never
# vendored); Matrix is the repo-relative, git-ignored `matrixcubed_extracted/` tree.
DEFAULT_TITLES: dict[str, dict[str, str]] = {
    "matrix": {
        "start_exe": "matrixcubed_extracted/BuckRogers2/c/Matrix/START.EXE",
        "game_ovr": "matrixcubed_extracted/BuckRogers2/c/Matrix/GAME.OVR",
    },
    "countdown": {
        "start_exe": "D:/Games/Emulator/DOS/Goldbox/BuckRogers1-CountdownToDoomsday/start.exe",
        "game_ovr": "D:/Games/Emulator/DOS/Goldbox/BuckRogers1-CountdownToDoomsday/game.ovr",
    },
}


def load_bytes(path: Path) -> bytes:
    """Read a DOS binary, unpacking EXEPACK if it is one. `GAME.OVR` overlays in this family are
    `TPOV`/`FBOV` containers, not EXEPACK-compressed MZ images (`unpack` raises `ExepackError` on
    the 'MZ' magic check for them) -- those are read raw, since their strings are already
    uncompressed bytes."""
    data = path.read_bytes()
    if data[:2] != b"MZ":
        return data
    try:
        image, _ = unpack(path)
        return image
    except ExepackError:
        return data


@dataclass
class FileCensus:
    path: str
    size: int
    adv_names: list[str] = field(default_factory=list)
    xmi_names: list[str] = field(default_factory=list)
    buck_abc_hits: int = 0
    fatv_hits: int = 0
    music_dax_opens: int = 0
    bare_music_hits: int = 0

    def to_json(self) -> dict:
        return {
            "path": self.path,
            "size": self.size,
            "adv_names": self.adv_names,
            "xmi_names": self.xmi_names,
            "buck_abc_hits": self.buck_abc_hits,
            "fatv_hits": self.fatv_hits,
            "music_dax_opens": self.music_dax_opens,
            "bare_music_hits": self.bare_music_hits,
        }


def census_file(path: Path) -> FileCensus:
    data = load_bytes(path)
    adv = sorted({m.group(0).decode("ascii", "replace").lower() for m in ADV_RE.finditer(data)})
    xmi = sorted({m.group(0).decode("ascii", "replace").lower() for m in XMI_RE.finditer(data)})
    return FileCensus(
        path=str(path),
        size=len(data),
        adv_names=adv,
        xmi_names=xmi,
        buck_abc_hits=len(BUCK_ABC_RE.findall(data)),
        fatv_hits=len(FATV_RE.findall(data)),
        music_dax_opens=len(MUSIC_DAX_OPEN_RE.findall(data)),
        bare_music_hits=len(BARE_MUSIC_RE.findall(data)),
    )


@dataclass
class TitleCensus:
    title: str
    start_exe: FileCensus
    game_ovr: FileCensus

    @property
    def adv_names(self) -> list[str]:
        return sorted(set(self.start_exe.adv_names) | set(self.game_ovr.adv_names))

    @property
    def xmi_names(self) -> list[str]:
        return sorted(set(self.start_exe.xmi_names) | set(self.game_ovr.xmi_names))

    @property
    def buck_abc_hits(self) -> int:
        return self.start_exe.buck_abc_hits + self.game_ovr.buck_abc_hits

    @property
    def fatv_hits(self) -> int:
        return self.start_exe.fatv_hits + self.game_ovr.fatv_hits

    @property
    def music_dax_opens(self) -> int:
        return self.start_exe.music_dax_opens + self.game_ovr.music_dax_opens

    def to_json(self) -> dict:
        return {
            "title": self.title,
            "start_exe": self.start_exe.to_json(),
            "game_ovr": self.game_ovr.to_json(),
            "adv_names": self.adv_names,
            "xmi_names": self.xmi_names,
            "buck_abc_hits": self.buck_abc_hits,
            "fatv_hits": self.fatv_hits,
            "music_dax_opens": self.music_dax_opens,
        }


def census_title(title: str, start_exe: Path, game_ovr: Path) -> TitleCensus:
    return TitleCensus(
        title=title,
        start_exe=census_file(start_exe),
        game_ovr=census_file(game_ovr),
    )


def bar_a_verdict(matrix: TitleCensus, countdown: TitleCensus) -> dict:
    """Round 34 R4's Bar A: Matrix's loader carries >= 3 `.ADV` names and `BUCK[A-C]`, and 0
    `MUSIC.DAX` file-open references; Countdown's carries a `MUSIC.DAX` file-open reference and 0
    `.ADV`/`.XMI` names. Both sides of a discriminator, not just one, per the plan's own
    admonition that Countdown must show the inverse pattern or this isn't a discriminator."""
    matrix_ok = (
        len(matrix.adv_names) >= 3
        and matrix.buck_abc_hits > 0
        and matrix.music_dax_opens == 0
    )
    countdown_ok = (
        countdown.music_dax_opens > 0
        and len(countdown.adv_names) == 0
        and len(countdown.xmi_names) == 0
    )
    return {
        "matrix_ok": matrix_ok,
        "countdown_ok": countdown_ok,
        "pass": matrix_ok and countdown_ok,
    }


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--json", dest="json_path", type=Path, required=False)
    args = p.parse_args()

    results = {}
    missing = []
    for title, paths in DEFAULT_TITLES.items():
        start_exe = Path(paths["start_exe"])
        game_ovr = Path(paths["game_ovr"])
        if not start_exe.exists() or not game_ovr.exists():
            missing.append(title)
            continue
        results[title] = census_title(title, start_exe, game_ovr)

    out: dict = {"titles": {t: c.to_json() for t, c in results.items()}, "missing": missing}
    if "matrix" in results and "countdown" in results:
        out["bar_a"] = bar_a_verdict(results["matrix"], results["countdown"])

    text = json.dumps(out, indent=2, sort_keys=True)
    if args.json_path:
        args.json_path.parent.mkdir(parents=True, exist_ok=True)
        args.json_path.write_text(text + "\n", encoding="utf-8")
    print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
