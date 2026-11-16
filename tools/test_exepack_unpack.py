"""Tests for `tools/exepack_unpack.py` (round 32 R5).

Three groups:

1. Synthetic, always-run tests build a small, fully hand-computed EXEPACK v1 image (one
   terminal "copy" chunk, one non-empty relocation group) so `parse_mz`, `find_exepack_header`,
   `decompress` (the fill/copy/terminal-chunk grammar) and `parse_relocations` are each checked
   against bytes whose correct output was worked out by hand, not by trusting the tool's own
   output back at itself. No external source needed.

2. A permanent mutation-sensitivity test: flips one byte inside the synthetic relocation table
   and asserts the parsed relocation list changes -- i.e. `parse_relocations` is not silently
   ignoring corruption. To prove this probe can actually fail (the standing "probes must be able
   to fail" rule), `parse_relocations`'s `target = group * GROUP_SPAN_PARAGRAPHS * 16 + offset`
   line was actually edited in the working tree to `+ 0` (dropping the per-entry `offset` from
   the target computation, while `offset` itself still decoded correctly) and the suite was
   re-run: `test_relocation_table_is_sensitive_to_single_byte_corruption` went RED --

       AssertionError: 0 != 4

   -- from its own `self.assertEqual(mutated[0].target, 4)` line: with `offset` dropped from the
   formula, flipping the offset byte still moves `mutated[0].offset` from 5 to 4 (so the test's
   OTHER assertion, `assertNotEqual` on the `(group, offset, target)` tuples, would have passed
   anyway on `offset` alone), but `target` stayed 0 instead of tracking it to 4 -- which is why
   this test pins `target` with its own explicit `assertEqual`, not just the tuple-level
   inequality. The edit was then reverted and the suite re-run GREEN (`8 passed`). Not committed.

3. Real-bytes integration tests (skipped, not failed, when the GOG Galaxy / D:\\ installs are
   absent) that unpack all eight Gen1 EXEPACK loaders (Buck, Matrix, CoAB, CoK, Pools, Gateway,
   Treasures, Secret) and pin check (a) from `docs/engine/PLAN-ROUND-32.md` R5: the fraction of
   relocation targets holding a word < dest_len in the UNPACKED image, next to the same fraction
   read at those same offsets in the still-PACKED file (the null -- a relocation target is a
   segment-word slot, so if the packed file already satisfied this fraction by chance the check
   would prove nothing).
"""
from __future__ import annotations

import struct
import sys
import tempfile
import unittest
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))

import exepack_unpack as subject  # noqa: E402

try:
    import goldbox_corpus
except ImportError:  # pragma: no cover
    goldbox_corpus = None

PROFILES = [
    "buck-rogers-countdown-to-doomsday",
    "curse-of-the-azure-bonds",
    "champions-of-krynn",
    "pools-of-darkness",
    "gateway-to-the-savage-frontier",
    "treasures-of-the-savage-frontier",
    "secret-of-the-silver-blades",
]

# Matrix Cubed ships inside `buckrogers2_dos_win.7z` (D:\Games\Emulator\DOS\Goldbox) and is not
# discovered by `goldbox_corpus.binary_inventory` even once extracted -- same convention as
# `tools/map_matrix_ecl_dispatch.py`'s own `MATRIX_DIR`: the git-ignored, never-vendored
# extraction root `matrixcubed_extracted/BuckRogers2/c/Matrix/START.EXE`.
MATRIX_LOADER = goldbox_corpus.REPO_ROOT / "matrixcubed_extracted" / "BuckRogers2" / "c" / "Matrix" / "START.EXE" if goldbox_corpus else None


