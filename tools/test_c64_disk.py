"""Tests for tools/c64_disk.py.

Three layers, in increasing dependence on things outside the repo:

  1. A SYNTHETIC .d64 built in memory. Always runs, needs nothing external, and is where the
     fiddly CBM DOS rules are pinned (32-byte slot addressing, the last-sector byte-count rule).
  2. Real .g64 GCR decoding against the C64 Champions of Krynn disks, with VICE's `c1541` as an
     independent ORACLE -- the same discipline `dax_decode.py` follows against `DaxDump.exe`.
  3. The cross-platform result the C64 corpus exists for: the filename's hex suffix IS the DOS
     block id, and the payloads can be byte-identical -- but the 2-byte header skip needed to
     see that is PER-FAMILY, not universal. GEO's decompressed block genuinely starts with a
     real 2-byte length/area word and ECL's with the real `0x1388` magic, so skipping 2 bytes on
     the DOS side is correct there. WALLDEF, MON and ITEM carry NO such DOS-side header --
     `decodeWalldefBlock`/`decodeMonsterRecord`/`item.ts` all read real payload from byte 0 -- so
     skipping 2 bytes there discards two real bytes and biases the comparison toward "different".
     `_dos_index` applies the header skip per family for exactly this reason (see its docstring).
     Round 33 R4's `tools/buck_container_census.py` found this independently against Buck Rogers
     and is the source of the per-family `DOS_HEADER_LEN` table here (see
     `docs/engine/research/buck-containers.md`). Measured with the correction, across all seven
     titles: GEO 123/141 and ECL 75/167 same-id matches (unchanged by the fix, since GEO/ECL
     already used the right skip), WALLDEF 0/83 and MON 0/499 (genuinely never match -- a real
     negative, not an artifact of the header bug), and ITEM 1/119 payloads matching *by content*
     (Buck Rogers' `item0.dax` vs every C64 side's `ITEMFILE00`, previously invisible because the
     old universal skip corrupted the comparison and made an identical pair read as ~72%
     different). `test_only_maps_and_scripts_are_ever_byte_identical`'s `shared` set is derived
     from this and now includes `ITEMFILE`.

Layers 2 and 3 skip when their sources are absent. C64 images live on the user's drive and are
referenced, never vendored, exactly like the Amiga sources.
"""
from __future__ import annotations

import re
import shutil
import subprocess
import unittest
from pathlib import Path

import c64_disk as c64
import dax_decode

COK_C64 = Path("D:/Games/Emulator/C64/MyGames/CoK")
COK_DOS = Path(__file__).resolve().parents[1] / "Champions of Krynn"
CLEAN_SIDE = COK_C64 / "Champions of Krynn (1990)(SSI)(Disk 2 of 3 Side A).g64"
DAMAGED_SIDE = COK_C64 / "CoK_A.g64"
C1541 = shutil.which("c1541")

# The .d64 corpus: seven complete C64 title sets, 49 sides (added 2026-08-10). Plain sector dumps,
# so the GCR path above is exercised only by the .g64 set. Paired with whichever DOS install holds
# the same game -- two live in the repo, the rest come from GOG, and Buck Rogers from a staged
# DOS install (no GOG release).
REPO = Path(__file__).resolve().parents[1]
GOG = Path("C:/Program Files (x86)/GOG Galaxy/Games")
C64_SETS = Path("D:/Games/Emulator/C64/Goldbox")
ORACLE_TITLES = {
    "Champions of Krynn": REPO / "Champions of Krynn",
    "Death Knights of Krynn": REPO / "Death Knights of Krynn",
    "Curse of the Azure Bonds": GOG / "Curse of the Azure Bonds",
    "Pool of Radiance": GOG / "Pool of Radiance",
    "Secret of the Silver Blades": GOG / "Secret of the Silver Blades",
    "Gateway to the Savage Frontier": GOG / "Gateway to the Savage Frontier",
    "Buck Rogers - Countdown to Doomsday": Path(
        "D:/Games/Emulator/DOS/GoldBox/BuckRogers1-CountdownToDoomsday"
    ),
}

