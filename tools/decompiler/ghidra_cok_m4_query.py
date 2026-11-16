# CoK M4 combat-setup-entry investigation: full auto-analysis + decompile + xref dump.
# Must run as a SECOND -postScript, chained after ghidra_import.py has already
# populated memory/calls/signature_seeds from the manifest for the SAME program.
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
    raise RuntimeError("usage: ghidra_cok_m4_query.py <targets.json> <out.txt>")

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
listing = currentProgram.getListing()
fm = currentProgram.getFunctionManager()

ifc = DecompInterface()
ifc.openProgram(currentProgram)

lines = []


def log(s):
    lines.append(s)
    print(s)


for t in targets:
    name = t["name"]
    addr_val = t["synthetic_address"]
    addr = space.getAddress(addr_val)
    log("")
    log("=" * 78)
    log("TARGET %s @ 0x%x" % (name, addr_val))
    log("=" * 78)

    func = getFunctionAt(addr)
    if func is None:
        disassemble(addr)
        func = getFunctionAt(addr)
        if func is None:
            try:
                func = createFunction(addr, "gbx_" + name)
            except Exception as exc:
                log("  createFunction failed: %s" % exc)
    if func is not None and func.getName().startswith("FUN_"):
        func.setName("gbx_" + name, SourceType.IMPORTED)

    if func is None:
        log("  NO FUNCTION could be created/found at this address")
    else:
        log("  function: %s  body=%s" % (func.getName(), func.getBody()))
        res = ifc.decompileFunction(func, 90, monitor)
        if res.decompileCompleted():
            dfun = res.getDecompiledFunction()
            log("  --- decompiled C ---")
            for cl in dfun.getC().split("\n"):
                log("  | " + cl)
        else:
            log("  decompile FAILED: %s" % res.getErrorMessage())

    log("  --- references TO this address (post full-analysis) ---")
    refs = list(ref_mgr.getReferencesTo(addr))
    if not refs:
        log("  (none found)")
    for r in refs:
        src = r.getFromAddress()
        src_func = fm.getFunctionContaining(src)
        src_func_name = src_func.getName() if src_func is not None else "?"
        log("  from 0x%s  type=%s  in-function=%s" % (src, r.getReferenceType(), src_func_name))

with io.open(out_path, "w", encoding="utf-8") as fh:
    fh.write(u"\n".join(lines))

print("=== wrote report to %s ===" % out_path)