def _loader_paths() -> dict[str, Path] | None:
    """(profile_id -> START.EXE/GAME.EXE path) for all eight Gen1 titles, or None if any
    install is missing (real installs live outside the repo; the caller skips rather than
    fails)."""
    if goldbox_corpus is None:
        return None
    try:
        inventory = goldbox_corpus.binary_inventory.inventory(
            goldbox_corpus.inventory_roots([]), recursive=False, max_depth=3, include_unprofiled=False
        )
        routes = goldbox_corpus.load_routes()
        out: dict[str, Path] = {}
        for profile_id in PROFILES:
            install = goldbox_corpus.choose_install(inventory, profile_id, routes.get(profile_id))
            if install is None:
                return None
            files = goldbox_corpus.file_index(install)
            path = files.get("START.EXE") or files.get("GAME.EXE")
            if path is None:
                return None
            out[profile_id] = path
        if MATRIX_LOADER is None or not MATRIX_LOADER.exists():
            return None
        out["buck-rogers-matrix-cubed"] = MATRIX_LOADER
        return out
    except Exception:
        return None


LOADERS = _loader_paths()


# ---------------------------------------------------------------------------
# 1. Synthetic EXEPACK v1 image, hand-computed.
# ---------------------------------------------------------------------------

# Chosen layout (see module docstring derivation in exepack_unpack.py for the general algorithm;
# these specific numbers were worked out by hand for this test):
#   MZ header: e_cparhdr=2 -> header_bytes=32, e_ip=0x12, e_cs=2 -> stub_base=32
#   load_module[13:29]  = 16-byte payload "EXEPACKSYNTHETIC"
#   load_module[29]     = length lo = 0x10 (16)
#   load_module[30]     = length hi = 0x00
#   load_module[31]     = cmd = 0xB3 (copy, terminal bit set)
#   load_module[32:50]  = EXEPACK header: dest_len=2 paragraphs, skip_len=1
#   load_module[50:60]  = EXPECTED_ENTRY_PREFETCH
#   load_module[333:]   = packed relocation table: group 0 = {offset 5}, groups 1..15 empty
#
# Worked out by hand:
#   dest_len_bytes = 32; dest_start = (2-1)*16+15 = 31
#   e_cs_paragraphs = 32//16 = 2; scan_para = 2-1 = 1; scan_offset = 16
#   scan window = load_module[16:32]; index 15 (abs offset 31) is cmd=0xB3 != 0xFF, so
#     last_nonff=15, all_ff=False, src_start = 16+15 = 31
#   si=31: cmd=0xB3 -> copy; length=16; next_si=28; src_lo=28-16+1=13; dst_lo=31-16+1=16
#     out[16:32] = load_module[13:29] = b"EXEPACKSYNTHETIC"; di=31-16=15; si=13-1-1=... -> 12
#     cmd&1 -> terminal, loop stops after 1 chunk
#   out[0:16] stays zero (no chunk ever wrote there) -- this synthetic image only exercises one
#   chunk, deliberately, so the expected output is fully hand-checkable.
STUB_BASE = 32
PAYLOAD = b"EXEPACKSYNTHETIC"
assert len(PAYLOAD) == 16
RELOC_TABLE_REL_OFFSET = 0x12D  # relative to STUB_BASE, matches subject.RELOC_TABLE_OFFSET


def _build_load_module(reloc_offset_value: int = 5) -> bytes:
    buf = bytearray(STUB_BASE + subject.RELOC_TABLE_OFFSET + 2 + 2 * 16)
    buf[:13] = b"RAW-ENTRY-123"
    buf[13:29] = PAYLOAD
    buf[29] = 0x10  # length lo
    buf[30] = 0x00  # length hi
    buf[31] = 0xB3  # cmd: copy, terminal
    # EXEPACK header at STUB_BASE: real_ip, real_cs, mem_start, exepack_size, real_sp, real_ss,
    # dest_len, skip_len, signature
    header = struct.pack("<8H2s", 0, 0, 0, 999, 0, 0, 2, 1, b"RB")
    buf[STUB_BASE : STUB_BASE + 18] = header
    buf[STUB_BASE + 18 : STUB_BASE + 28] = subject.EXPECTED_ENTRY_PREFETCH
    reloc_pos = STUB_BASE + subject.RELOC_TABLE_OFFSET
    struct.pack_into("<H", buf, reloc_pos, 1)  # group 0: 1 entry
    struct.pack_into("<H", buf, reloc_pos + 2, reloc_offset_value)  # group 0 entry's offset
    for group in range(1, 16):
        struct.pack_into("<H", buf, reloc_pos + 4 + (group - 1) * 2, 0)
    return bytes(buf)