# C64 files that are byte-identical to a DOS block whose id is NOT their own hex suffix. Neither
# is a counterexample to the naming rule -- both are explained -- but the sweep must not let a
# THIRD one appear unexplained, so each is named here individually.
#
# - CoAB's ECL1.DAX holds blocks 80/81/82, and ECL50 -> 80 and ECL51 -> 81 both obey the rule.
#   Block 82 would be "ECL52", which does not exist on any side; ECL1E is a *different area*
#   (0x1E = 30) whose script happens to be identical content. Duplication across areas, not a
#   broken correspondence.
# - Buck Rogers' `item0.dax` holds its sole ITEM block under DOS id 1, while every C64 side names
#   its item table "ITEMFILE00" (id 0). An id-numbering offset (ITEM apparently starts counting
#   from 1 on the DOS side and 0 on the C64 side), not a content disagreement: the two payloads
#   are fully byte-identical once the per-family header is corrected (see `DOS_HEADER_LEN` above
#   and docs/engine/research/buck-containers.md). This pair only became visible once that header
#   bug was fixed, which is also why this entry is new alongside that fix.
KNOWN_SHARED_PAYLOAD = {
    ("Curse of the Azure Bonds", "ECL1E"),
    ("Buck Rogers - Countdown to Doomsday", "ITEMFILE00"),
}


def build_d64(name: bytes, entries: list[tuple[bytes, int, int, int]], files: dict) -> bytes:
    """Assemble a minimal but structurally real 35-track image."""
    img = bytearray(174848)

    def put(track, sector, data):
        off = c64.sector_offset(track, sector)
        img[off : off + len(data)] = data

    bam = bytearray(256)
    bam[0], bam[1] = 18, 1  # link to the first directory sector
    bam[0x90:0xA0] = name.ljust(16, b"\xa0")
    put(18, 0, bam)

    d = bytearray(256)
    d[0], d[1] = 0, 0xFF  # no further directory sectors
    for i, (fname, ftrack, fsector, blocks) in enumerate(entries):
        base = i * 32
        d[base + 2] = 0x82  # closed PRG
        d[base + 3] = ftrack
        d[base + 4] = fsector
        d[base + 5 : base + 21] = fname.ljust(16, b"\xa0")
        d[base + 30] = blocks & 0xFF
        d[base + 31] = blocks >> 8
    put(18, 1, d)

    for (track, sector), (link, payload) in files.items():
        blk = bytearray(256)
        blk[0], blk[1] = link
        blk[2 : 2 + len(payload)] = payload
        put(track, sector, blk)
    return bytes(img)


class SyntheticD64Tests(unittest.TestCase):
    def test_directory_reads_all_eight_slots_including_the_last(self) -> None:
        # The 8th slot begins at 0xE0 and ends exactly at 256. A reader that opens a 32-byte window
        # at slot+2 (i.e. at the type byte) overruns the block and silently drops ONE ENTRY PER
        # DIRECTORY SECTOR -- which is exactly the bug this file was written after hitting.
        names = [f"FILE{i:02X}".encode() for i in range(8)]
        entries = [(n, 17, i, 1) for i, n in enumerate(names)]
        files = {(17, i): ((0, 3), b"AB") for i in range(8)}
        disk = c64.read_d64(build_d64(b"TESTDISK", entries, files))
        got = c64.directory(disk)
        self.assertEqual(len(got), 8)
        self.assertEqual([e.name for e in got], [n.decode() for n in names])

    def test_last_sector_byte_count_is_an_index_not_a_length(self) -> None:
        # In the final sector the link is (0, N) where N is the index of the LAST USED byte, so the
        # payload is block[2:N+1]. Off by one here silently corrupts the tail of every file.
        entries = [(b"ONE", 17, 0, 1)]
        files = {(17, 0): ((0, 5), b"WXYZ")}  # bytes 2..5 are data -> 4 bytes
        disk = c64.read_d64(build_d64(b"TESTDISK", entries, files))
        data, problem = c64.read_file_checked(disk, c64.directory(disk)[0])
        self.assertIsNone(problem)
        self.assertEqual(data, b"WXYZ")

    def test_multi_sector_chain_and_load_address(self) -> None:
        entries = [(b"TWO", 17, 0, 2)]
        files = {
            (17, 0): ((17, 1), bytes([0x00, 0x40]) + b"A" * 252),  # full sector, load $4000
            (17, 1): ((0, 4), b"BBB"),
        }
        disk = c64.read_d64(build_d64(b"TESTDISK", entries, files))
        data, problem = c64.read_file_checked(disk, c64.directory(disk)[0])
        self.assertIsNone(problem)
        self.assertEqual(len(data), 254 + 3)
        self.assertEqual(c64.load_address(data), 0x4000)

    def test_a_broken_chain_is_reported_rather_than_silently_truncated(self) -> None:
        # A truncated asset that still parses is more dangerous than one that fails loudly.
        entries = [(b"BROKEN", 17, 0, 3)]
        files = {(17, 0): ((17, 9), b"A" * 254)}  # 17/9 never written -> reads as an empty sector
        img = bytearray(build_d64(b"TESTDISK", entries, files))
        # blank the target so it decodes as all-zero rather than being absent from a .d64
        disk = c64.read_d64(bytes(img))
        del disk.sectors[(17, 9)]
        data, problem = c64.read_file_checked(disk, c64.directory(disk)[0])
        self.assertIsNotNone(problem)
        self.assertIn("17/9", problem)
        self.assertEqual(len(data), 254)


