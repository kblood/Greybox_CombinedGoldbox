"""Synthetic controls for the pinned DOSBox-X INT 21h patcher."""
from __future__ import annotations

import hashlib
from io import BytesIO
from pathlib import Path
import tempfile
import unittest
from zipfile import ZipFile

from build_dosbox_int21_trace import (
    extract_pinned_archive,
    patch_dos_cpp,
    patch_dos_execute_cpp,
    replace_once,
    validate_cpu_profile_api,
    validate_xms_a20_getter,
)


FIXTURE = b'''#include <time.h>
static Bitu DOS_21Handler(void);
case 0x3c:      /* CREATE Create or truncate file */
            MEM_StrCopy(SegPhys(ds)+reg_dx,name1,DOSNAMEBUF);
            if (DOS_CreateFile(name1,reg_cx,&reg_ax)) {
            break;
        case 0x3d:      /* OPEN Open existing file */
        {
            unmask_irq0 |= disk_io_unmask_irq0;
            MEM_StrCopy(SegPhys(ds)+reg_dx,name1,DOSNAMEBUF);
        }
        case 0x3e:      /* CLOSE Close file */
        {
            if(ias_handle != 0
        }
        case 0x3f:      /* READ Read from file or device */
            unmask_irq0 |= disk_io_unmask_irq0;
            {
                if (fRead) {
                    reg_ax=toread;
                break;
            }
        case 0x40:                  /* WRITE Write to file or device */
            unmask_irq0 |= disk_io_unmask_irq0;
            {
                if (fWritten) {
                    reg_ax=towrite;
                break;
            }
        case 0x41:                  /* UNLINK Delete file */
        case 0x42:                  /* LSEEK Set current file position */
            {
                uint32_t pos=((uint32_t)reg_cx << 16u) + reg_dx;
                if (DOS_SeekFile(reg_bx,&pos,reg_al)) {
                    reg_dx=(uint16_t)((unsigned int)pos >> 16u);
                }
                break;
            }
        case 0x43:                  /* Get/Set file attributes */
'''


DOS_EXECUTE_FIXTURE = b'''#include "crc32.h"
bool DOS_Execute(const char* name, PhysPt block_pt, uint16_t flags) {
	if ((flags == LOAD) || (flags == LOADNGO)) {
		dos.psp(pspseg);
		{
			envmcb.SetPSPSeg(dos.psp());
		}
	}

#if defined(OSFREE)
	if (a20_off_if_loading_low) {
		XMS_EnableA20(false);
	}
#endif

	if (flags==LOAD) {
	}

	if (flags==LOADNGO) {
'''

XMS_A20_FIXTURE = b'''Bitu XMS_GetEnabledA20(void) {
    if (IS_PC98_ARCH) return (IO_Read(0xF2)&1) == 0;
    return (IO_Read(0x92)&2)>0;
}
'''

CPU_HEADER_FIXTURE = b'''extern unsigned char CPU_AutoDetermineMode;
extern unsigned char CPU_ArchitectureType;
extern CPU_Decoder * cpudecoder;
CPU_Core_Normal_Run CPU_Core_Normal_Trap_Run CPU_Core_Simple_Run CPU_Core_Simple_Trap_Run
CPU_Core_Full_Run CPU_Core_Prefetch_Run CPU_Core_Prefetch_Trap_Run
CPU_Core_Dyn_X86_Run CPU_Core_Dyn_X86_Trap_Run CPU_Core_Dynrec_Run
CPU_Core_Dynrec_Trap_Run
CPU_Core286_Normal_Run CPU_Core286_Normal_Trap_Run CPU_Core286_Prefetch_Run
CPU_Core8086_Normal_Run CPU_Core8086_Normal_Trap_Run CPU_Core8086_Prefetch_Run
'''