def _build_exe_bytes(reloc_offset_value: int = 5) -> bytes:
    load_module = _build_load_module(reloc_offset_value)
    # e_cparhdr=2 -> header_bytes=32; e_cs=STUB_BASE//16=2; e_ip=0x12 (18).
    mz = struct.pack(
        "<2sHHHHHHHHHHHHH",
        b"MZ",
        0,  # e_cblp
        0,  # e_cp
        0,  # e_crlc
        2,  # e_cparhdr -> header_bytes = 32
        0, 0, 0, 0, 0,  # minalloc, maxalloc, ss, sp, csum
        18,  # e_ip
        STUB_BASE // 16,  # e_cs
        0, 0,  # lfarlc, ovno
    )
    # e_cparhdr=2 declares a 32-byte header (mz.header_bytes), but the MZ_STRUCT itself is only
    # 28 bytes -- pad out to the declared header size so `data[mz.header_bytes:]` lines up with
    # the start of `load_module` exactly (a real EXE's header includes a relocation table /
    # padding in this gap; this test doesn't need one).
    assert len(mz) == 28
    mz = mz + b"\x00" * (32 - len(mz))
    return mz + load_module


class SyntheticUnpackTests(unittest.TestCase):
    def _write(self, data: bytes) -> Path:
        with tempfile.NamedTemporaryFile(suffix=".EXE", delete=False) as f:
            f.write(data)
        return Path(f.name)

    def test_parse_mz_reads_header_bytes_and_entry(self) -> None:
        mz = subject.parse_mz(_build_exe_bytes())
        self.assertEqual(mz.header_bytes, 32)
        self.assertEqual(mz.e_cs, 2)
        self.assertEqual(mz.e_ip, 18)

    def test_parse_mz_rejects_non_mz_magic(self) -> None:
        with self.assertRaises(subject.ExepackError):
            subject.parse_mz(b"XX" + b"\x00" * 40)

    def test_decompress_recovers_hand_computed_image(self) -> None:
        data = _build_exe_bytes()
        image, result = subject.unpack(self._path_for(data))
        self.assertEqual(len(image), 32)
        self.assertEqual(image[0:16], b"\x00" * 16)
        self.assertEqual(image[16:32], PAYLOAD)
        self.assertEqual(result.dest_len_paragraphs, 2)
        self.assertEqual(result.skip_len, 1)
        self.assertEqual(result.first_decompressed_offset, 16)
        self.assertEqual(result.scan_paragraph_offset, 16)
        self.assertEqual(result.scan_last_nonff_offset, 15)
        self.assertFalse(result.scan_all_ff)
        self.assertEqual(result.src_start, 31)
        self.assertEqual(result.dest_start, 31)
        self.assertEqual(result.chunks_processed, 1)

    def test_complete_load_image_restores_only_the_untouched_prefix(self) -> None:
        data = _build_exe_bytes()
        path = self._path_for(data)
        decompressed, result = subject.unpack(path)
        complete, complete_result = subject.unpack_complete_load_image(path)
        load_module = data[32:]

        self.assertEqual(complete_result, result)
        self.assertEqual(complete[:16], load_module[:16])
        self.assertEqual(complete[16:], decompressed[16:])
        self.assertEqual(decompressed[:16], b"\x00" * 16)
        self.assertEqual(complete[16:], PAYLOAD)

    def test_complete_load_image_rejects_prefix_past_source_module(self) -> None:
        data = bytearray(_build_exe_bytes())
        # Enlarge the output while leaving the packed source module unchanged.
        # The decompressor then writes only the final 16 bytes, so the requested
        # preserved prefix would extend beyond the available source bytes.
        struct.pack_into("<H", data, 32 + STUB_BASE + 12, 0x20)
        with self.assertRaisesRegex(subject.ExepackError, "exceeds source load module"):
            subject.unpack_complete_load_image(self._path_for(bytes(data)))

    def test_parse_relocations_reads_the_one_hand_placed_entry(self) -> None:
        data = _build_exe_bytes(reloc_offset_value=5)
        load_module = data[32:]
        relocs = subject.parse_relocations(load_module, STUB_BASE)
        self.assertEqual(len(relocs), 1)
        self.assertEqual(relocs[0].group, 0)
        self.assertEqual(relocs[0].offset, 5)
        self.assertEqual(relocs[0].target, 5)

    def test_unpack_rejects_wrong_entry_prefetch(self) -> None:
        data = bytearray(_build_exe_bytes())
        # Corrupt one byte of the entry prefetch -- must refuse, not silently decompress garbage.
        # +32 for the MZ header (`header_bytes`) that precedes `load_module` in the full file.
        data[32 + STUB_BASE + 18] ^= 0xFF
        with self.assertRaises(subject.ExepackError):
            subject.unpack(self._path_for(bytes(data)))

    def _path_for(self, data: bytes) -> Path:
        path = self._write(data)
        self.addCleanup(path.unlink)
        return path


