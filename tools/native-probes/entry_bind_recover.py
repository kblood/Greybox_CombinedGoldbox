"""Compile-only private action2 journal recovery from unchanged public composition."""
import importlib.util
import json
from pathlib import Path
import re

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("entry_capacity", HERE / "entry_full_capacity.py")
capacity = importlib.util.module_from_spec(spec)
spec.loader.exec_module(capacity)


def build(folder):
    folder.mkdir(parents=True, exist_ok=True)
    source = (capacity.ROOT / "native/src/ccnext.asm").read_text()
    baseline,public = capacity.assemble(source,folder,"public-baseline")
    assert baseline["sha256"]==capacity.PUBLIC_SHA256
    assert public==(capacity.ROOT/"native/build/ccnext.com").read_bytes()
    source=source.replace("        call kn_parse\n", """        call ebr_diagnostic
        jc kn_fail
        mov ax,4c00h
        int 21h
""",1)
    commit=(capacity.ROOT/"native/src/secretreward_commit.inc").read_text()
    begin=commit.index("        mov ax, [rr_header+28]\n",commit.index("rcommit_recover4:"))
    end=commit.index(".ordinary:\n",begin)
    commit=commit[:begin]+"        call ebr_intent\n        jc rc_close_bad\n"+commit[end:]
    begin=commit.index("rc_names:\n");end=commit.index("; Classify ALL",begin)
    commit=commit[:begin]+"rc_names:\n        jmp ebr_names\n\n"+commit[end:]
    begin=commit.index("rc_token_exact:\n");end=commit.index("rc_storage_start:",begin)
    commit=commit[:begin]+"rc_token_exact:\n        jmp ebr_token\n\n"+commit[end:]
    commit=commit.replace("        call rc_token_exact   ; reread exact typed token after RO scratch",
                          "        call rc_names         ; rebuild/reprove whole retained GRC before retirement")
    commit=commit.replace(".reindex:\n","ebr_reindex:\n",1).replace("jmp .reindex","jmp ebr_reindex")
    source=source.replace('%include "secretreward_commit.inc"',commit)
    final = "times 512 db 0\nstacktop:"
    assert source.count(final) == 1
    source = source.replace(final, '%include "secretreward_entry_bind_recover.inc"\n' + final)
    report, raw = capacity.assemble(source, folder, "entry-bind-recover")
    lines=Path(report["listing"]).read_text().splitlines()
    declaration=next(line for line in lines if "rw_paths times 1232 db 0" in line)
    match=re.search(r"^\s*\d+\s+([0-9A-F]{8})\s",declaration)
    path_address=int(match[1],16)+256
    reference=next(line for line in lines if "mov di, kn_new_paths" in line)
    operand=re.search(r"\[([0-9A-F]+)\]",reference)
    assert int.from_bytes(bytes.fromhex(operand[1]),"little")+256==path_address
    inactive=next(line for line in lines if "kn_new_paths times 1120 db 0" in line)
    assert not re.search(r"^\s*\d+\s+([0-9A-F]{8})\s",inactive)
    report["path_overlay"]={"address":path_address,"length":1120,"item_length":112}
    report["scope"] = "private action2 recovery; unchanged full public composition; no action3/public enrollment"
    report["installable"] = report["resident"] <= capacity.LIMIT
    (folder / "measurement.json").write_text(json.dumps(report, indent=2) + "\n")
    if not report["installable"]:
        raise RuntimeError("Private recovery exceeds resident ceiling: " + json.dumps(report))
    return Path(report["binary"]), Path(report["listing"]), report


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    print(json.dumps(build(parser.parse_args().output)[2], indent=2))