@unittest.skipUnless(CLEAN_SIDE.is_file(), "C64 Champions of Krynn images not present")
class G64Tests(unittest.TestCase):
    def test_a_clean_side_decodes_every_sector_with_no_errors(self) -> None:
        disk = c64.read_image(CLEAN_SIDE)
        self.assertEqual(disk.errors, [])
        self.assertEqual(len(disk.sectors), 704)  # 35 tracks, standard speed-zone layout
        entries = c64.directory(disk)
        self.assertEqual(len(entries), 102)
        self.assertEqual(c64.disk_name(disk), "CHAMP V.0.0 B3")
        # and every file walks cleanly
        bad = [e.name for e in entries if e.closed and c64.read_file_checked(disk, e)[1]]
        self.assertEqual(bad, [])

    @unittest.skipUnless(DAMAGED_SIDE.is_file(), "CoK_A.g64 not present")
    def test_the_damaged_boot_side_reports_its_losses(self) -> None:
        # This image is a bad dump of Champions of Krynn disk 1 side A. It must NOT read as clean.
        # VICE's own c1541 truncates these same files without saying so.
        disk = c64.read_image(DAMAGED_SIDE)
        self.assertTrue(disk.errors)
        self.assertLess(len(disk.sectors), 704)
        entries = c64.directory(disk)
        broken = [e.name for e in entries if e.closed and c64.read_file_checked(disk, e)[1]]
        self.assertTrue(broken, "the damaged side must report broken chains")
        self.assertIn("BOOT", broken)

    @unittest.skipUnless(C1541, "VICE c1541 not on PATH")
    def test_gcr_decoding_matches_c1541_byte_for_byte(self) -> None:
        """Independent oracle: our pure-Python GCR decode vs VICE's own reader."""
        import hashlib
        import tempfile
        from collections import Counter

        disk = c64.read_image(CLEAN_SIDE)
        mine = Counter(
            hashlib.sha256(c64.read_file(disk, e)).hexdigest()
            for e in c64.directory(disk)
            if e.file_type == "PRG" and e.closed
        )
        with tempfile.TemporaryDirectory() as tmp:
            try:
                listing = subprocess.run(
                    [C1541, "-attach", str(CLEAN_SIDE), "-dir"],
                    capture_output=True, text=True, timeout=300,
                ).stdout
            except subprocess.TimeoutExpired:
                self.skipTest("c1541 exceeded its deadline; the oracle did not run")
            names = []
            for line in listing.splitlines():
                line = line.strip()
                if line.startswith(("0 ", "1 ")) or '"' not in line:
                    pass
                if line[:1].isdigit() and '"' in line:
                    names.append(line.split('"')[1])
            # c1541's -dir prints the DISK NAME in the same quoted position as the file names,
            # and prints it lowercased, so an uppercase prefix filter never matched it. Drop it by
            # comparing against the name our own reader gives, case-insensitively.
            label = c64.disk_name(disk).strip().casefold()
            names = [n for n in names if n.strip().casefold() != label]
            theirs = Counter()
            missed = []
            # One c1541 invocation per CHUNK of files, not one per file. The per-file form spawned
            # ~130 processes and blew its 120s deadline under load on 2026-08-22, turning a shared
            # gate red for a reason that had nothing to do with GCR decoding. c1541 accepts a
            # chained command sequence, so the whole side reads in a handful of processes; the
            # chunk keeps the argv well inside the Windows 32KB command-line limit.
            CHUNK = 32
            outs = [Path(tmp) / f"f{i:03d}" for i in range(len(names))]
            for base in range(0, len(names), CHUNK):
                argv = [C1541, "-attach", str(CLEAN_SIDE)]
                for i in range(base, min(base + CHUNK, len(names))):
                    argv += ["-read", names[i], str(outs[i])]
                try:
                    subprocess.run(argv, capture_output=True, text=True, timeout=300)
                except subprocess.TimeoutExpired:
                    self.skipTest("c1541 exceeded its deadline; the oracle did not run")
            for n, out in zip(names, outs):
                if out.is_file():
                    theirs[hashlib.sha256(out.read_bytes()).hexdigest()] += 1
                else:
                    missed.append(n)
        self.assertTrue(theirs, "c1541 produced no files; oracle did not run")
        # Report an oracle that did not run as an oracle failure. Without this, a c1541 subprocess
        # that silently drops a file under load surfaces as "our GCR decode disagrees with VICE",
        # which is the one thing this test exists to detect and the one thing it would not be.
        self.assertEqual(missed, [], f"c1541 failed to extract {len(missed)} of {len(names)} files")
        self.assertEqual(mine, theirs)