class RelocationMutationSensitivityTests(unittest.TestCase):
    """Group 2: the permanent mutation-sensitivity probe (see module docstring for the
    break -> RED -> restore -> quote log of actually exercising this)."""

    def test_relocation_table_is_sensitive_to_single_byte_corruption(self) -> None:
        baseline_module = _build_load_module(reloc_offset_value=5)
        baseline = subject.parse_relocations(baseline_module, STUB_BASE)

        mutated_module = bytearray(baseline_module)
        offset_field_pos = STUB_BASE + subject.RELOC_TABLE_OFFSET + 2
        mutated_module[offset_field_pos] ^= 0x01  # flip one bit of the one relocation's offset
        mutated = subject.parse_relocations(bytes(mutated_module), STUB_BASE)

        self.assertNotEqual(
            [(r.group, r.offset, r.target) for r in baseline],
            [(r.group, r.offset, r.target) for r in mutated],
            "mutating the relocation table did not change the parsed output "
            f"(before={baseline}, after={mutated})",
        )
        self.assertEqual(mutated[0].offset, 4)
        self.assertEqual(mutated[0].target, 4)


# ---------------------------------------------------------------------------
# 3. Real-bytes integration: all eight Gen1 EXEPACK loaders.
# ---------------------------------------------------------------------------


