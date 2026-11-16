"""Compile-only full private phase1 kind1 CAPTURE caller capacity and alias proof."""
import importlib.util
import json
import re
from pathlib import Path

HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location("entry_capture_capacity",HERE/"entry_full_capacity.py")
capacity=importlib.util.module_from_spec(spec);spec.loader.exec_module(capacity)


def build(folder):
    folder.mkdir(parents=True,exist_ok=True)
    source=(capacity.ROOT/"native/src/ccnext.asm").read_text()
    baseline,public=capacity.assemble(source,folder,"baseline")
    assert baseline["sha256"]==capacity.PUBLIC_SHA256
    assert public==(capacity.ROOT/"native/build/ccnext.com").read_bytes()
    source=source.replace("        call kn_parse\n","""        call ecp_diagnostic
        jc kn_fail
        mov ax,4c00h
        int 21h
""",1)
    final="times 512 db 0\nstacktop:"
    assert source.count(final)==1
    source=source.replace(final,'%include "secretreward_entry_phase1_capture.inc"\n'+final)
    report,raw=capacity.assemble(source,folder,"entry-phase1-capture")
    lines=Path(report["listing"]).read_text().splitlines()
    declaration=next(line for line in lines if "rw_paths times 1232 db 0" in line)
    address=int(re.search(r"^\s*\d+\s+([0-9A-F]{8})\s",declaration)[1],16)+256
    operand=re.search(r"\[([0-9A-F]+)\]",next(line for line in lines if "mov di, kn_new_paths" in line))
    assert int.from_bytes(bytes.fromhex(operand[1]),"little")+256==address
    inactive=next(line for line in lines if "kn_new_paths times 1120 db 0" in line)
    assert not re.search(r"^\s*\d+\s+([0-9A-F]{8})\s",inactive)
    report["path_overlay"]={"address":address,"length":1120,"item_length":112}
    report["delta_from_public"]=report["resident"]-baseline["resident"]
    def label_address(label):
        position=next(i for i,line in enumerate(lines) if re.search(r"\b"+label+r"(?:\s+(?:times|d[bwd])|:)",line))
        for line in lines[position:]:
            match=re.search(r"^\s*\d+\s+(?:<\d+>\s+)?([0-9A-F]{8})\s",line)
            if match:return int(match[1],16)+256
        return report["resident"]
    begin,data,end=(label_address(name) for name in ("ecp_diagnostic","ecp_index","ecp_end"))
    report["intervals"]={"new_code":{"start":begin,"end":data,"bytes":data-begin},
        "new_data":{"start":data,"end":end,"bytes":end-data},
        "stack":{"start":end,"end":report["resident"],"bytes":512},
        "startup_delta":report["delta_from_public"]-(end-begin),
        "frozen_section2":{"start":label_address("ecp_section2"),"bytes":8}}
    assert end+512==report["resident"] and end-data==22
    report["installable"]=report["resident"]<=capacity.LIMIT
    (folder/"measurement.json").write_text(json.dumps(report,indent=2)+"\n")
    if not report["installable"]:
        raise RuntimeError("Oversized CAPTURE caller; do not execute: "+json.dumps(report))
    return Path(report["binary"]),Path(report["listing"]),report


if __name__=="__main__":
    import argparse
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument("output",type=Path)
    print(json.dumps(build(parser.parse_args().output)[2],indent=2))


