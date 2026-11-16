"""Production coordinator overlay/opt-out and private ENTRY composition."""
import importlib.util
import json
from pathlib import Path
import re

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("entry_capacity", HERE / "entry_full_capacity.py")
capacity = importlib.util.module_from_spec(spec)
spec.loader.exec_module(capacity)


def source(*, overlay=False, entry=False):
    text = (capacity.ROOT / "native/src/ccnext.asm").read_text()
    if not overlay:
        text = "%define CCNEXT_NO_PATH_OVERLAY 1\n" + text
    if entry:
        text = "%define RW_SECTION_PROVIDER ep_read\n%define RW_SECTION_BOUND ep_span\n" + text
        text = text.replace('%include "secretreward_write.inc"',
                            '%include "secretreward_write_probe.inc"')
        text = text.replace("times 512 db 0\nstacktop:", '''entry_probe_begin:
%include "secretreward_entry_source.inc"
%include "secretreward_entry_compare.inc"
entry_probe_end:
times 512 db 0
stacktop:''')
    return text


def alias_address(listing):
    lines = Path(listing).read_text().splitlines()
    index = next(i for i, line in enumerate(lines) if "mov di, kn_new_paths" in line)
    # NASM brackets contain the relocation's file-relative absolute address.
    operand = re.search(r"\[([0-9A-F]+)\]", lines[index])
    assert operand, lines[index]
    little = bytes.fromhex(operand[1])
    return int.from_bytes(little, "little") + 256


def measure(folder):
    folder.mkdir(parents=True, exist_ok=True)
    report = {}
    for name, overlay, entry in (("production-optout", False, False),
                                 ("production-overlay", True, False),
                                 ("entry-optout", False, True),
                                 ("entry-overlay", True, True)):
        info, raw = capacity.assemble(source(overlay=overlay, entry=entry), folder, name)
        if not overlay:
            if entry:
                assert info["resident"] == 66153 > capacity.LIMIT
                assert info["sha256"] == "dfa447dc51067781820b97a1807e8e863ac3d1e857dbfb258fdd598037b5f3e6"
            else:
                assert info["resident"] == capacity.OPTOUT_RESIDENT
                assert info["sha256"] == capacity.OPTOUT_SHA256
        else:
            lines = Path(info["listing"]).read_text().splitlines()
            line = next(line for line in lines if "rw_paths times 1232 db 0" in line)
            match = re.search(r"^\s*\d+\s+([0-9A-F]{8})\s", line)
            rw_paths = int(match[1], 16) + 256
            assert alias_address(info["listing"]) == rw_paths
            inactive = next(line for line in lines if "kn_new_paths times 1120 db 0" in line)
            assert not re.search(r"^\s*\d+\s+([0-9A-F]{8})\s", inactive), inactive
            separate = {}
            for label, length in (("kn_new_header", 64), ("kn_new_context", 32),
                                  ("rw_header", 256), ("rw_context", 32)):
                declaration = next(line for line in lines if re.search(r"\b" + label + r" times", line))
                address = re.search(r"^\s*\d+\s+([0-9A-F]{8})\s", declaration)
                assert address, declaration
                start = int(address[1], 16) + 256
                assert start + length <= rw_paths or start >= rw_paths + 1120
                separate[label] = {"start": start, "end": start + length}
            info["alias"] = {"kn_new_paths": rw_paths, "rw_paths": rw_paths,
                             "length": 1120, "item_start": rw_paths + 1120,
                             "item_end": rw_paths + 1232, "separate": separate,
                             "inactive_storage_emits_bytes": False}
            assert info["resident"] <= capacity.LIMIT
            if name == "production-overlay":
                assert info["resident"] == capacity.PUBLIC_RESIDENT
                assert info["sha256"] == capacity.PUBLIC_SHA256
                assert raw == (capacity.ROOT / "native/build/ccnext.com").read_bytes()
        report[name] = info
    assert report["production-optout"]["resident"] - report["production-overlay"]["resident"] == 1120
    assert report["entry-overlay"]["resident"] == 65033
    (folder / "measurement.json").write_text(json.dumps(report, indent=2) + "\n")
    return report


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    print(json.dumps(measure(args.output), indent=2))