class CrossPlatformOracleTests(unittest.TestCase):
    """The reason the C64 corpus is interesting: it is an UNPACKED DAX.

    DOS bundles assets into `.DAX` archives keyed by a numeric block id; the C64 release ships the
    same payloads as loose CBM files whose name suffix is that id in HEX. Where a payload survives
    the port unchanged the two are byte-identical, which makes the C64 disk an independent oracle
    for DAX block identity -- no reverse engineering required to learn what a block IS.
    """

    #: payload-without-load-address -> [(archive, block id, the block's own 2-byte prefix)]
    dos: dict[bytes, list[tuple[str, int, bytes]]]

    @classmethod
    def setUpClass(cls) -> None:
        if not COK_C64.is_dir() or not COK_DOS.is_dir():
            raise unittest.SkipTest("need both C64 and DOS Champions of Krynn")
        cls.dos = {}
        for f in sorted(COK_DOS.rglob("*.DAX")):
            raw = f.read_bytes()
            try:
                base, blocks = dax_decode.parse_container(raw)
            except ValueError:
                continue
            for b in blocks:
                try:
                    body = dax_decode.decompress_block(raw, base, b)
                except Exception:
                    continue
                if len(body) > 2:
                    cls.dos.setdefault(body[2:], []).append((f.name, b.block_id, body[:2]))
        if not cls.dos:
            raise unittest.SkipTest("no DOS DAX blocks decoded")

    def matches(self):
        """Every readable C64 file whose payload equals a DOS block payload."""
        for side in sorted(COK_C64.glob("*.g64")):
            disk = c64.read_image(side)
            for e in c64.directory(disk):
                if e.file_type != "PRG" or not e.closed:
                    continue
                data, problem = c64.read_file_checked(disk, e)
                if problem or len(data) < 3:
                    continue
                for hit in self.dos.get(data[2:], ()):
                    yield e, data, hit

    def test_matching_payloads_always_agree_on_the_block_id(self) -> None:
        seen, checked = set(), 0
        for entry, _data, (arch, bid, _prefix) in self.matches():
            suffix = entry.name[-2:]
            if len(suffix) < 2 or any(ch not in "0123456789ABCDEF" for ch in suffix):
                continue
            checked += 1
            seen.add(entry.name)
            # THE claim: the hex suffix IS the DOS block id, on every single match.
            self.assertEqual(
                int(suffix, 16), bid,
                f"{entry.name} is byte-identical to {arch}#{bid} but its hex suffix disagrees",
            )
        self.assertGreaterEqual(len(seen), 25, "expected a substantial set of shared payloads")
        self.assertGreater(checked, 0)

    def test_the_two_byte_prefix_is_rewritten_by_the_port_not_inherited(self) -> None:
        """The shared payload begins at offset 2 on BOTH sides, but the word ahead of it differs.

        Worth pinning because the obvious guess -- that a DOS block simply is the C64 PRG, load
        address and all -- is false, and believing it would put a wrong 2-byte header on anything
        we ever write back. The C64 word is the PRG load address ($4000, a fixed staging buffer);
        the DOS word is a per-family field, and for GEO it is that block's own payload length.
        """
        dos_word = {"GEO": 0x0400, "ECL": 0x1388}
        checked = 0
        for entry, data, (arch, bid, prefix) in self.matches():
            family = entry.name[:3]
            if family not in dos_word:
                continue
            checked += 1
            self.assertEqual(c64.load_address(data), 0x4000, f"{entry.name} C64 load address")
            self.assertEqual(
                int.from_bytes(prefix, "little"), dos_word[family], f"{arch}#{bid} DOS prefix"
            )
            self.assertNotEqual(prefix, data[:2], f"{entry.name} vs {arch}#{bid}")
        self.assertGreater(checked, 0, "no GEO/ECL payload matched; the probe did not run")

    def test_the_dos_geo_prefix_is_that_blocks_payload_length(self) -> None:
        """Why GEO's rewritten word is $0400: it is the length of what follows it."""
        checked = 0
        for entry, data, (arch, bid, prefix) in self.matches():
            if not entry.name.startswith("GEO"):
                continue
            self.assertEqual(int.from_bytes(prefix, "little"), len(data) - 2, f"{arch}#{bid}")
            checked += 1
        self.assertGreater(checked, 0)