@unittest.skipIf(LOADERS is None, "Gen1 retail installs not found (D:\\ / GOG Galaxy sources absent)")
class RealLoaderUnpackTests(unittest.TestCase):
    def test_cok_complete_image_keeps_exepack_entry_and_startup_call(self) -> None:
        cok_start = Path(__file__).resolve().parents[1] / "Champions of Krynn" / "START.EXE"
        if not cok_start.exists():
            self.skipTest("held CoK START.EXE is not present")

        decompressed, legacy_result = subject.unpack(cok_start)
        complete, result = subject.unpack_complete_load_image(cok_start)
        packed = cok_start.read_bytes()
        mz = subject.parse_mz(packed)
        load_module = packed[mz.header_bytes:]

        self.assertEqual(result.real_entry_cs, 0x0000)
        self.assertEqual(result.real_entry_ip, 0x003F)
        self.assertEqual(result.first_decompressed_offset, 0x038D)
        self.assertEqual(result, legacy_result)
        self.assertEqual(complete[0x003F:0x0044], bytes.fromhex("9A 00 00 46 0A"))
        self.assertEqual(complete[0x013B:0x0140], bytes.fromhex("9A 25 00 61 00"))
        self.assertEqual(complete[:result.first_decompressed_offset], load_module[:result.first_decompressed_offset])
        self.assertEqual(complete[result.first_decompressed_offset:], decompressed[result.first_decompressed_offset:])
        self.assertEqual(decompressed[0x003F:0x0044], b"\x00" * 5)

    def test_all_eight_unpack_to_declared_dest_len(self) -> None:
        for profile_id, path in LOADERS.items():
            with self.subTest(profile=profile_id):
                image, result = subject.unpack(path)
                self.assertEqual(len(image), result.dest_len_bytes)
                self.assertGreater(result.relocation_count, 0)

                complete, complete_result = subject.unpack_complete_load_image(path)
                self.assertEqual(complete_result, result)
                self.assertEqual(len(complete), result.dest_len_bytes)
                self.assertLessEqual(result.first_decompressed_offset, len(path.read_bytes()) - result.header_bytes)
                self.assertEqual(
                    complete[:result.first_decompressed_offset],
                    path.read_bytes()[result.header_bytes:result.header_bytes + result.first_decompressed_offset],
                )
                self.assertEqual(
                    complete[result.first_decompressed_offset:],
                    image[result.first_decompressed_offset:],
                )

    def test_relocation_targets_beat_the_packed_file_null(self) -> None:
        """Check (a): fraction of relocation targets holding a word < dest_len (PARAGRAPHS -- the
        segment-value scale a relocation actually patches, not the byte length) in the UNPACKED
        image, next to the same fraction read at those offsets in the still-PACKED file (the
        null distribution). Using dest_len in BYTES here is the null-defeating mistake this test
        caught during development: several titles' dest_len_bytes exceeds 0xFFFF, so EVERY
        possible 16-bit word trivially satisfies "< dest_len_bytes" and the check stops
        discriminating anything (observed: buck's packed-file null hit 1.0, same as its unpacked
        fraction). dest_len in PARAGRAPHS is the correct scale: a real segment fixup word must be
        a paragraph offset within the image, so it is bounded by the image's own paragraph count,
        not its byte count."""
        for profile_id, path in LOADERS.items():
            with self.subTest(profile=profile_id):
                data = path.read_bytes()
                image, result = subject.unpack(path)
                dest_len = result.dest_len_paragraphs
                targets = [r.target for r in result.relocations if r.target + 2 <= len(image)]
                self.assertGreater(len(targets), 0)

                def frac(buf: bytes) -> float:
                    hits = 0
                    n = 0
                    for t in targets:
                        if t + 2 > len(buf):
                            continue
                        n += 1
                        (word,) = struct.unpack_from("<H", buf, t)
                        if word < dest_len:
                            hits += 1
                    return hits / n if n else 0.0

                unpacked_frac = frac(image)
                packed_frac = frac(data)
                self.assertGreaterEqual(unpacked_frac, 0.9, f"{profile_id}: unpacked fraction too low")
                self.assertGreater(
                    unpacked_frac,
                    packed_frac,
                    f"{profile_id}: unpacked ({unpacked_frac}) did not beat the packed-file null ({packed_frac})",
                )


def _is_borland_prologue(buf: bytes, off: int) -> bool:
    if off < 0 or off + 3 > len(buf):
        return False
    return buf[off : off + 3] in (b"\x55\x89\xe5", b"\x55\x8b\xec")


def _unresolved_lcall_pairs(loader_path: Path) -> set[tuple[int, int]]:
    """Every `(original_segment, call_target_offset)` `lcall` pair `vroomm_layout` itself
    classifies `unresolved_relocated_segment` for this title's own loader/overlay pair --
    genuinely resident code neither the descriptor-bounded OVR walk nor the public-stub-array
    geometry can resolve. Same import-and-call sequence `map_buck_ecl_dispatch.
    script_bytes_consumed_verdicts` uses internally."""
    import gen1_map
    import vroomm_layout

    overlay_path = loader_path.parent / "GAME.OVR"
    loader = loader_path.read_bytes()
    overlay = overlay_path.read_bytes()
    descriptors = gen1_map.scan_descriptors(loader, overlay)
    layouts = vroomm_layout.descriptor_layouts(loader, overlay, descriptors)
    mz = gen1_map.parse_mz(loader)
    vroomm_layout.classify_lcall_routes(loader, overlay, mz, layouts)
    pairs: set[tuple[int, int]] = set()
    for row in layouts:
        for entry in row.fixup_entries:
            if entry.context == "lcall_segment" and entry.route_kind == "unresolved_relocated_segment":
                pairs.add((entry.original_segment, entry.call_target_offset))
    return pairs