class PatcherTests(unittest.TestCase):
    @staticmethod
    def synthetic_archive(*members: tuple[str, bytes]) -> bytes:
        buffer = BytesIO()
        with ZipFile(buffer, "w") as archive:
            for name, content in members:
                archive.writestr(name, content)
        return buffer.getvalue()

    def test_unique_anchor_replacement_and_rejects_missing_or_duplicate(self) -> None:
        self.assertEqual(replace_once(b"alpha\n", b"alpha", b"beta", "fixture"), b"beta\n")
        with self.assertRaisesRegex(ValueError, "found 0"):
            replace_once(b"alpha", b"missing", b"x", "missing")
        with self.assertRaisesRegex(ValueError, "found 2"):
            replace_once(b"alpha alpha", b"alpha", b"x", "duplicate")

    def test_synthetic_dispatch_receives_only_targeted_instrumentation(self) -> None:
        patched = patch_dos_cpp(FIXTURE, verify_identity=False)
        self.assertIn(b"DOSBOX_X_INT21_TRACE_PATH", patched)
        self.assertIn(b"DosInt21TraceScope trace(0x3c)", patched)
        self.assertIn(b"DosInt21TraceScope trace(0x3d)", patched)
        self.assertIn(b"DosInt21TraceScope trace(0x3e)", patched)
        self.assertIn(b"DosInt21TraceScope trace(0x3f)", patched)
        self.assertIn(b"DosInt21TraceScope trace(0x40)", patched)
        self.assertIn(b"DosInt21TraceScope trace(0x42)", patched)
        self.assertIn(b"trace.SetActual(toread)", patched)
        self.assertIn(b"trace.SetActual(towrite)", patched)
        self.assertIn(b"trace.SetSeekResult(pos)", patched)
        write_line = patched.index(b"output << line << '\\n';")
        self.assertIn(b"output.flush();", patched[write_line:write_line + 160])
        self.assertIn(b"records >= 32768u", patched)
        self.assertIn(b"16u * 1024u * 1024u", patched)
        self.assertIn(b"static DosInt21TraceGuestFrame DosInt21TraceReadGuestFrame()", patched)
        self.assertIn(b"frame.ip = real_readw(SegValue(ss), reg_sp)", patched)
        self.assertIn(b"frame.cs = real_readw(SegValue(ss), reg_sp + 2)", patched)
        self.assertIn(b"frame.flags = real_readw(SegValue(ss), reg_sp + 4)", patched)
        self.assertIn(b"frame.ip = mem_readw(stack + reg_sp)", patched)
        self.assertIn(b"frame.cs = mem_readw(stack + reg_sp + 2)", patched)
        self.assertIn(b"frame.flags = mem_readw(stack + reg_sp + 4)", patched)
        self.assertIn(b"const DosInt21TraceGuestFrame postFrame = DosInt21TraceReadGuestFrame();", patched)
        self.assertIn(b"postFrame.flags & FLAG_CF", patched)
        self.assertIn(b"handler_flags", patched)
        self.assertIn(b"callback_context", patched)
        self.assertIn(b"guest_callsite", patched)
        self.assertIn(b"static std::string DosInt21TraceJson(const std::string &value)", patched)
        self.assertIn(b"c < 0x20 || c >= 0x80", patched)
        self.assertIn(b"static std::string DosInt21TraceHexBytes(const std::string &value)", patched)
        self.assertIn(b'\\\"path_bytes_hex\\\":', patched)
        self.assertIn(b"DosInt21TraceJson(DosInt21TraceHexBytes(path))", patched)
        self.assertIn(b"Real2Phys(RealMake(guestFrame.cs, callerIp))", patched)
        self.assertIn(b"opcodeRelation = \"unsupported-protected-mode\"", patched)
        self.assertIn(b"currentPsp = dos.psp()", patched)
        self.assertIn(b"derivedLoadSegment = (uint16_t)(currentPsp + 0x10u)", patched)
        self.assertIn(b"extern Bitu XMS_GetEnabledA20(void);", patched)
        self.assertIn(b"const Bitu a20Enabled = XMS_GetEnabledA20();", patched)
        self.assertIn(b"DosInt21TraceCpuProfile()", patched)
        self.assertIn(b"if (decoder == CPU_Core_Dynrec_Run) return \"CPU_Core_Dynrec_Run\";", patched)
        self.assertIn(b"if (decoder == CPU_Core_Prefetch_Run) return \"CPU_Core_Prefetch_Run\";", patched)
        self.assertIn(b"if (decoder == CPU_Core286_Prefetch_Run) return \"CPU_Core286_Prefetch_Run\";", patched)
        self.assertIn(b"if (decoder == CPU_Core8086_Prefetch_Run) return \"CPU_Core8086_Prefetch_Run\";", patched)
        self.assertIn(b"return \"unknown\";", patched)
        self.assertIn(b"configuredCpu = cpuSection ? cpuSection->Get_string(\"cputype\") : \"unavailable\"", patched)
        self.assertIn(b"configuredCore = cpuSection ? cpuSection->Get_string(\"core\") : \"unavailable\"", patched)
        self.assertIn(b"case 0xfe: return \"MIXED\";", patched)
        self.assertIn(b"#if (C_DYNAMIC_X86)", patched)
        self.assertIn(b"#if (C_DYNREC)", patched)
        self.assertIn(b"DosInt21TraceArchitectureIsConcrete(CPU_ArchitectureType)", patched)
        self.assertIn(b"default: return false;", patched)
        self.assertIn(b"if (!Active() || startMcbSnapshotCaptured || !IsStartExe(program)) return;", patched)
        self.assertIn(b"mcbSnapshotPending = true;\n        startMcbSnapshotCaptured = true;", patched)
        self.assertIn(b"bool startMcbSnapshotCaptured = false;", patched)
        self.assertIn(b"bool fallbackMcbSnapshotCaptured = false;", patched)
        self.assertIn(b'const char expected[] = "START.EXE";', patched)
        self.assertIn(b"if (*p == '/' || *p == '\\\\') base = p + 1;", patched)
        self.assertIn(b"if (c >= 'a' && c <= 'z') c = (char)(c - 'a' + 'A');", patched)
        self.assertIn(b'dos_execute_after_a20_before_loadngo", "DOS_Execute"', patched)
        self.assertIn(b'first_int21_file_call_fallback", "DosInt21TraceScope"', patched)
        self.assertIn(br'\"capture_stage\":\"', patched)
        self.assertIn(br'\"focus_range_covered\":', patched)
        self.assertIn(br'\"focus_range_has_mcb_header\":', patched)
        self.assertIn(br'\"focus_range_fully_in_data\":', patched)
        self.assertIn(br'\"mcb_chain_snapshot\":', patched)
        self.assertIn(b"DosInt21TraceCodeWindowHex(uint16_t cs, uint16_t returnIp)", patched)
        self.assertIn(b"for (unsigned i = 0; i < 16u; ++i)", patched)
        self.assertIn(b"code_window", patched)
        self.assertIn(b'"unsupported-protected-mode"', patched)
        self.assertIn(b'"real-vm"', patched)
        self.assertIn(b'\\"byte_count\\":16', patched)
        self.assertIn(b"bytes_hex", patched)
        self.assertIn(b"Real2Phys(RealMake(cs, offset))", patched)
        self.assertEqual(patched.count(b"DosInt21TraceScope trace(0x"), 6)
        self.assertEqual(patched.count(b"case 0x41:"), 1)

    def test_synthetic_patch_contains_complete_mcb_snapshot_schema_and_statuses(self) -> None:
        patched = patch_dos_cpp(FIXTURE, verify_identity=False)

        # These are static source assertions over the synthetic patcher output. They
        # pin the emitted schema spelling and labels, not parsed JSON/runtime behavior.
        snapshot_keys = (
            br'\"schema_version\":4',
            br'\"capture_stage\":\"',
            br'\"capture_source\":\"',
            br'\"current_psp\":\"',
            br'\"a20_enabled\":',
            br'\"cpu_profile\":',
            br'\"configured\":{\"cputype\":',
            br'\"active\":{\"architecture_type\":',
            br'\"architecture_is_concrete\":',
            br'\"auto_determine_mode\":',
            br'\"decoder\":\"',
            br'\"dos_execute_load_segment\":',
            br'\"first_mcb\":\"',
            br'\"first_mcb_source\":\"',
            br'\"focus_range\":{\"start\":\"',
            br'\"end_exclusive\":\"',
            br'\"blocks\":[',
            br'\"mcb_segment\":\"',
            br'\"type\":\"',
            br'\"owner_psp\":\"',
            br'\"owner_kind\":\"',
            br'\"header_start\":\"',
            br'\"header_end_exclusive\":\"',
            br'\"data_start\":\"',
            br'\"data_end_exclusive\":\"',
            br'\"block_end_exclusive\":\"',
            br'\"status\":\"',
            br'\"focus_range_covered\":',
            br'\"focus_range_has_mcb_header\":',
            br'\"focus_range_fully_in_data\":',
        )
        for key in snapshot_keys:
            with self.subTest(key=key):
                self.assertIn(key, patched)

        stable_values = (
            b'"free"',
            b'"dos_system"',
            b'"psp"',
            b'"guest_msdos_mcb_chain"',
            b'"DOS_InfoBlock::GetFirstMCB"',
            b'"dos_execute_after_a20_before_loadngo"',
            b'"DOS_Execute"',
            b'"first_int21_file_call_fallback"',
            b'"DosInt21TraceScope"',
        )
        for value in stable_values:
            with self.subTest(value=value):
                self.assertIn(value, patched)

        statuses = (
            b'"block_limit"',
            b'"missing_first_mcb"',
            b'"guest_mcb_unavailable"',
            b'"range_precedes_first_mcb"',
            b'"segment_overflow"',
            b'"header_outside_20bit_space"',
            b'"invalid_mcb_type"',
            b'"block_exceeds_20bit_space"',
            b'"focus_range_covered"',
            b'"chain_ended_before_focus_range"',
            b'"next_segment_overflow"',
        )
        for status in statuses:
            with self.subTest(status=status):
                self.assertIn(status, patched)

        self.assertIn(b"const unsigned blockLimit = 128u;", patched)
        self.assertIn(b"XMS_GetEnabledA20", patched)
        self.assertIn(b'DosInt21TraceMcbSnapshot(psp, true, loadSegment, "dos_execute_after_a20_before_loadngo", "DOS_Execute")', patched)
        self.assertIn(b'DosInt21TraceMcbSnapshot(psp, false, 0, "first_int21_file_call_fallback", "DosInt21TraceScope")', patched)
        self.assertIn(b"if (hasLoadSegment) out << \"\\\"\" << DosInt21TraceHex(loadSegment, 4) << \"\\\"\";", patched)
        self.assertIn(b'else out << "null";', patched)
        self.assertIn(b"const uint32_t rangeStart = 0x07fa6u;", patched)
        self.assertIn(b"const uint32_t rangeEnd = 0x08140u;", patched)
        self.assertIn(b"covered ? (focusHasMcbHeader ? \"true\" : \"false\") : \"null\"", patched)
        self.assertIn(b"covered && !focusHasMcbHeader ? \"true\" : \"false\"", patched)

    def test_synthetic_patch_refuses_missing_required_case_anchor(self) -> None:
        with self.assertRaisesRegex(ValueError, "0x42"):
            patch_dos_cpp(FIXTURE.replace(b"case 0x42:", b"case 0x4a:"), verify_identity=False)

    def test_dos_execute_hook_follows_psp_and_environment_owner_setup(self) -> None:
        patched = patch_dos_execute_cpp(DOS_EXECUTE_FIXTURE, verify_identity=False)
        program_capture = patched.index(b"const char *traceProgramName = name;")
        psp_switch = patched.index(b"dos.psp(pspseg);")
        environment_owner_update = patched.index(b"envmcb.SetPSPSeg(dos.psp());")
        a20_adjustment = patched.index(b"XMS_EnableA20(false);")
        mcb_capture = patched.index(b"DOSBOX_X_INT21_TRACE_CAPTURE_START_MCB(pspseg, loadseg, traceProgramName);")
        self.assertIn(b"extern void DOSBOX_X_INT21_TRACE_CAPTURE_START_MCB(uint16_t psp, uint16_t loadSegment, const char *program);", patched)
        loadngo_setup = patched.index(b"if (flags==LOADNGO)")
        self.assertLess(program_capture, mcb_capture)
        self.assertLess(psp_switch, environment_owner_update)
        self.assertLess(environment_owner_update, mcb_capture)
        self.assertLess(a20_adjustment, mcb_capture)
        self.assertLess(mcb_capture, loadngo_setup)
        self.assertEqual(patched.count(b"if (flags == LOADNGO)"), 1)

    def test_snapshot_is_consumed_once_even_when_row_write_drops_it(self) -> None:
        patched = patch_dos_cpp(FIXTURE, verify_identity=False)
        take_method = patched[patched.index(b"std::string TakeMcbSnapshot()"):
                              patched.index(b"private:\n    static bool IsStartExe")]
        row_scope = patched[patched.index(b"~DosInt21TraceScope()"):
                            patched.index(b"void SetPath(", patched.index(b"~DosInt21TraceScope()"))]
        self.assertIn(b"if (!mcbSnapshotPending) return std::string();", take_method)
        self.assertLess(take_method.index(b"mcbSnapshotPending = false;"),
                        take_method.index(b"mcbSnapshot.clear();"))
        take = row_scope.index(b"dosInt21TraceState.TakeMcbSnapshot()")
        write = row_scope.index(b"dosInt21TraceState.Write(out.str())")
        self.assertLess(take, write)
        self.assertIn(b"output << line << '\\n';", patched)

    def test_start_capture_can_rearm_after_fallback_was_consumed(self) -> None:
        patched = patch_dos_cpp(FIXTURE, verify_identity=False)
        start_method = patched[patched.index(b"void CaptureStartMcb("):
                               patched.index(b"void EnsureMcbSnapshot(")]
        fallback_method = patched[patched.index(b"void EnsureMcbSnapshot("):
                                  patched.index(b"std::string TakeMcbSnapshot()")]
        self.assertIn(b"if (!Active() || startMcbSnapshotCaptured || !IsStartExe(program)) return;", start_method)
        self.assertNotIn(b"fallbackMcbSnapshotCaptured", start_method)
        self.assertIn(b"mcbSnapshotPending = true;", start_method)
        self.assertIn(b"if (!Active() || mcbSnapshotPending || fallbackMcbSnapshotCaptured || startMcbSnapshotCaptured) return;", fallback_method)
        self.assertIn(b'"first_int21_file_call_fallback"', fallback_method)
        self.assertIn(b"fallbackMcbSnapshotCaptured = true;", fallback_method)

    def test_snapshot_field_is_not_repeated_on_later_rows(self) -> None:
        patched = patch_dos_cpp(FIXTURE, verify_identity=False)
        row_scope = patched[patched.index(b"~DosInt21TraceScope()"):
                            patched.index(b"void SetPath(", patched.index(b"~DosInt21TraceScope()"))]
        self.assertEqual(row_scope.count(b'"mcb_chain_snapshot"'), 1)
        self.assertIn(b"const std::string mcbSnapshot = dosInt21TraceState.TakeMcbSnapshot();", row_scope)
        self.assertIn(b"if (!mcbSnapshot.empty())", row_scope)
        self.assertNotIn(b"dosInt21TraceState.McbSnapshot()", row_scope)

    def test_fallback_remains_when_start_capture_never_matches(self) -> None:
        patched = patch_dos_cpp(FIXTURE, verify_identity=False)
        start_method = patched[patched.index(b"void CaptureStartMcb("):patched.index(b"void EnsureMcbSnapshot(")]
        fallback_method = patched[patched.index(b"void EnsureMcbSnapshot("):patched.index(b"std::string TakeMcbSnapshot()")]
        self.assertIn(b'"dos_execute_after_a20_before_loadngo"', start_method)
        self.assertIn(b"!IsStartExe(program)", start_method)
        self.assertNotIn(b'"first_int21_file_call_fallback"', start_method)
        self.assertIn(b'"first_int21_file_call_fallback"', fallback_method)
        self.assertIn(b"if (!Active() || mcbSnapshotPending || fallbackMcbSnapshotCaptured || startMcbSnapshotCaptured) return;", fallback_method)

    def test_dos_execute_hook_refuses_missing_exact_insertion_anchor(self) -> None:
        altered = DOS_EXECUTE_FIXTURE.replace(b"#endif\n\n\tif (flags==LOAD) {", b"#endif\n\n\tif (flags==BROKEN) {", 1)
        with self.assertRaisesRegex(ValueError, "post-A20 pre-LOADNGO"):
            patch_dos_execute_cpp(altered, verify_identity=False)

    def test_xms_a20_getter_requires_both_architecture_port_reads(self) -> None:
        validate_xms_a20_getter(XMS_A20_FIXTURE)
        with self.assertRaisesRegex(ValueError, "architecture-specific port read"):
            validate_xms_a20_getter(XMS_A20_FIXTURE.replace(b"IO_Read(0xF2)", b"IO_Read(0xF3)"))

    def test_cpu_profile_api_requires_known_state_and_decoder_declarations(self) -> None:
        validate_cpu_profile_api(CPU_HEADER_FIXTURE)
        with self.assertRaisesRegex(ValueError, "decoder declaration"):
            validate_cpu_profile_api(CPU_HEADER_FIXTURE.replace(b"CPU_Core_Dynrec_Run", b"CPU_Core_Unknown_Run"))

    def test_exact_archive_extraction_is_rooted_and_digest_checked(self) -> None:
        package = self.synthetic_archive(("fixture/src.cpp", b"synthetic"))
        with tempfile.TemporaryDirectory() as temp:
            root = extract_pinned_archive(package, Path(temp),
                                          expected_sha=hashlib.sha256(package).hexdigest(),
                                          expected_root="fixture")
            self.assertEqual((root / "src.cpp").read_bytes(), b"synthetic")
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaisesRegex(ValueError, "archive hash"):
                extract_pinned_archive(package, Path(temp), expected_sha="0" * 64,
                                       expected_root="fixture")

    def test_archive_member_cannot_escape_or_leave_expected_root(self) -> None:
        package = self.synthetic_archive(("fixture/../escape", b"synthetic"))
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaisesRegex(ValueError, "escapes|outside"):
                extract_pinned_archive(package, Path(temp), expected_sha=hashlib.sha256(package).hexdigest(),
                                       expected_root="fixture")

    def test_game_link_settle_is_optional_bounded_and_after_ready_frame(self) -> None:
        probe = Path(__file__).with_name("dosbox_x_debugbox_probe.ps1").read_text(encoding="utf-8")
        self.assertIn("[ValidateRange(0,15000)][int]$ReadySettleMs = 0", probe)
        ready = probe.index("if (-not $gamelinkStatus)")
        settle = probe.index("if ($ReadySettleMs -gt 0)", ready)
        sleep = probe.index("Start-Sleep -Milliseconds $ReadySettleMs", settle)
        capture = probe.index("$saved = @()", sleep)
        self.assertLess(ready, settle)
        self.assertLess(settle, sleep)
        self.assertLess(sleep, capture)


if __name__ == "__main__":
    unittest.main()
