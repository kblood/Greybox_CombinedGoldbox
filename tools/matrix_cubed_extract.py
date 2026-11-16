#!/usr/bin/env python3
"""One-time extraction of Buck Rogers: Matrix Cubed from its read-only `.7z` bundle.

`docs/goldbox-versions-holdings.md` records that Matrix Cubed lives only inside
`D:/Games/Emulator/DOS/Goldbox/buckrogers2_dos_win.7z` (a third-party gamesnostalgia DOSBox
repackaging, not an original distribution) and is "the ledger's one genuine gap" because nothing
in `tools/` ever extracted it. `CLAUDE.md`'s convention for exactly this situation already exists:
extraction outputs go in a git-ignored `*_extracted/` directory (see `daxdump_extracted/`,
`hackdocs_extracted/`, `amiga_extracted/`, all covered by `.gitignore:5`'s `*_extracted/` rule).
This script performs that one-time extraction into `matrixcubed_extracted/` -- nothing else.

Hard constraints (non-negotiable, enforced by construction, not just by comment):
  - The `.7z` source and everything under `D:\\` is READ-ONLY. This script only ever *reads* from
    `SOURCE_ARCHIVE`; it never writes under `D:\\`.
  - The extraction target is `matrixcubed_extracted/` at the repo root, and ONLY that directory.
  - Idempotent: if the sentinel file `matrixcubed_extracted/BuckRogers2/c/Matrix/MATRIX.CFG`
    already exists, extraction is skipped (re-running costs nothing and never re-writes).
  - Primary extractor: py7zr (pure Python, already a project dependency for this pass). Fallback:
    the system 7-Zip CLI (`C:\\Program Files\\7-Zip\\7z.exe x`), used only if py7zr is unavailable
    or fails. If neither works, this script exits non-zero and prints why -- it does NOT try to
    install anything.

Usage:
    python tools/matrix_cubed_extract.py            # extract (if needed) + print manifest
    python tools/matrix_cubed_extract.py --dry-run   # list archive contents only, extract nothing
"""
from __future__ import annotations

import argparse
import hashlib
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
SOURCE_ARCHIVE = Path("D:/Games/Emulator/DOS/Goldbox/buckrogers2_dos_win.7z")
EXTRACT_DIR = REPO_ROOT / "matrixcubed_extracted"
SENTINEL = EXTRACT_DIR / "BuckRogers2" / "c" / "Matrix" / "MATRIX.CFG"
SEVEN_ZIP_EXE = Path("C:/Program Files/7-Zip/7z.exe")


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def already_extracted() -> bool:
    return SENTINEL.exists()


def extract_with_py7zr() -> tuple[bool, str]:
    try:
        import py7zr
    except ImportError as e:
        return False, f"py7zr not importable: {e}"
    try:
        with py7zr.SevenZipFile(SOURCE_ARCHIVE, "r") as archive:
            archive.extractall(path=EXTRACT_DIR)
        return True, "py7zr"
    except Exception as e:  # noqa: BLE001 - report and fall back
        return False, f"py7zr extraction failed: {e}"


def extract_with_7z_cli() -> tuple[bool, str]:
    if not SEVEN_ZIP_EXE.exists():
        return False, f"{SEVEN_ZIP_EXE} not found"
    EXTRACT_DIR.mkdir(parents=True, exist_ok=True)
    result = subprocess.run(
        [str(SEVEN_ZIP_EXE), "x", str(SOURCE_ARCHIVE), f"-o{EXTRACT_DIR}", "-y"],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        return False, f"7z.exe exit {result.returncode}: {result.stdout}\n{result.stderr}"
    return True, "7z.exe CLI"


def do_extract() -> None:
    if not SOURCE_ARCHIVE.exists():
        print(f"SOURCE ABSENT: {SOURCE_ARCHIVE} does not exist. Nothing to extract; not an error "
              "for a checkout without the external D:\\ source tree, but this script cannot proceed.")
        sys.exit(3)

    ok, how = extract_with_py7zr()
    if not ok:
        print(f"py7zr path failed ({how}); trying 7z.exe fallback.", file=sys.stderr)
        ok, how = extract_with_7z_cli()
    if not ok:
        print(f"EXTRACTION FAILED: {how}", file=sys.stderr)
        print("Not installing new tooling to force this -- stopping as instructed.", file=sys.stderr)
        sys.exit(4)

    if not SENTINEL.exists():
        print(f"Extraction ran via {how} but the expected sentinel {SENTINEL} is still missing; "
              "the archive layout may have changed.", file=sys.stderr)
        sys.exit(5)
    print(f"Extracted via {how}.")


def print_manifest() -> None:
    files = sorted(p for p in EXTRACT_DIR.rglob("*") if p.is_file())
    total_bytes = 0
    print(f"\n{len(files)} files under {EXTRACT_DIR.relative_to(REPO_ROOT)}:")
    for p in files:
        size = p.stat().st_size
        total_bytes += size
        digest = sha256_of(p)
        rel = p.relative_to(EXTRACT_DIR).as_posix()
        print(f"  {size:>9}  {digest}  {rel}")
    print(f"total: {len(files)} files, {total_bytes} bytes")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true", help="list archive contents only; extract nothing")
    args = ap.parse_args()

    if args.dry_run:
        try:
            import py7zr
        except ImportError as e:
            print(f"py7zr not importable, cannot list: {e}", file=sys.stderr)
            sys.exit(2)
        with py7zr.SevenZipFile(SOURCE_ARCHIVE, "r") as archive:
            for entry in archive.list():
                kind = "DIR " if entry.is_directory else "FILE"
                size = "" if entry.is_directory else entry.uncompressed
                print(f"{kind}  {size:>9}  {entry.filename}")
        return

    if already_extracted():
        print(f"Already extracted (sentinel present): {SENTINEL.relative_to(REPO_ROOT)}")
    else:
        print(f"Source archive: {SOURCE_ARCHIVE} ({SOURCE_ARCHIVE.stat().st_size} bytes)")
        print(f"Source SHA-256: {sha256_of(SOURCE_ARCHIVE)}")
        do_extract()

    print_manifest()


if __name__ == "__main__":
    main()
