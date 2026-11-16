"""Compile-only ENTRY probe budget against byte-identical public CCNEXT.

Writes disposable diagnostic artifacts only. An oversized composition is never
loaded or executed. The production source and build outputs are read-only.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[2]
PUBLIC_SHA256 = "73c77198988215c00c99f625f1cfb9a492d892208c446282519a52db6dee2c14"
PUBLIC_RESIDENT = 64043
OPTOUT_SHA256 = "1cf5774e62c571939f93fec4f9e46fccb8bd93ee2732d1cfbe5f6903fe9c51ca"
OPTOUT_RESIDENT = 65163
LIMIT = 65280


def digest(data):
    return hashlib.sha256(data).hexdigest()


def assemble(source, folder, name):
    asm, binary, listing = (folder / (name + suffix) for suffix in (".asm", ".com", ".lst"))
    asm.write_text(source, encoding="ascii")
    nasm = shutil.which("nasm") or str(Path.home() / "AppData/Local/bin/NASM/nasm.exe")
    result = subprocess.run([nasm, "-DCCNEXT_PUBLIC_FINAL=1", "-I", str(ROOT / "native/src") + "/",
                             "-I", str(ROOT / "tools/native-probes") + "/", "-f", "bin",
                             str(asm), "-o", str(binary), "-l", str(listing)],
                            capture_output=True, text=True, timeout=30)
    assert result.returncode == 0, result.stdout + result.stderr
    (folder / (name + ".nasm.log")).write_text(result.stdout + result.stderr)
    raw = binary.read_bytes()
    # The sole final reservation is emitted, so raw extent agrees with the
    # listing's stack-start address plus its 512 bytes and the PSP exactly once.
    text = listing.read_text()
    stack_lines = [line for line in text.splitlines()
                   if "<1>" not in line and re.search(r"times 512 db 0\s*$", line)]
    assert len(stack_lines) == 1, stack_lines
    match = re.search(r"\s([0-9A-F]{8})\s", stack_lines[0])
    assert match and int(match[1], 16) + 512 == len(raw)
    assert raw[-512:] == bytes(512)
    return {"raw": len(raw), "resident": len(raw) + 256, "stack": 512,
            "builder_limit": LIMIT, "builder_headroom": LIMIT - len(raw) - 256,
            "physical_headroom": 65536 - len(raw) - 256,
            "sha256": digest(raw), "binary": str(binary), "listing": str(listing),
            "executed": False}, raw


def measure(folder):
    folder.mkdir(parents=True, exist_ok=True)
    source = (ROOT / "native/src/ccnext.asm").read_text()
    baseline, raw = assemble(source, folder, "baseline")
    assert baseline["resident"] == PUBLIC_RESIDENT, baseline
    assert baseline["sha256"] == PUBLIC_SHA256, baseline
    public = ROOT / "native/build/ccnext.com"
    assert public.read_bytes() == raw, "current public binary differs from baseline"
    writer_include = '%include "secretreward_write.inc"'
    assert source.count(writer_include) == 1
    enabled = "%define RW_SECTION_PROVIDER ep_read\n%define RW_SECTION_BOUND ep_span\n" + source
    enabled = enabled.replace(writer_include, '%include "secretreward_write_probe.inc"')
    final_stack = "times 512 db 0\nstacktop:"
    assert enabled.count(final_stack) == 1
    enabled = enabled.replace(final_stack, '''entry_probe_begin:
%include "secretreward_entry_source.inc"
%include "secretreward_entry_compare.inc"
entry_probe_end:
times 512 db 0
stacktop:''')
    candidate, _ = assemble(enabled, folder, "entry-enabled")
    def address(listing, label):
        lines = Path(listing).read_text().splitlines()
        positions = [i for i, line in enumerate(lines)
                     if re.search(r"(?:<1>\s+)?" + re.escape(label) + r"(?::|\s+(?:dw|times))", line)]
        assert len(positions) == 1, (label, positions)
        for line in lines[positions[0]:]:
            match = re.search(r"^\s*\d+\s+([0-9A-F]{8})\s", line)
            if match:
                return int(match[1], 16)
        raise AssertionError(label)
    def writer_parts(info):
        listing = info["listing"]
        begin, data, end = (address(listing, label) for label in ("rw_write", "rw_fh", "rw_buf"))
        return {"code": data - begin, "data": end + 512 - data}
    original, modified = writer_parts(baseline), writer_parts(candidate)
    listing = candidate["listing"]
    provider_start, provider_data = address(listing, "ep_read"), address(listing, "ep_storage")
    compare_start, compare_data = address(listing, "ep_compare"), address(listing, "ec_part")
    compare_end = address(listing, "ec_chunk") + 2
    modules = {"writer_delta": {key: modified[key] - original[key] for key in original},
               "provider": {"code": provider_data - provider_start,
                            "data": compare_start - provider_data},
               "comparator": {"code": compare_data - compare_start,
                              "data": compare_end - compare_data}}
    assert sum(sum(parts.values()) for parts in modules.values()) == candidate["resident"] - baseline["resident"]
    report = {"baseline": baseline, "enabled": candidate,
              "delta": candidate["resident"] - baseline["resident"],
              "fits": candidate["resident"] <= LIMIT,
              "listing_modules": modules,
              "profile": "public all17; RZ/RU/RV aliases; streamed paths; substituted RW; EP source/compare",
              "production_sources_modified": False}
    (folder / "measurement.json").write_text(json.dumps(report, indent=2) + "\n")
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    print(json.dumps(measure(args.output), indent=2))
