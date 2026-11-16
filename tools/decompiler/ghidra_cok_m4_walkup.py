# CoK M4: walk the caller chain upward from a known function, decompiling each
# hop, until a branch point (multiple callers / zero callers) or depth limit.
# Chained AFTER ghidra_import.py has already populated the program AND after a
# prior full analyzeAll() pass in the same headless session (analysis state is
# per-program and persists across postScripts within one run).
# @category Greybox
# @runtime Jython

from __future__ import print_function

import io

from ghidra.app.decompiler import DecompInterface
from ghidra.util.task import ConsoleTaskMonitor
from ghidra.program.model.symbol import SourceType


args = getScriptArgs()
if len(args) != 3:
    raise RuntimeError("usage: ghidra_cok_m4_walkup.py <start_synthetic_addr_hex> <max_depth> <out.txt>")

start_addr_val = int(args[0], 16)
max_depth = int(args[1])
out_path = args[2]

monitor = ConsoleTaskMonitor()
print("=== running full auto-analysis (idempotent) ===")
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


def decompile_and_print(func):
    res = ifc.decompileFunction(func, 90, monitor)
    if res.decompileCompleted():
        dfun = res.getDecompiledFunction()
        for cl in dfun.getC().split("\n"):
            log("  | " + cl)
    else:
        log("  decompile FAILED: %s" % res.getErrorMessage())


cur_addr = space.getAddress(start_addr_val)
depth = 0
while depth <= max_depth:
    func = getFunctionAt(cur_addr)
    if func is None:
        func = fm.getFunctionContaining(cur_addr)
    log("")
    log("#" * 78)
    log("HOP %d: address 0x%s  function=%s" % (
        depth, cur_addr, func.getName() if func else "NONE"))
    log("#" * 78)
    if func is None:
        log("  no function found containing this address -- stopping")
        break
    log("  body=%s" % func.getBody())
    decompile_and_print(func)

    entry = func.getEntryPoint()
    refs = list(ref_mgr.getReferencesTo(entry))
    call_refs = [r for r in refs if r.getReferenceType().isCall()]
    log("  --- callers of %s (entry 0x%s) ---" % (func.getName(), entry))
    if not call_refs:
        log("  ZERO callers found -- this is a root in the resolved call graph "
            "(likely reached via an INDIRECT/computed call Ghidra's analysis "
            "did not resolve to a direct reference, or it is itself an "
            "external/interrupt-driven entry point)")
        break
    for r in call_refs:
        src = r.getFromAddress()
        src_func = fm.getFunctionContaining(src)
        log("  from 0x%s  type=%s  in-function=%s" % (
            src, r.getReferenceType(), src_func.getName() if src_func else "?"))
    if len(call_refs) > 1:
        distinct_funcs = set()
        for r in call_refs:
            sf = fm.getFunctionContaining(r.getFromAddress())
            distinct_funcs.add(sf.getEntryPoint() if sf else r.getFromAddress())
        if len(distinct_funcs) > 1:
            log("  BRANCH POINT: %d distinct caller functions -- stopping upward walk here "
                "(ambiguous which is the CoK-M4-relevant path without further evidence)"
                % len(distinct_funcs))
            break
    # Single (or single-function-multiple-sites) caller: continue upward from
    # the first call site's containing function.
    next_src = call_refs[0].getFromAddress()
    next_func = fm.getFunctionContaining(next_src)
    if next_func is None:
        log("  caller call-site is not inside any known function -- stopping")
        break
    cur_addr = next_func.getEntryPoint()
    depth += 1

with io.open(out_path, "w", encoding="utf-8") as fh:
    fh.write(u"\n".join(lines))

print("=== wrote walkup report to %s ===" % out_path)