# Per-family DOS-side header length, in bytes, ahead of the real payload. GEO's decompressed
# block genuinely starts with a length/area word and ECL's with the real 0x1388 magic -- both
# real 2-byte fields, so slicing DOS[2:] is correct there. WALLDEF/MON/ITEM have NO such header
# (decodeWalldefBlock/decodeMonsterRecord/item.ts all read real payload from byte 0): slicing
# DOS[2:] for those three discards two real bytes and biases every comparison toward "different".
# This table -- and the finding behind it -- comes from Round 33 R4's independent measurement
# against Buck Rogers in tools/buck_container_census.py (docs/engine/research/buck-containers.md),
# which found the OLD universal-2-byte-skip version of this function reported item0.dax as ~72%
# DIFFERENT from every C64 ITEMFILE00, when they are in fact byte-identical. Families not listed
# here keep the historical 2-byte default: they never match DOS bytes at all regardless of skip
# (see test_only_maps_and_scripts_are_ever_byte_identical), so the default is untested but harmless.
DOS_HEADER_LEN = {"GEO": 2, "ECL": 2, "WALLDEF": 0, "MON": 0, "ITEMFILE": 0}
DEFAULT_DOS_HEADER_LEN = 2

# DOS archive filename stem prefix -> the family key above. Checked in this order; the five
# prefixes are mutually exclusive across every .DAX name in the corpus (verified by listing every
# archive across all seven titles), so order does not matter for correctness, only for clarity.
_DOS_ARCHIVE_FAMILY_PREFIXES: tuple[tuple[str, str], ...] = (
    ("WALLDEF", "WALLDEF"),
    ("GEO", "GEO"),
    ("ECL", "ECL"),
    ("MON", "MON"),
    ("ITEM", "ITEMFILE"),  # DOS ships ITEM1.DAX / item0.dax; the C64 file is ITEMFILE<hex>
)


def _dos_archive_family(stem_upper: str) -> str | None:
    for prefix, family in _DOS_ARCHIVE_FAMILY_PREFIXES:
        if stem_upper.startswith(prefix):
            return family
    return None


def _dos_index(dosdir: Path) -> dict[bytes, list[int]]:
    """payload-without-its-DOS-header -> [block id], across every .DAX in a DOS install.

    The header length is PER FAMILY (see DOS_HEADER_LEN above), not a universal 2 bytes -- GEO and
    ECL carry a real 2-byte DOS-side header, WALLDEF/MON/ITEM do not.
    """
    index: dict[bytes, list[int]] = {}
    # Case-folded on purpose: the GOG installs ship .DAX, the staged Buck Rogers install .dax.
    for f in sorted(p for p in dosdir.rglob("*") if p.suffix.lower() == ".dax"):
        raw = f.read_bytes()
        try:
            base, blocks = dax_decode.parse_container(raw)
        except ValueError:
            continue
        family = _dos_archive_family(f.stem.upper())
        header_len = DOS_HEADER_LEN.get(family, DEFAULT_DOS_HEADER_LEN)
        for b in blocks:
            try:
                body = dax_decode.decompress_block(raw, base, b)
            except Exception:
                continue
            if len(body) > header_len:
                index.setdefault(body[header_len:], []).append(b.block_id)
    return index


