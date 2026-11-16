"""Build an isolated DOSBox-X candidate with opt-in INT 21h file-call tracing.

The source is copied before patching. The pinned local DOSBox-X GameLink source
sentinel and exact DOS dispatcher/execute source hashes are checked before patching.
The trace is disabled unless DOSBOX_X_INT21_TRACE_PATH is set in the emulator
process environment. This helper builds only; it never launches DOSBox.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
from pathlib import Path
import shutil
import subprocess
import zipfile

from build_dosbox_gamelink import (
    ARCHIVE_SHA as PINNED_ARCHIVE_SHA,
    PATCHED_SHA as GAMELINK_PATCHED_SHA,
    SOURCE_SHA as GAMELINK_SOURCE_SHA,
    patch_source as patch_gamelink_source,
)

TAG = "dosbox-x-v2026.07.02"
ARCHIVE_ROOT = f"dosbox-x-{TAG}"
SOURCE_SENTINEL = Path("src/output/output_gamelink.cpp")
DOS_CPP = Path("src/dos/dos.cpp")
DOS_EXECUTE_CPP = Path("src/dos/dos_execute.cpp")
XMS_CPP = Path("src/ints/xms.cpp")
CPU_HEADER = Path("include/cpu.h")
DOS_HEADER = Path("include/dos_system.h")
DOS_CPP_SHA256 = "ef571bd87019bedd0d0ae2e6f6f77b4ede2e5eccdca112c1c6603da645e78c53"
DOS_EXECUTE_CPP_SHA256 = "05594c4086646f3fb13f18397910a99a9810123ed72b25ba3fc41c0dd78bbaad"
DOS_HEADER_SHA256 = "9a1fc569c71012c268c161ae7db71ecae4550365583d6818aa00049753369fc1"

TRACE_HELPERS = r'''#include <cstdlib>
#include <fstream>
#include <iomanip>
#include <sstream>
#include <string>

extern Bitu XMS_GetEnabledA20(void);
static std::string DosInt21TraceJson(const std::string &value);

static const char *DosInt21TraceDecoderName(CPU_Decoder *decoder) {
    if (decoder == CPU_Core_Normal_Run) return "CPU_Core_Normal_Run";
    if (decoder == CPU_Core_Normal_Trap_Run) return "CPU_Core_Normal_Trap_Run";
    if (decoder == CPU_Core_Simple_Run) return "CPU_Core_Simple_Run";
    if (decoder == CPU_Core_Simple_Trap_Run) return "CPU_Core_Simple_Trap_Run";
    if (decoder == CPU_Core_Full_Run) return "CPU_Core_Full_Run";
    if (decoder == CPU_Core_Prefetch_Run) return "CPU_Core_Prefetch_Run";
    if (decoder == CPU_Core_Prefetch_Trap_Run) return "CPU_Core_Prefetch_Trap_Run";
#if (C_DYNAMIC_X86)
    if (decoder == CPU_Core_Dyn_X86_Run) return "CPU_Core_Dyn_X86_Run";
    if (decoder == CPU_Core_Dyn_X86_Trap_Run) return "CPU_Core_Dyn_X86_Trap_Run";
#endif
#if (C_DYNREC)
    if (decoder == CPU_Core_Dynrec_Run) return "CPU_Core_Dynrec_Run";
    if (decoder == CPU_Core_Dynrec_Trap_Run) return "CPU_Core_Dynrec_Trap_Run";
#endif
    if (decoder == CPU_Core286_Normal_Run) return "CPU_Core286_Normal_Run";
    if (decoder == CPU_Core286_Normal_Trap_Run) return "CPU_Core286_Normal_Trap_Run";
    if (decoder == CPU_Core286_Prefetch_Run) return "CPU_Core286_Prefetch_Run";
    if (decoder == CPU_Core8086_Normal_Run) return "CPU_Core8086_Normal_Run";
    if (decoder == CPU_Core8086_Normal_Trap_Run) return "CPU_Core8086_Normal_Trap_Run";
    if (decoder == CPU_Core8086_Prefetch_Run) return "CPU_Core8086_Prefetch_Run";
    return "unknown";
}

static const char *DosInt21TraceArchitectureName(unsigned char architecture) {
    switch (architecture) {
    case 0x05: return "8086";
    case 0x15: return "80186";
    case 0x25: return "286";
    case 0x35: return "386";
    case 0x40: return "486OLD";
    case 0x45: return "486NEW";
    case 0x50: return "PENTIUM";
    case 0x55: return "PMMXSLOW";
    case 0x60: return "PPROSLOW";
    case 0x65: return "PENTIUMII";
    case 0x6a: return "PENTIUMIII";
    case 0xfe: return "MIXED";
    case 0xff: return "EXPERIMENTAL";
    default: return "unknown";
    }
}

static bool DosInt21TraceArchitectureIsConcrete(unsigned char architecture) {
    switch (architecture) {
    case 0x05: case 0x15: case 0x25: case 0x35: case 0x40: case 0x45:
    case 0x50: case 0x55: case 0x60: case 0x65: case 0x6a:
        return true;
    default:
        return false;
    }
}

static std::string DosInt21TraceCpuProfile() {
    const Section_prop *cpuSection = static_cast<Section_prop *>(control->GetSection("cpu"));
    const std::string configuredCpu = cpuSection ? cpuSection->Get_string("cputype") : "unavailable";
    const std::string configuredCore = cpuSection ? cpuSection->Get_string("core") : "unavailable";
    std::ostringstream out;
    out << "{\"configured\":{\"cputype\":" << DosInt21TraceJson(configuredCpu)
        << ",\"core\":" << DosInt21TraceJson(configuredCore)
        << "},\"active\":{\"architecture_type\":" << (unsigned)CPU_ArchitectureType
        << ",\"architecture_name\":\"" << DosInt21TraceArchitectureName(CPU_ArchitectureType)
        << "\",\"architecture_is_concrete\":"
        << (DosInt21TraceArchitectureIsConcrete(CPU_ArchitectureType) ? "true" : "false")
        << ",\"auto_determine_mode\":" << (unsigned)CPU_AutoDetermineMode
        << ",\"decoder\":\"" << DosInt21TraceDecoderName(cpudecoder) << "\"}}";
    return out.str();
}

static std::string DosInt21TraceJson(const std::string &value) {
    std::ostringstream out;
    out << '"';
    for (const unsigned char c : value) {
        if (c == '"' || c == '\\') out << '\\' << (char)c;
        else if (c < 0x20 || c >= 0x80)
            out << "\\u00" << std::hex << std::setw(2) << std::setfill('0') << (unsigned)c << std::dec;
        else out << (char)c;
    }
    out << '"';
    return out.str();
}

static std::string DosInt21TraceHexBytes(const std::string &value) {
    std::ostringstream out;
    out << std::uppercase << std::hex << std::setfill('0');
    for (const unsigned char c : value) out << std::setw(2) << (unsigned)c;
    return out.str();
}

static std::string DosInt21TraceHex(uint32_t value, unsigned width) {
    std::ostringstream out;
    out << std::uppercase << std::hex << std::setw(width) << std::setfill('0') << value;
    return out.str();
}

struct DosInt21TraceGuestFrame {
    uint32_t ip = 0;
    uint16_t cs = 0;
    uint32_t flags = 0;
};

static std::string DosInt21TraceCodeWindowHex(uint16_t cs, uint16_t returnIp) {
    std::ostringstream out;
    const uint16_t startIp = (uint16_t)(returnIp - 8u);
    for (unsigned i = 0; i < 16u; ++i) {
        const uint16_t offset = (uint16_t)(startIp + i);
        const uint8_t byte = mem_readb(Real2Phys(RealMake(cs, offset)));
        out << std::uppercase << std::hex << std::setw(2) << std::setfill('0') << (unsigned)byte;
    }
    return out.str();
}

static std::string DosInt21TraceMcbSnapshot(uint16_t currentPsp,
                                             bool hasLoadSegment,
                                             uint16_t loadSegment,
                                             const char *captureStage,
                                             const char *captureSource) {
    const Bitu a20Enabled = XMS_GetEnabledA20();
    const std::string cpuProfile = DosInt21TraceCpuProfile();
    const uint32_t rangeStart = 0x07fa6u;
    const uint32_t rangeEnd = 0x08140u;
    const unsigned blockLimit = 128u;
    const uint16_t firstMcb = dos_kernel_disabled ? guest_msdos_mcb_chain : dos_infoblock.GetFirstMCB();
    std::ostringstream out;
    out << "{\"schema_version\":4,\"capture_stage\":\"" << captureStage
        << "\",\"capture_source\":\"" << captureSource
        << "\",\"current_psp\":\"" << DosInt21TraceHex(currentPsp, 4)
        << "\",\"a20_enabled\":" << (a20Enabled ? "true" : "false")
        << ",\"cpu_profile\":" << cpuProfile
        << ",\"dos_execute_load_segment\":";
    if (hasLoadSegment) out << "\"" << DosInt21TraceHex(loadSegment, 4) << "\"";
    else out << "null";
    out << ",\"first_mcb\":\"" << DosInt21TraceHex(firstMcb, 4)
        << "\",\"first_mcb_source\":\"" << (dos_kernel_disabled ? "guest_msdos_mcb_chain" : "DOS_InfoBlock::GetFirstMCB")
        << "\",\"focus_range\":{\"start\":\"" << DosInt21TraceHex(rangeStart, 6)
        << "\",\"end_exclusive\":\"" << DosInt21TraceHex(rangeEnd, 6)
        << "\"},\"blocks\":[";

    const char *status = "block_limit";
    bool first = true;
    bool covered = false;
    bool focusHasMcbHeader = false;
    uint32_t segment = firstMcb;
    if (firstMcb == 0) {
        status = "missing_first_mcb";
    } else if (dos_kernel_disabled && firstMcb == 0xffffu) {
        // DOSBox-X initializes the guest MCB pointer to FFFF until it discovers
        // the booted DOS List of Lists. Do not misreport that sentinel as a real
        // chain that happens to begin above the focus interval.
        status = "guest_mcb_unavailable";
    } else if (segment * 16u > rangeStart) {
        status = "range_precedes_first_mcb";
    } else {
        for (unsigned count = 0; count < blockLimit; ++count) {
            if (segment > 0xffffu) {
                status = "segment_overflow";
                break;
            }
            const uint32_t headerStart = segment * 16u;
            if (headerStart > 0xffff0u) {
                status = "header_outside_20bit_space";
                break;
            }
            DOS_MCB mcb((uint16_t)segment);
            const uint8_t type = mcb.GetType();
            if (type != 'M' && type != 'Z') {
                status = "invalid_mcb_type";
                break;
            }
            const uint16_t size = mcb.GetSize();
            const uint16_t owner = mcb.GetPSPSeg();
            const uint32_t headerEnd = headerStart + 16u;
            const uint32_t dataEnd = (segment + 1u + (uint32_t)size) * 16u;
            if (headerStart < rangeEnd && headerEnd > rangeStart)
                focusHasMcbHeader = true;
            const char *ownerKind = owner == MCB_FREE ? "free" : owner == MCB_DOS ? "dos_system" : "psp";
            if (!first) out << ',';
            first = false;
            out << "{\"mcb_segment\":\"" << DosInt21TraceHex(segment, 4)
                << "\",\"type\":\"" << (char)type
                << "\",\"owner_psp\":\"" << DosInt21TraceHex(owner, 4)
                << "\",\"owner_kind\":\"" << ownerKind
                << "\",\"header_start\":\"" << DosInt21TraceHex(headerStart, 6)
                << "\",\"header_end_exclusive\":\"" << DosInt21TraceHex(headerEnd, 6)
                << "\",\"data_start\":\"" << DosInt21TraceHex(headerEnd, 6)
                << "\",\"data_end_exclusive\":\"" << DosInt21TraceHex(dataEnd, 6)
                << "\",\"block_end_exclusive\":\"" << DosInt21TraceHex(dataEnd, 6) << "\"}";

            if (dataEnd > 0x100000u) {
                status = "block_exceeds_20bit_space";
                break;
            }
            if (dataEnd >= rangeEnd) {
                covered = true;
                status = "focus_range_covered";
                break;
            }
            if (type == 'Z') {
                status = "chain_ended_before_focus_range";
                break;
            }
            const uint32_t next = segment + 1u + (uint32_t)size;
            if (next <= segment || next > 0xffffu) {
                status = "next_segment_overflow";
                break;
            }
            segment = next;
        }
    }
    out << "],\"status\":\"" << status << "\",\"focus_range_covered\":"
        << (covered ? "true" : "false")
        << ",\"focus_range_has_mcb_header\":"
        << (covered ? (focusHasMcbHeader ? "true" : "false") : "null")
        << ",\"focus_range_fully_in_data\":"
        << (covered && !focusHasMcbHeader ? "true" : "false") << '}';
    return out.str();
}

static DosInt21TraceGuestFrame DosInt21TraceReadGuestFrame() {
    DosInt21TraceGuestFrame frame;
    if (cpu.pmode && !(reg_flags & FLAG_VM)) {
        const PhysPt stack = SegPhys(ss);
        if (cpu.stack.big) {
            frame.ip = mem_readd(stack + reg_esp);
            frame.cs = (uint16_t)mem_readd(stack + reg_esp + 4);
            frame.flags = mem_readd(stack + reg_esp + 8);
        } else {
            frame.ip = mem_readw(stack + reg_sp);
            frame.cs = mem_readw(stack + reg_sp + 2);
            frame.flags = mem_readw(stack + reg_sp + 4);
        }
    } else if (cpu.stack.big) {
        frame.ip = real_readd(SegValue(ss), reg_esp);
        frame.cs = (uint16_t)real_readd(SegValue(ss), reg_esp + 4);
        frame.flags = real_readd(SegValue(ss), reg_esp + 8);
    } else {
        frame.ip = real_readw(SegValue(ss), reg_sp);
        frame.cs = real_readw(SegValue(ss), reg_sp + 2);
        frame.flags = real_readw(SegValue(ss), reg_sp + 4);
    }
    return frame;
}

class DosInt21TraceState {
public:
    bool Active() {
        if (initialized) return output.is_open();
        initialized = true;
        const char *path = std::getenv("DOSBOX_X_INT21_TRACE_PATH");
        if (!path || !*path) return false;
        output.open(path, std::ios::out | std::ios::binary | std::ios::trunc);
        return output.is_open();
    }

    void Write(const std::string &line) {
        if (!Active()) return;
        const size_t limit = 16u * 1024u * 1024u;
        const size_t summaryReserve = 128u;
        const size_t bytes = line.size() + 1u;
        const uint32_t sequence = total++;
        if (records >= 32768u || bytes > limit - summaryReserve ||
            writtenBytes > limit - summaryReserve - bytes) {
            dropped++;
            return;
        }
        output << line << '\n';
        writtenBytes += bytes;
        records++;
        output.flush();
        (void)sequence;
    }

    ~DosInt21TraceState() {
        if (!output.is_open()) return;
        output << "{\"type\":\"summary\",\"total\":" << total
               << ",\"records\":" << records << ",\"dropped\":" << dropped << "}\n";
        output.flush();
    }

    uint32_t NextSequence() { return total; }
    void CaptureStartMcb(uint16_t psp, uint16_t loadSegment, const char *program) {
        if (!Active() || startMcbSnapshotCaptured || !IsStartExe(program)) return;
        mcbSnapshot = DosInt21TraceMcbSnapshot(psp, true, loadSegment, "dos_execute_after_a20_before_loadngo", "DOS_Execute");
        mcbSnapshotPending = true;
        startMcbSnapshotCaptured = true;
    }

    void EnsureMcbSnapshot(uint16_t psp) {
        if (!Active() || mcbSnapshotPending || fallbackMcbSnapshotCaptured || startMcbSnapshotCaptured) return;
        mcbSnapshot = DosInt21TraceMcbSnapshot(psp, false, 0, "first_int21_file_call_fallback", "DosInt21TraceScope");
        mcbSnapshotPending = true;
        fallbackMcbSnapshotCaptured = true;
    }

    std::string TakeMcbSnapshot() {
        if (!mcbSnapshotPending) return std::string();
        mcbSnapshotPending = false;
        std::string snapshot = mcbSnapshot;
        mcbSnapshot.clear();
        return snapshot;
    }

private:
    static bool IsStartExe(const char *program) {
        if (!program || !*program) return false;
        const char *base = program;
        for (const char *p = program; *p; ++p)
            if (*p == '/' || *p == '\\') base = p + 1;
        const char expected[] = "START.EXE";
        size_t i = 0;
        for (; expected[i] && base[i]; ++i) {
            char c = base[i];
            if (c >= 'a' && c <= 'z') c = (char)(c - 'a' + 'A');
            if (c != expected[i]) return false;
        }
        return expected[i] == '\0' && base[i] == '\0';
    }

    std::string mcbSnapshot;
    std::ofstream output;
    size_t writtenBytes = 0;
    uint32_t total = 0;
    uint32_t records = 0;
    uint32_t dropped = 0;
    bool initialized = false;
    bool mcbSnapshotPending = false;
    bool fallbackMcbSnapshotCaptured = false;
    bool startMcbSnapshotCaptured = false;
};

static DosInt21TraceState dosInt21TraceState;

void DOSBOX_X_INT21_TRACE_CAPTURE_START_MCB(uint16_t psp, uint16_t loadSegment, const char *program) {
    dosInt21TraceState.CaptureStartMcb(psp, loadSegment, program);
}

class DosInt21TraceScope {
public:
    explicit DosInt21TraceScope(uint8_t function) : ah(function) {
        if (!dosInt21TraceState.Active()) return;
        enabled = true;
        al = reg_al;
        ax = reg_ax; bx = reg_bx; cx = reg_cx; dx = reg_dx;
        si = reg_si; di = reg_di; bp = reg_bp; sp = reg_sp;
        dsSegment = SegValue(ds); esSegment = SegValue(es); ssSegment = SegValue(ss);
        handlerFlags = reg_flags;
        callbackCs = SegValue(cs); callbackIp = reg_eip;
        guestFrame = DosInt21TraceReadGuestFrame();
        currentPsp = dos.psp();
        derivedLoadSegment = (uint16_t)(currentPsp + 0x10u);
        dosInt21TraceState.EnsureMcbSnapshot(currentPsp);
        const uint16_t callerIp = (uint16_t)guestFrame.ip;
        if (cpu.pmode && !(reg_flags & FLAG_VM)) {
            opcodeRelation = "unsupported-protected-mode";
            codeWindowSupported = false;
        } else {
            codeWindowStartIp = (uint16_t)(callerIp - 8u);
            codeWindowHex = DosInt21TraceCodeWindowHex(guestFrame.cs, callerIp);
            const PhysPt callerCode = Real2Phys(RealMake(guestFrame.cs, callerIp));
            if (callerIp >= 2 && mem_readb(callerCode - 2) == 0xcd && mem_readb(callerCode - 1) == 0x21) {
                opcodeRelation = "return-after-int";
                opcodeIp = (uint16_t)(callerIp - 2);
            } else if (mem_readb(callerCode) == 0xcd && mem_readb(callerCode + 1) == 0x21) {
                opcodeRelation = "at-int";
                opcodeIp = callerIp;
            }
        }
        if (ah != 0x3c && ah != 0x3d) {
            const uint8_t internal = RealHandle(bx);
            if (internal != 0xff && internal < DOS_FILES && Files[internal] && Files[internal]->GetName())
                path = Files[internal]->GetName();
        }
    }

    ~DosInt21TraceScope() {
        if (!enabled) return;
        const std::string mcbSnapshot = dosInt21TraceState.TakeMcbSnapshot();
        const DosInt21TraceGuestFrame postFrame = DosInt21TraceReadGuestFrame();
        std::ostringstream out;
        out << "{\"type\":\"int21_file\",\"seq\":" << dosInt21TraceState.NextSequence()
            << ",\"ah\":\"" << DosInt21TraceHex(ah, 2) << "\",\"al\":\"" << DosInt21TraceHex(al, 2)
            << "\",\"callback_context\":{\"cs\":\"" << DosInt21TraceHex(callbackCs, 4) << "\",\"ip\":\""
            << DosInt21TraceHex(callbackIp, 8) << "\"},\"guest_callsite\":{\"cs\":\""
            << DosInt21TraceHex(guestFrame.cs, 4) << "\",\"return_ip\":\"" << DosInt21TraceHex(guestFrame.ip, 8)
            << "\",\"opcode_relation\":\"" << opcodeRelation << "\"";
        if (opcodeIp != 0xffff) out << ",\"opcode_ip\":\"" << DosInt21TraceHex(opcodeIp, 4) << "\"";
        out << ",\"code_window\":{\"mode\":\"" << (codeWindowSupported ? "real-vm" : "unsupported-protected-mode") << "\"";
        if (codeWindowSupported)
            out << ",\"start_ip\":\"" << DosInt21TraceHex(codeWindowStartIp, 4)
                << "\",\"byte_count\":16,\"bytes_hex\":\"" << codeWindowHex << "\"";
        out << "}},\"dos_context\":{\"current_psp\":\"" << DosInt21TraceHex(currentPsp, 4)
            << "\",\"derived_load_segment\":\"" << DosInt21TraceHex(derivedLoadSegment, 4)
            << "\"";
        if (!mcbSnapshot.empty())
            out << ",\"mcb_chain_snapshot\":" << mcbSnapshot;
        out << "},\"pre\":{\"ax\":\"" << DosInt21TraceHex(ax, 4) << "\",\"bx\":\""
            << DosInt21TraceHex(bx, 4) << "\",\"cx\":\"" << DosInt21TraceHex(cx, 4)
            << "\",\"dx\":\"" << DosInt21TraceHex(dx, 4) << "\",\"si\":\"" << DosInt21TraceHex(si, 4)
            << "\",\"di\":\"" << DosInt21TraceHex(di, 4) << "\",\"bp\":\"" << DosInt21TraceHex(bp, 4)
            << "\",\"ds\":\"" << DosInt21TraceHex(dsSegment, 4) << "\",\"es\":\"" << DosInt21TraceHex(esSegment, 4)
            << "\",\"ss\":\"" << DosInt21TraceHex(ssSegment, 4) << "\",\"sp\":\"" << DosInt21TraceHex(sp, 4)
            << "\",\"handler_flags\":\"" << DosInt21TraceHex(handlerFlags, 8)
            << "\",\"guest_return_flags\":\"" << DosInt21TraceHex(guestFrame.flags, 8) << "\"},\"handle\":";
        if ((ah == 0x3c || ah == 0x3d) && !(postFrame.flags & FLAG_CF)) out << reg_ax;
        else if (ah == 0x3c || ah == 0x3d) out << "null";
        else out << bx;
        out << ",\"path\":" << (path.empty() ? "null" : DosInt21TraceJson(path))
            << ",\"path_bytes_hex\":" << (path.empty() ? "null" : DosInt21TraceJson(DosInt21TraceHexBytes(path)));
        if (ah == 0x3f || ah == 0x40) out << ",\"requested_count\":" << cx;
        if (ah == 0x42) out << ",\"seek_origin\":" << (unsigned)al << ",\"seek_input\":\""
                          << DosInt21TraceHex(((uint32_t)cx << 16u) | dx, 8) << "\"";
        out << ",\"post\":{\"ax\":\"" << DosInt21TraceHex(reg_ax, 4) << "\",\"dx\":\""
            << DosInt21TraceHex(reg_dx, 4) << "\",\"handler_flags\":\"" << DosInt21TraceHex(reg_flags, 8)
            << "\",\"guest_return_flags\":\"" << DosInt21TraceHex(postFrame.flags, 8)
            << "\",\"cf\":" << ((postFrame.flags & FLAG_CF) ? "true" : "false");
        if (hasActual) out << ",\"actual_count\":" << actual;
        if (hasSeekResult) out << ",\"seek_position\":\"" << DosInt21TraceHex(seekResult, 8) << "\"";
        out << "}}";
        dosInt21TraceState.Write(out.str());
    }

    void SetPath(const char *value) { if (enabled && value) path = value; }
    void SetActual(uint16_t value) { if (enabled) { actual = value; hasActual = true; } }
    void SetSeekResult(uint32_t value) { if (enabled) { seekResult = value; hasSeekResult = true; } }

private:
    uint8_t ah = 0, al = 0;
    uint16_t ax = 0, bx = 0, cx = 0, dx = 0, si = 0, di = 0, bp = 0, sp = 0;
    uint16_t dsSegment = 0, esSegment = 0, ssSegment = 0, callbackCs = 0, opcodeIp = 0xffff;
    uint16_t currentPsp = 0, derivedLoadSegment = 0, codeWindowStartIp = 0;
    uint32_t callbackIp = 0, handlerFlags = 0, seekResult = 0;
    DosInt21TraceGuestFrame guestFrame;
    std::string codeWindowHex;
    uint16_t actual = 0;
    bool enabled = false, hasActual = false, hasSeekResult = false, codeWindowSupported = true;
    const char *opcodeRelation = "unmatched";
    std::string path;
};
'''


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def validate_xms_a20_getter(data: bytes) -> None:
    getter = b"Bitu XMS_GetEnabledA20(void) {"
    if data.count(getter) != 1:
        raise ValueError("expected one pinned XMS_GetEnabledA20 definition")
    for branch in (b"return (IO_Read(0xF2)&1) == 0;",
                   b"return (IO_Read(0x92)&2)>0;"):
        if data.count(branch) != 1:
            raise ValueError("pinned XMS A20 getter lacks an expected architecture-specific port read")


def validate_cpu_profile_api(data: bytes) -> None:
    declarations = (
        b"extern unsigned char CPU_AutoDetermineMode;",
        b"extern unsigned char CPU_ArchitectureType;",
        b"extern CPU_Decoder * cpudecoder;",
    )
    decoder_names = (
        b"CPU_Core_Normal_Run", b"CPU_Core_Normal_Trap_Run",
        b"CPU_Core_Simple_Run", b"CPU_Core_Simple_Trap_Run", b"CPU_Core_Full_Run",
        b"CPU_Core_Prefetch_Run", b"CPU_Core_Prefetch_Trap_Run",
        b"CPU_Core_Dyn_X86_Run", b"CPU_Core_Dyn_X86_Trap_Run",
        b"CPU_Core_Dynrec_Run", b"CPU_Core_Dynrec_Trap_Run",
        b"CPU_Core286_Normal_Run", b"CPU_Core286_Normal_Trap_Run",
        b"CPU_Core286_Prefetch_Run", b"CPU_Core8086_Normal_Run",
        b"CPU_Core8086_Normal_Trap_Run", b"CPU_Core8086_Prefetch_Run",
    )
    if any(data.count(declaration) != 1 for declaration in declarations):
        raise ValueError("pinned CPU header lacks the expected profile state declarations")
    if any(data.count(name) != 1 for name in decoder_names):
        raise ValueError("pinned CPU header lacks a unique supported decoder declaration")


def extract_pinned_archive(archive_bytes: bytes, work: Path, *,
                           expected_sha: str = PINNED_ARCHIVE_SHA,
                           expected_root: str = ARCHIVE_ROOT) -> Path:
    if sha256(archive_bytes) != expected_sha:
        raise ValueError("unexpected exact-tag archive hash; refusing extraction")
    source_root = work / expected_root
    with zipfile.ZipFile(io.BytesIO(archive_bytes)) as package:
        work_resolved = work.resolve()
        for member in package.infolist():
            target = (work / member.filename).resolve()
            if not target.is_relative_to(work_resolved):
                raise ValueError("archive path escapes isolated work directory")
            if not target.is_relative_to(source_root.resolve()):
                raise ValueError("archive member is outside the pinned source root")
        package.extractall(work)
    if not source_root.is_dir():
        raise ValueError("pinned archive did not contain the expected source root")
    return source_root


def replace_once(data: bytes, old: bytes, new: bytes, label: str) -> bytes:
    count = data.count(old)
    if count != 1:
        raise ValueError(f"expected one {label} anchor, found {count}")
    return data.replace(old, new, 1)


def patch_dos_cpp(data: bytes, *, verify_identity: bool = True) -> bytes:
    if verify_identity and sha256(data) != DOS_CPP_SHA256:
        raise ValueError("unexpected DOS dispatcher identity; refusing patch")
    newline = b"\r\n" if b"\r\n" in data else b"\n"
    nl = lambda text: text.replace(b"\n", newline)
    data = replace_once(data, nl(b"#include <time.h>\n"),
                        nl(b"#include <time.h>\n#include <cstdlib>\n#include <fstream>\n#include <iomanip>\n#include <sstream>\n#include <string>\n"), "standard include")
    declaration_anchor = nl(b"static Bitu DOS_21Handler(void);\n")
    data = replace_once(data, declaration_anchor,
                        nl(TRACE_HELPERS.encode("ascii") + b"\nstatic Bitu DOS_21Handler(void);\n"), "trace helper insertion")

    def edit_section(data: bytes, start: bytes, end: bytes, edits: list[tuple[bytes, bytes, str]]) -> bytes:
        if data.count(start) != 1:
            raise ValueError(f"expected one section start {start!r}, found {data.count(start)}")
        start_at = data.index(start)
        end_at = data.index(end, start_at + len(start))
        section = data[start_at:end_at]
        for old, new, label in edits:
            section = replace_once(section, nl(old), nl(new), label)
        return data[:start_at] + section + data[end_at:]

    data = edit_section(data, b"case 0x3c:", b"case 0x3d:", [
        (b"case 0x3c:      /* CREATE Create or truncate file */\n",
         b"case 0x3c:      /* CREATE Create or truncate file */ {\n            DosInt21TraceScope trace(0x3c);\n", "create scope"),
        (b"MEM_StrCopy(SegPhys(ds)+reg_dx,name1,DOSNAMEBUF);\n            if (DOS_CreateFile",
         b"MEM_StrCopy(SegPhys(ds)+reg_dx,name1,DOSNAMEBUF);\n            trace.SetPath(name1);\n            if (DOS_CreateFile", "create path"),
        (b"            break;\n        ", b"            break;\n        }\n        ", "create scope close"),
    ])
    data = edit_section(data, b"case 0x3d:", b"case 0x3e:", [
        (b"{\n            unmask_irq0 |= disk_io_unmask_irq0;\n            MEM_StrCopy(SegPhys(ds)+reg_dx,name1,DOSNAMEBUF);",
         b"{\n            DosInt21TraceScope trace(0x3d);\n            unmask_irq0 |= disk_io_unmask_irq0;\n            MEM_StrCopy(SegPhys(ds)+reg_dx,name1,DOSNAMEBUF);\n            trace.SetPath(name1);", "open scope and path"),
    ])
    data = edit_section(data, b"case 0x3e:", b"case 0x3f:", [
        (b"        {\n            if(ias_handle != 0", b"        {\n            DosInt21TraceScope trace(0x3e);\n            if(ias_handle != 0", "close scope"),
    ])
    data = edit_section(data, b"case 0x3f:", b"case 0x40:", [
        (b"case 0x3f:      /* READ Read from file or device */\n",
         b"case 0x3f:      /* READ Read from file or device */ {\n            DosInt21TraceScope trace(0x3f);\n", "read scope"),
        (b"                if (fRead) {\n                    reg_ax=toread;",
         b"                if (fRead) {\n                    trace.SetActual(toread);\n                    reg_ax=toread;", "read actual count"),
        (b"                break;\n            }\n        ", b"                break;\n            }\n        }\n        ", "read scope close"),
    ])
    data = edit_section(data, b"case 0x40:", b"case 0x41:", [
        (b"case 0x40:                  /* WRITE Write to file or device */\n",
         b"case 0x40:                  /* WRITE Write to file or device */ {\n            DosInt21TraceScope trace(0x40);\n", "write scope"),
        (b"                if (fWritten) {\n                    reg_ax=towrite;",
         b"                if (fWritten) {\n                    trace.SetActual(towrite);\n                    reg_ax=towrite;", "write actual count"),
        (b"                break;\n            }\n        ", b"                break;\n            }\n        }\n        ", "write scope close"),
    ])
    data = edit_section(data, b"case 0x42:", b"case 0x43:", [
        (b"            {\n                uint32_t pos=((uint32_t)reg_cx << 16u) + reg_dx;",
         b"            {\n                DosInt21TraceScope trace(0x42);\n                uint32_t pos=((uint32_t)reg_cx << 16u) + reg_dx;", "seek scope"),
        (b"                if (DOS_SeekFile(reg_bx,&pos,reg_al)) {\n                    reg_dx=",
         b"                if (DOS_SeekFile(reg_bx,&pos,reg_al)) {\n                    trace.SetSeekResult(pos);\n                    reg_dx=", "seek result"),
    ])
    return data


def patch_dos_execute_cpp(data: bytes, *, verify_identity: bool = True) -> bytes:
    if verify_identity and sha256(data) != DOS_EXECUTE_CPP_SHA256:
        raise ValueError("unexpected DOS Execute source identity; refusing patch")
    newline = b"\r\n" if b"\r\n" in data else b"\n"
    nl = lambda text: text.replace(b"\n", newline)
    data = replace_once(
        data,
        nl(b'#include "crc32.h"\n'),
        nl(b'#include "crc32.h"\n\nextern void DOSBOX_X_INT21_TRACE_CAPTURE_START_MCB(uint16_t psp, uint16_t loadSegment, const char *program);\n'),
        "DOS Execute trace hook declaration",
    )
    data = replace_once(
        data,
        nl(b"bool DOS_Execute(const char* name, PhysPt block_pt, uint16_t flags) {\n"),
        nl(b"bool DOS_Execute(const char* name, PhysPt block_pt, uint16_t flags) {\n\tconst char *traceProgramName = name;\n"),
        "DOS Execute program name capture",
    )
    data = replace_once(
        data,
        nl(b"#endif\n\n\tif (flags==LOAD) {"),
        nl(b"#endif\n\n\tif (flags == LOADNGO)\n\t\tDOSBOX_X_INT21_TRACE_CAPTURE_START_MCB(pspseg, loadseg, traceProgramName);\n\n\tif (flags==LOAD) {"),
        "DOS Execute post-A20 pre-LOADNGO MCB capture",
    )
    return data


def patch_source_tree(source: Path) -> dict[str, str]:
    sentinel_path = source / SOURCE_SENTINEL
    sentinel = sentinel_path.read_bytes()
    if sha256(sentinel) != GAMELINK_SOURCE_SHA:
        raise ValueError("unexpected pristine GameLink source identity; refusing patch")
    patched_sentinel = patch_gamelink_source(sentinel)
    if sha256(patched_sentinel) != GAMELINK_PATCHED_SHA:
        raise ValueError("unexpected GameLink patch result")
    (source.parent / "output_gamelink-pristine.cpp").write_bytes(sentinel)
    sentinel_path.write_bytes(patched_sentinel)
    header = (source / DOS_HEADER).read_bytes()
    if sha256(header) != DOS_HEADER_SHA256:
        raise ValueError("unexpected DOS file API header identity; refusing patch")
    xms_original = (source / XMS_CPP).read_bytes()
    validate_xms_a20_getter(xms_original)
    cpu_header = (source / CPU_HEADER).read_bytes()
    validate_cpu_profile_api(cpu_header)
    cpp_path = source / DOS_CPP
    original = cpp_path.read_bytes()
    patched = patch_dos_cpp(original)
    cpp_path.write_bytes(patched)
    execute_path = source / DOS_EXECUTE_CPP
    execute_original = execute_path.read_bytes()
    execute_patched = patch_dos_execute_cpp(execute_original)
    execute_path.write_bytes(execute_patched)
    return {"pristineGameLinkSourceSha256": sha256(sentinel),
            "patchedGameLinkSourceSha256": sha256(patched_sentinel),
            "sourceDosCppSha256": sha256(original), "patchedDosCppSha256": sha256(patched),
            "sourceDosExecuteCppSha256": sha256(execute_original),
            "patchedDosExecuteCppSha256": sha256(execute_patched),
            "sourceXmsCppSha256": sha256(xms_original),
            "sourceCpuHeaderSha256": sha256(cpu_header),
            "dosSystemHeaderSha256": sha256(header)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, required=True, help="exact-tag DOSBox-X source zip")
    parser.add_argument("--work-dir", type=Path, required=True, help="new isolated work directory")
    parser.add_argument("--msbuild", type=Path, required=True)
    args = parser.parse_args()
    if not args.msbuild.is_file():
        parser.error("MSBuild executable is missing")
    archive = args.archive.resolve(strict=True)
    work = args.work_dir.resolve()
    if work.exists():
        parser.error("work directory must be new")
    work.mkdir(parents=True)
    copied_archive = work / f"{TAG}.zip"
    shutil.copyfile(archive, copied_archive)
    archive_bytes = copied_archive.read_bytes()
    if sha256(archive_bytes) != PINNED_ARCHIVE_SHA:
        raise ValueError("unexpected exact-tag archive hash; refusing extraction")
    copied_source = extract_pinned_archive(archive_bytes, work)
    source_identity = patch_source_tree(copied_source)
    command = [str(args.msbuild.resolve()), str(copied_source / "vs/dosbox-x.sln"), "/m:4",
               "/p:Configuration=Release SDL2", "/p:Platform=x64", "/p:PlatformToolset=v143",
               "/p:WindowsTargetPlatformVersion=10.0", "/verbosity:minimal"]
    with (work / "build.log").open("wb") as log:
        subprocess.run(command, cwd=copied_source, stdout=log, stderr=subprocess.STDOUT, check=True)
    exe = copied_source / "bin/x64/Release SDL2/dosbox-x.exe"
    if not exe.is_file():
        raise FileNotFoundError(f"candidate executable missing after successful build: {exe}")
    result = {"tag": TAG, "archiveSha256": PINNED_ARCHIVE_SHA,
              "gameLinkPatchSourceSha256": GAMELINK_SOURCE_SHA,
              "gameLinkPatchResultSha256": GAMELINK_PATCHED_SHA, **source_identity,
              "candidateExe": str(exe), "candidateExeSha256": sha256(exe.read_bytes()),
              "buildCommand": command, "buildExit": 0}
    (work / "manifest.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
