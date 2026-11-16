# CoK M4 round 11: look up one or more functions BY NAME (already discovered by
# Ghidra's own analyzeAll(), e.g. "FUN_0011_df1d") -- NON-DESTRUCTIVE (never calls
# disassemble()/createFunction() at an arbitrary address, which round-11's first
# attempt proved can corrupt an existing function's disassembly if the address is
# mid-instruction). Decompiles each and lists EVERY caller found by Ghidra's
# reference manager after a full auto-analysis pass. Must run as a further
# -postScript, chained after ghidra_import.py has already populated the program
# for the SAME headless session.
# @category Greybox
# @runtime Jython

from __future__ import print_function

import io
import json

from ghidra.app.decompiler import DecompInterface
from ghidra.util.task import ConsoleTaskMonitor


args = getScriptArgs()
if len(args) != 2:
    raise RuntimeError("usage: ghidra_cok_m4_symbol_query.py <names.json> <out.txt>")

names_path = args[0]
out_path = args[1]

with io.open(names_path, "r", encoding="utf-8") as fh:
    names = json.load(fh)

monitor = ConsoleTaskMonitor()

print("=== running full auto-analysis over the populated program ===")
analyzeAll(currentProgram)
print("=== auto-analysis complete ===")

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


all_funcs = list(fm.getFunctions(True))
by_name = {}
for f in all_funcs:
    by_name.setdefault(f.getName(), []).append(f)

for want in names:
    log("")
    log("=" * 78)
    log("SYMBOL %s" % want)
    log("=" * 78)
    matches = by_name.get(want, [])
    if not matches:
        log("  NOT FOUND among %d functions discovered by analyzeAll()" % len(all_funcs))
        continue
    for func in matches:
        entry = func.getEntryPoint()
        log("  function: %s  body=%s  entry=0x%s" % (func.getName(), func.getBody(), entry))
        decompile_func(func)
        refs = list(ref_mgr.getReferencesTo(entry))
        log("  --- ALL references TO %s (entry 0x%s), %d found ---" % (func.getName(), entry, len(refs)))
        if not refs:
            log("  (zero callers -- root in resolved call graph)")
        seen = set()
        for r in refs:
            src = r.getFromAddress()
            src_func = fm.getFunctionContaining(src)
            src_func_name = src_func.getName() if src_func is not None else "?"
            log("  from 0x%s  type=%s  in-function=%s" % (src, r.getReferenceType(), src_func_name))
            if src_func is not None:
                key = src_func.getEntryPoint()
                if key not in seen:
                    seen.add(key)

with io.open(out_path, "w", encoding="utf-8") as fh:
    fh.write(u"\n".join(lines))

print("=== wrote report to %s ===" % out_path)
