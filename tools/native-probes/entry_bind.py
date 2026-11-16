"""Compile-only private action2 staging; no production enrollment."""
import importlib.util
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("entry_bind_capacity", HERE / "entry_full_capacity.py")
capacity = importlib.util.module_from_spec(spec)
spec.loader.exec_module(capacity)


def build(folder):
    folder.mkdir(parents=True, exist_ok=True)
    source = (capacity.ROOT / "native/src/ccnext.asm").read_text()
    baseline, public = capacity.assemble(source, folder, "baseline")
    assert baseline["sha256"] == capacity.PUBLIC_SHA256
    assert public == (capacity.ROOT / "native/build/ccnext.com").read_bytes()
    # This diagnostic needs RC admission, but no fresh request submission.
    source = source.replace("%define RCOMMIT_HAS_RQ 1", "")
    source = source.replace("%define RCOMMIT_HAS_SUBMIT 1", "")
    source = source.replace('%include "secretreward_submit.inc"', "")
    transaction = (capacity.ROOT / "native/src/secretreward_transaction.inc").read_text()
    transaction = transaction[:transaction.index("rj_derive:\n")] + transaction[transaction.index("rj_memory_spec:\n"):]
    transaction = transaction[:transaction.index("rj_stage_intent:\n")] + transaction[transaction.index("rj_match_live:\n"):]
    source = source.replace('%include "secretreward_transaction.inc"', transaction)
    source = source.replace("        call kn_parse\n", """        call ebp_diagnostic
        jc kn_fail
        mov ax,4c00h
        int 21h
""", 1)
    source = "%define RW_SECTION_PROVIDER ep_read\n%define RW_SECTION_BOUND ep_span\n" + source
    source = source.replace('%include "secretreward_write.inc"', '%include "secretreward_write_probe.inc"')
    final = "times 512 db 0\nstacktop:"
    assert source.count(final) == 1
    source = source.replace(final, '''%include "secretreward_entry_source.inc"
%include "secretreward_entry_compare.inc"
%include "secretreward_entry_bind.inc"
%if kn_new_paths != rw_paths || rz_catalog != rw_header || ru_table != rl_target_ledger || rv_compare_buffer != kc_cmp
%error Private worker alias mismatch
%endif
''' + final)
    report, raw = capacity.assemble(source, folder, "entry-bind")
    lines = Path(report["listing"]).read_text().splitlines()
    declaration = next(line for line in lines if "rw_paths times 1232 db 0" in line)
    address = int(re.search(r"^\s*\d+\s+([0-9A-F]{8})\s", declaration)[1], 16) + 256
    operand = re.search(r"\[([0-9A-F]+)\]", next(line for line in lines if "mov di, kn_new_paths" in line))
    assert int.from_bytes(bytes.fromhex(operand[1]), "little") + 256 == address
    inactive = next(line for line in lines if "kn_new_paths times 1120 db 0" in line)
    assert not re.search(r"^\s*\d+\s+([0-9A-F]{8})\s", inactive)
    report["path_overlay"] = {"address": address, "length": 1120, "item_length": 112}
    report["aliases"] = {"kn_new_paths": "rw_paths", "rz_catalog": "rw_header",
                         "ru_table": "rl_target_ledger", "rv_compare_buffer": "kc_cmp"}
    report["profile"] = "private coordinator without submit/RQ/ordinary action derivation; streamed owner/GRC; final stack512"
    report["installable"] = report["resident"] <= capacity.LIMIT
    (folder / "measurement.json").write_text(json.dumps(report, indent=2) + "\n")
    if not report["installable"]:
        raise RuntimeError("Oversized BIND worker; do not execute: " + json.dumps(report))
    return Path(report["binary"]), Path(report["listing"]), report


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    print(json.dumps(build(parser.parse_args().output)[2], indent=2))