@unittest.skipUnless(C64_SETS.is_dir(), "C64 .d64 title sets not present")
class CorpusOracleTests(unittest.TestCase):
    """The oracle across the whole C64 corpus, not just Champions of Krynn.

    Seven complete title sets arrived 2026-08-10, six of which pair with a DOS install we hold.
    Sweeping all of them is what turns "the hex suffix is the block id" from a Champions of Krynn
    observation into a series-wide property -- and what surfaced its one exception.
    """

    def test_the_hex_suffix_rule_holds_across_every_paired_title(self) -> None:
        agree = 0
        exceptions: set[tuple[str, str]] = set()
        titles_checked = 0
        for title, dosdir in sorted(ORACLE_TITLES.items()):
            tdir = C64_SETS / title
            if not tdir.is_dir() or not dosdir.is_dir():
                continue
            dos = _dos_index(dosdir)
            if not dos:
                continue
            titles_checked += 1
            seen: set[str] = set()
            for img in sorted(tdir.glob("*.[Dd]64")):
                disk = c64.read_image(img)
                for e in c64.directory(disk):
                    if e.file_type != "PRG" or not e.closed or e.name in seen:
                        continue
                    data, problem = c64.read_file_checked(disk, e)
                    if problem or len(data) < 3:
                        continue
                    ids = dos.get(data[2:])
                    if not ids:
                        continue
                    seen.add(e.name)
                    suffix = e.name[-2:]
                    if len(suffix) < 2 or any(c not in "0123456789ABCDEF" for c in suffix):
                        continue
                    if int(suffix, 16) in ids:
                        agree += 1
                    else:
                        exceptions.add((title, e.name))
        self.assertGreaterEqual(titles_checked, 2, "not enough paired titles to be a sweep")
        # Every disagreement must be one we have already explained. A new one means either the
        # naming rule is weaker than documented or a decoder regressed -- both worth failing on.
        unexplained = exceptions - KNOWN_SHARED_PAYLOAD
        self.assertEqual(unexplained, set(), f"unexplained hex-suffix disagreements: {sorted(unexplained)}")
        self.assertGreaterEqual(agree, 190, "expected a corpus-wide body of shared payloads")

    def test_every_side_of_every_title_set_reads_without_a_broken_chain(self) -> None:
        """The .d64 corpus must stay readable end to end.

        This started as a real failure: the first Curse of the Azure Bonds dump had 42 broken
        chains, 39 of them because side 4's low tracks (6-9) were never written -- every file
        stored there walked into uniform filler and produced the same 3556 bytes. Sides 3 and 4
        were replaced from an independent dump (the superseded images are kept alongside). A
        chain that stops early is exactly the failure that would otherwise reach the oracle as a
        missing pair rather than an error, so guard it directly.
        """
        checked, broken = 0, []
        for title in sorted(ORACLE_TITLES):
            tdir = C64_SETS / title
            if not tdir.is_dir():
                continue
            for img in sorted(tdir.glob("*.[Dd]64")):
                disk = c64.read_image(img)
                for e in c64.directory(disk):
                    if e.file_type != "PRG" or not e.closed:
                        continue
                    checked += 1
                    _, problem = c64.read_file_checked(disk, e)
                    if problem:
                        broken.append(f"{title}/{img.name}:{e.name}: {problem}")
        self.assertGreater(checked, 4000, "corpus far smaller than expected")
        self.assertEqual(broken, [], f"{len(broken)} broken chains")

    def test_the_known_shared_payload_is_still_exactly_one_file(self) -> None:
        """Pins the CoAB ECL1E case itself, so it cannot silently disappear or multiply.

        If this ever fails because the file now agrees, the explanation in KNOWN_SHARED_PAYLOAD is
        wrong and should be re-derived rather than the entry simply deleted.
        """
        dosdir = ORACLE_TITLES["Curse of the Azure Bonds"]
        tdir = C64_SETS / "Curse of the Azure Bonds"
        if not dosdir.is_dir() or not tdir.is_dir():
            self.skipTest("Curse of the Azure Bonds not present on both platforms")
        dos = _dos_index(dosdir)
        found = None
        for img in sorted(tdir.glob("*.[Dd]64")):
            disk = c64.read_image(img)
            for e in c64.directory(disk):
                if e.name != "ECL1E" or e.file_type != "PRG" or not e.closed:
                    continue
                data, problem = c64.read_file_checked(disk, e)
                if problem:
                    continue
                found = dos.get(data[2:])
        self.assertIsNotNone(found, "CoAB ECL1E no longer matches any DOS block")
        # 0x1E == 30, but the block it duplicates is 82 (== 0x52, a file that is not on any side).
        self.assertEqual(found, [82])
        self.assertNotIn(0x1E, found)


def _c64_files(title: str) -> dict[str, bytes]:
    """name -> payload, first side wins, for one C64 title set."""
    out: dict[str, bytes] = {}
    for img in sorted((C64_SETS / title).glob("*.[Dd]64")):
        disk = c64.read_image(img)
        for e in c64.directory(disk):
            if e.file_type != "PRG" or not e.closed or e.name in out:
                continue
            data, problem = c64.read_file_checked(disk, e)
            if not problem:
                out[e.name] = data
    return out


