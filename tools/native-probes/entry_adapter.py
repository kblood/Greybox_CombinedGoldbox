"""Compile-only complete coordinator/private post-ENTRY adapter capacity gate."""
import importlib.util
import json
import re
from pathlib import Path

HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location("entry_capacity_adapter",HERE/"entry_full_capacity.py")
capacity=importlib.util.module_from_spec(spec);spec.loader.exec_module(capacity)


def build(folder):
    folder.mkdir(parents=True,exist_ok=True)
    source=(capacity.ROOT/"native/src/ccnext.asm").read_text()
    baseline,raw=capacity.assemble(source,folder,"baseline")
    assert baseline["sha256"]==capacity.PUBLIC_SHA256
    assert raw==(capacity.ROOT/"native/build/ccnext.com").read_bytes()
    source=source.replace("        call kn_parse\n","""        call ea_diagnostic
        jc kn_fail
        mov ax,4c00h
        int 21h
""",1)
    final="times 512 db 0\nstacktop:"
    assert source.count(final)==1
    source=source.replace(final,'%include "secretreward_entry_adapter.inc"\n'+final)
    report,raw=capacity.assemble(source,folder,"entry-adapter")
    lines=Path(report["listing"]).read_text().splitlines()
    declaration=next(line for line in lines if "rw_paths times 1232 db 0" in line)
    address=int(re.search(r"^\s*\d+\s+([0-9A-F]{8})\s",declaration)[1],16)+256
    operand=re.search(r"\[([0-9A-F]+)\]",next(line for line in lines if "mov di, kn_new_paths" in line))
    assert int.from_bytes(bytes.fromhex(operand[1]),"little")+256==address
    inactive=next(line for line in lines if "kn_new_paths times 1120 db 0" in line)
    assert not re.search(r"^\s*\d+\s+([0-9A-F]{8})\s",inactive)
    report["path_overlay"]={"address":address,"length":1120,"item_length":112}
    report["installable"]=report["resident"]<=capacity.LIMIT
    (folder/"measurement.json").write_text(json.dumps(report,indent=2)+"\n")
    if not report["installable"]:
        raise RuntimeError("Oversized adapter; do not execute: "+json.dumps(report))
    return Path(report["binary"]),Path(report["listing"]),report


if __name__=="__main__":
    import argparse
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument("output",type=Path)
    print(json.dumps(build(parser.parse_args().output)[2],indent=2))
