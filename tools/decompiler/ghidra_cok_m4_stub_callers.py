# CoK M4 round 11: for each given resident FBOV dispatch-stub address (the small
# resident-image trampoline that a caller NEAR-CALLs before the stub itself
# far-jumps into the actual overlay routine), find every function in the WHOLE
# program that calls that stub, decompile each caller, and one more hop up from
# each caller too. This is a different query shape from round-7's
# ghidra_cok_m4_walkup.py (which walks UP from a single known overlay routine):
# here we walk DOWN from a shared resident trampoline to discover ALL its distinct
# high-level callers, on the theory that the wandering-encounter dispatch and the
# scripted combat_setup_entry path may both route through the SAME generic
# resource-loader stub but via two different, so-far-undiscovered caller
# functions. Must run as a further -postScript, chained after ghidra_import.py has
# already populated the program for the SAME headless session.
# @category Greybox
# @runtime Jython

from __future__ import print_function

import io
import json

from ghidra.app.decompiler import DecompInterface
from ghidra.util.task import ConsoleTaskMonitor
from ghidra.program.model.symbol import SourceType


args = getScriptArgs()
if len(args) != 2:
    raise RuntimeError("usage: ghidra_cok_m4_stub_callers.py <targets.json> <out.txt>")

targets_path = args[0]
out_path = args[1]

with io.open(targets_path, "r", encoding="utf-8") as fh:
    targets = json.load(fh)

monitor = ConsoleTaskMonitor()

print("=== running full auto-analysis over the populated program ===")
analyzeAll(currentProgram)
print("=== auto-analysis complete ===")

space = currentProgram.getAddressFactory().getDefaultAddressSpace()
ref_mgr = currentProgram.getReferenceManager()
fm = currentProgram.getFunctionManager()

ifc = DecompInterface()
ifc.openProgram(currentProgram)

lines = []


def log(s):
    lines.append(s)
    print(s)


def decompile_func(func):
    res = ifc.decompileFunction(func, 90, monitor)
    if res.decompileCompleted():
        dfun = res.getDecompiledFunction()
        for cl in dfun.getC().split("\n"):
            log("    | " + cl)
    else:
        log("    decompile FAILED: %s" % res.getErrorMessage())


for t in targets:
    name = t["name"]
    addr_val = t["synthetic_address"]
    addr = space.getAddress(addr_val)
    log("")
    log("=" * 78)
    log("STUB TARGET %s @ 0x%x" % (name, addr_val))
    log("=" * 78)

    func = getFunctionAt(addr)
    if func is None:
        disassemble(addr)
        func = getFunctionAt(addr)
        if func is None:
            func = fm.getFunctionContaining(addr)
        if func is None:
            try:
                func = createFunction(addr, "gbx_" + name)
            except Exception as exc:
                log("  createFunction failed: %s" % exc)

    if func is not None and func.getName().startswith("FUN_"):
        func.setName("gbx_" + name, SourceType.IMPORTED)

    if func is None:
        log("  NO FUNCTION at this address")
    else:
        log("  function: %s  body=%s  entry=0x%s" % (func.getName(), func.getBody(), func.getEntryPoint()))
        decompile_func(func)

    log("  --- ALL references TO 0x%x (post full-analysis, every distinct caller function) ---" % addr_val)
    refs = list(ref_mgr.getReferencesTo(addr))
    if not refs:
        log("  (none found -- this stub is never reached via a resolvable static reference)")
    seen_funcs = set()
    for r in refs:
        src = r.getFromAddress()
        src_func = fm.getFunctionContaining(src)
        src_func_name = src_func.getName() if src_func is not None else "?"
        log("  from 0x%s  type=%s  in-function=%s" % (src, r.getReferenceType(), src_func_name))
        if src_func is not None:
            key = src_func.getEntryPoint()
            if key not in seen_funcs:
                seen_funcs.add(key)
                log("    --- decompile of caller %s (entry 0x%s) ---" % (src_func_name, key))
                decompile_func(src_func)
                # One more hop: who calls THIS caller?
                caller_refs = list(ref_mgr.getReferencesTo(key))
                log("    --- callers of %s (entry 0x%s) ---" % (src_func_name, key))
                if not caller_refs:
                    log("    (zero callers found for this caller too)")
                for cr in caller_refs:
                    csrc = cr.getFromAddress()
                    csrc_func = fm.getFunctionContaining(csrc)
                    log("    from 0x%s  type=%s  in-function=%s" % (
                        csrc, cr.getReferenceType(), csrc_func.getName() if csrc_func else "?"))

with io.open(out_path, "w", encoding="utf-8") as fh:
    fh.write(u"\n".join(lines))

print("=== wrote report to %s ===" % out_path)