def _c64_family(name: str) -> str:
    """Family label for a C64 filename, e.g. "GEO12" -> "GEO", "ITEMFILE00" -> "ITEMFILE".

    Prefers an exact match against the known families in _DOS_ARCHIVE_FAMILY_PREFIXES' values.
    A generic "strip the trailing run of 0-9A-F characters" regex over-eats these specific names,
    because D/E/F are valid hex digits AND appear in the family names themselves: "WALLDEF01"
    would strip to "WALL" (losing "DEF") and "ITEMFILE00" would strip to "ITEMFIL" (losing the
    "E"). Falls back to the generic strip for every other (graphics) family, where this test does
    not care about the exact label, only whether it is new.
    """
    for prefix in ("WALLDEF", "GEO", "ECL", "MON", "ITEMFILE"):
        if name.startswith(prefix) and re.fullmatch(r"[0-9A-F]{1,2}", name[len(prefix):]):
            return prefix
    return re.sub(r"[0-9A-F]*$", "", name) or name


def _dax_ids_by_family(dosdir: Path) -> dict[str, set[int]]:
    """archive stem without its trailing disk number -> union of its block ids."""
    fams: dict[str, set[int]] = {}
    for f in sorted(p for p in dosdir.rglob("*") if p.suffix.lower() == ".dax"):
        raw = f.read_bytes()
        try:
            _, blocks = dax_decode.parse_container(raw)
        except ValueError:
            continue
        fam = re.sub(r"\d+$", "", f.stem.upper())
        fams.setdefault(fam, set()).update(b.block_id for b in blocks)
    return fams