@unittest.skipIf(LOADERS is None, "Gen1 retail installs not found (D:\\ / GOG Galaxy sources absent)")
class BorlandPrologueChecks(unittest.TestCase):
    """Checks (b) and (c) from `docs/engine/PLAN-ROUND-32.md` R5: do the targets that stayed
    `unresolved_relocated_segment` under `vroomm_layout.py`'s own OVR-space geometry land on a
    Borland function-start prologue when mapped into the EXEPACK-unpacked resident image, at
    shift 0 -- and NOT at a byte-alignment-coincidence shift of +-1 (the null)?"""

    def test_buck_16_unresolved_pairs_beat_the_shift_null(self) -> None:
        buck_path = LOADERS["buck-rogers-countdown-to-doomsday"]
        pairs = _unresolved_lcall_pairs(buck_path)
        # Pin the plan's own "16 unresolved Buck segments" as a distinct-SEGMENT count -- the
        # same 16 `docs/engine/research/buck-ecl-dispatch-map.md` already names (0x13e, 0x14b,
        # 0x157, 0x15c, 0x15f, 0x1b0, 0x267, 0x653, 0x7da, 0x800, 0x8ad, 0xa7b, 0xa93, 0xb00,
        # 0xb62, 0xbe4) -- while the walk below checks every distinct (seg, off) CALL TARGET
        # pair on those segments, a finer-grained and stricter check.
        self.assertEqual(len({seg for seg, _off in pairs}), 16)

        image, _ = subject.unpack(buck_path)
        hits0 = sum(1 for seg, off in pairs if _is_borland_prologue(image, seg * 16 + off))
        hits_plus1 = sum(1 for seg, off in pairs if _is_borland_prologue(image, seg * 16 + off + 1))
        hits_minus1 = sum(1 for seg, off in pairs if _is_borland_prologue(image, seg * 16 + off - 1))
        # Measured 2026-09-03: 98/175 at shift 0, 0/175 at each of +-1 -- below the plan's own
        # >=14/16 prediction if read as a per-SEGMENT bar (see the report for that honest gap),
        # but the ±1 null is exactly as clean as predicted (<=2), which is the part of the check
        # that rules out byte-alignment coincidence.
        self.assertGreaterEqual(hits0, 60)
        self.assertLessEqual(hits_plus1, 2)
        self.assertLessEqual(hits_minus1, 2)
        self.assertGreater(hits0, hits_plus1)
        self.assertGreater(hits0, hits_minus1)

    def test_coab_unresolved_pairs_reproduce_the_same_pattern(self) -> None:
        """Check (c): CoAB's own genuinely-resident targets (the complement of the 229/240
        `public_stub_owned` OVR-space calibration -- see `buck_far_targets.
        coab_stub_geometry_calibration`, which that calibration does not itself walk) resolving
        the SAME way once mapped into CoAB's own EXEPACK-unpacked resident image: a similar
        shift-0 hit rate, and the same clean shift ±1 null. CoAB has no independent loader-
        resident-function oracle (the 851-function oracle is OVR-unit-relative, not
        loader-relative), so this is the SAME Borland-prologue heuristic as Buck's own check, not
        a stronger ground truth -- reported as a consistency replication, not a new proof."""
        coab_path = LOADERS["curse-of-the-azure-bonds"]
        pairs = _unresolved_lcall_pairs(coab_path)
        self.assertEqual(len(pairs), 140)

        image, _ = subject.unpack(coab_path)
        hits0 = sum(1 for seg, off in pairs if _is_borland_prologue(image, seg * 16 + off))
        hits_plus1 = sum(1 for seg, off in pairs if _is_borland_prologue(image, seg * 16 + off + 1))
        hits_minus1 = sum(1 for seg, off in pairs if _is_borland_prologue(image, seg * 16 + off - 1))
        # Measured 2026-09-03: 66/140 at shift 0, 0/140 at each of +-1 -- a materially DIFFERENT
        # result from this same check run against CoAB's still-PACKED bytes (round 31: 0/140),
        # which is itself evidence the round-31 negative was an unpack-blind artifact, not a
        # property of CoAB's own resident code.
        self.assertGreaterEqual(hits0, 50)
        self.assertLessEqual(hits_plus1, 2)
        self.assertLessEqual(hits_minus1, 2)


if __name__ == "__main__":
    unittest.main()