@unittest.skipUnless(C64_SETS.is_dir(), "C64 .d64 title sets not present")
class GraphicsFamilyOracleTests(unittest.TestCase):
    """What the C64 oracle proves about *graphics*, where payloads never match.

    The payload oracle is silent here: every byte-identical DOS/C64 pair in the corpus is a GEO
    map or an ECL script, because the art was redrawn for the VIC-II. But the naming survives the
    redraw, so block identity can still be read off the C64 side structurally -- by id set rather
    than by bytes.
    """

    def test_only_maps_and_scripts_are_ever_byte_identical(self) -> None:
        """No GRAPHICS family shares a single byte with DOS. This is what forces a real decoder.

        Stated as a test because it is the premise of every C64 graphics claim: if some art family
        ever did match, the cheap path (reuse the DOS decoder) would be open and worth taking.

        `shared` grew from {"GEO", "ECL"} to include "ITEMFILE" on 2026-09-04, and the growth is a
        bug fix, not a new discovery: `_dos_index` used to skip a fixed 2 bytes on the DOS side
        for every family, but ITEM (like WALLDEF and MON) carries no such DOS-side header, so the
        old skip discarded two real payload bytes and misaligned the rest. That made Buck Rogers'
        `item0.dax` (single 1456-byte block) read as ~72% different from every C64 `ITEMFILE00`,
        when the two are in fact byte-identical (Round 33 R4, docs/engine/research/buck-
        containers.md, tools/buck_container_census.py). With the per-family header length
        corrected, this sweep finds exactly that one pair (1 of 119 checked ITEMFILE files, all on
        Buck Rogers -- every other title's ITEM archives bundle several items per block and do not
        match a single-item C64 file even with the corrected offset). WALLDEF (0/83) and MON
        (0/499) do NOT gain a match under the same correction -- confirmed by direct measurement,
        not assumed -- so they stay real negatives, not further instances of this bug.
        """
        shared: set[str] = set()
        titles = 0
        for title, dosdir in sorted(ORACLE_TITLES.items()):
            if not (C64_SETS / title).is_dir() or not dosdir.is_dir():
                continue
            dos = set(_dos_index(dosdir))
            if not dos:
                continue
            titles += 1
            for name, data in _c64_files(title).items():
                if len(data) > 2 and data[2:] in dos:
                    shared.add(_c64_family(name))
        self.assertGreaterEqual(titles, 2)
        self.assertEqual(
            shared, {"GEO", "ECL", "ITEMFILE"},
            "a family other than GEO/ECL/ITEMFILE now matches DOS bytes",
        )

    def test_the_mon_family_does_not_even_agree_on_record_length(self) -> None:
        """The concrete counterexample to "C64 files are unpacked DOS blocks".

        `test_only_maps_and_scripts_are_ever_byte_identical` already proves no MON payload
        matches DOS bytes. This goes further and pins the stronger fact that cost a 2026-08-11
        research slice its premise: the two platforms disagree on the record's LENGTH, so a C64
        MON file cannot locate a DOS field offset even in principle -- no alignment exists to
        find. Champions and Death Knights differ from each other on the DOS side too (409 vs
        216) while sharing one 480-byte C64 record, which is why the deltas are unequal.
        """
        seen: dict[str, tuple[set[int], set[int]]] = {}
        for title, dosdir in sorted(ORACLE_TITLES.items()):
            if title not in ("Champions of Krynn", "Death Knights of Krynn"):
                continue
            if not (C64_SETS / title).is_dir() or not dosdir.is_dir():
                continue
            c64_lens = {
                len(data) - 2
                for name, data in _c64_files(title).items()
                if re.fullmatch(r"MON[0-9A-F]{1,2}", name)
            }
            dos_lens: set[int] = set()
            for arc in sorted(dosdir.glob("MON?CHA.DAX")):
                _base, blocks = dax_decode.parse_container(arc.read_bytes())
                dos_lens.update(blk.raw_size for blk in blocks)
            if c64_lens and dos_lens:
                seen[title] = (c64_lens, dos_lens)

        if not seen:
            self.skipTest("neither Krynn title has both a C64 set and a DOS install present")
        for title, (c64_lens, dos_lens) in seen.items():
            self.assertEqual(c64_lens, {480}, f"{title}: C64 MON record length moved")
            self.assertTrue(dos_lens, f"{title}: no DOS MON blocks parsed")
            self.assertTrue(
                c64_lens.isdisjoint(dos_lens),
                f"{title}: a MON record length now matches across platforms ({c64_lens} vs {dos_lens})",
            )
        if "Champions of Krynn" in seen:
            self.assertEqual(seen["Champions of Krynn"][1], {409})
        if "Death Knights of Krynn" in seen:
            self.assertEqual(seen["Death Knights of Krynn"][1], {216})

    def test_the_c64_pic_family_is_the_dos_pic_and_bigpic_archives_merged(self) -> None:
        """DOS splits pictures across PIC*.DAX and BIGPIC*.DAX; the C64 has one flat PIC namespace.

        The ids are disjoint between the two DOS archives and are preserved across the merge, so a
        C64 PIC name still identifies its DOS block even though the pixels share nothing.
        """
        checked = 0
        for title, dosdir in sorted(ORACLE_TITLES.items()):
            if not (C64_SETS / title).is_dir() or not dosdir.is_dir():
                continue
            fams = _dax_ids_by_family(dosdir)
            pic, big = fams.get("PIC", set()), fams.get("BIGPIC", set())
            if not pic:
                continue
            checked += 1
            self.assertEqual(pic & big, set(), f"{title}: PIC/BIGPIC ids overlap")
            c64ids = {
                int(m.group(1), 16)
                for name in _c64_files(title)
                if (m := re.fullmatch(r"PIC([0-9A-F]{1,2})", name))
            }
            self.assertTrue(c64ids, f"{title}: no C64 PIC family")
            # Gateway is the one title whose C64 picture set is not a superset -- it ships a
            # different, larger selection. Everywhere else the merge is total.
            if title != "Gateway to the Savage Frontier":
                self.assertEqual(
                    (pic | big) - c64ids, set(), f"{title}: DOS picture ids missing from C64"
                )
            # 0x64 is a C64-only picture present in every single title and in no DOS archive.
            self.assertIn(0x64, c64ids, f"{title}: PIC100 absent")
            self.assertNotIn(0x64, pic | big, f"{title}: 100 is a DOS picture id after all")
        self.assertGreaterEqual(checked, 5, "not enough titles to be a sweep")

    def test_every_c64_bigpic_is_the_same_fixed_size(self) -> None:
        """The C64 counterparts of DOS BIGPIC blocks are all 2681 or 2682 bytes, series-wide.

        A constant size across six titles means the full-screen picture format is uncompressed and
        shared, which is what makes it worth decoding at all. Ordinary PIC files vary in size, so
        this is a property of the BIGPIC ids specifically, not of the family.
        """
        sizes: set[int] = set()
        varied = 0
        for title, dosdir in sorted(ORACLE_TITLES.items()):
            if not (C64_SETS / title).is_dir() or not dosdir.is_dir():
                continue
            fams = _dax_ids_by_family(dosdir)
            pic, big = fams.get("PIC", set()), fams.get("BIGPIC", set())
            if not big:
                continue
            files = _c64_files(title)
            for name, data in files.items():
                m = re.fullmatch(r"PIC([0-9A-F]{1,2})", name)
                if not m:
                    continue
                bid = int(m.group(1), 16)
                if bid in big:
                    sizes.add(len(data))
                elif bid in pic:
                    varied += 1
        self.assertTrue(sizes, "no C64 BIGPIC counterparts found")
        self.assertLessEqual(sizes, {2681, 2682}, f"BIGPIC size is no longer fixed: {sorted(sizes)}")
        self.assertGreater(varied, 100, "expected a large body of ordinary PIC files to contrast")


if __name__ == "__main__":
    unittest.main()
