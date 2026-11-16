"""Assemble private read-only ENTRY diagnostic; never production dispatch."""
from pathlib import Path
import argparse
import hashlib
import json
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent


def build(folder):
    folder.mkdir(parents=True, exist_ok=True)
    source = (ROOT / "native/src/ccnext.asm").read_text()
    source = source.replace("        call kn_parse\n", """        call kn_alloc
        jc kn_fail
        call eb_run
        jc kn_fail
        mov ax,4c00h
        int 21h
""", 1)
    modules = ("record", "names", "resource", "party", "currency", "xp",
               "roster", "state", "replay", "write", "admission")
    includes = "\n".join('%include "secretreward_' + name + '.inc"' for name in modules)
    source = source.replace("times 512 db 0\nstacktop:", includes + '\n%include "secretreward_entry_bootstrap.inc"\ntimes 512 db 0\nstacktop:')
    source = "%define RZ_EXTERNAL_CATALOG rw_header\n%define RU_EXTERNAL_TABLE rl_target_ledger\n%define RV_EXTERNAL_COMPARE kc_cmp\n%define RV_STREAM_PATHS 1\n" + source
    asm = folder / "entry-bootstrap.asm"
    binary = folder / "entry-bootstrap.com"
    listing = folder / "entry-bootstrap.lst"
    asm.write_text(source, encoding="ascii")
    nasm = shutil.which("nasm") or str(Path.home() / "AppData/Local/bin/NASM/nasm.exe")
    run = subprocess.run([nasm, "-I", str(ROOT / "native/src") + "/", "-I", str(HERE) + "/",
                          "-f", "bin", str(asm), "-o", str(binary), "-l", str(listing)],
                         capture_output=True, text=True, timeout=30)
    (folder / "nasm.log").write_text(run.stdout + run.stderr)
    assert run.returncode == 0, run.stdout + run.stderr
    raw = binary.read_bytes()
    report = dict(raw=len(raw), resident=len(raw) + 256, stack=512,
                  headroom=65280 - len(raw) - 256, sha256=hashlib.sha256(raw).hexdigest())
    (folder / "measurement.json").write_text(json.dumps(report, indent=2) + "\n")
    assert report["resident"] <= 65280, report
    assert raw[-512:] == bytes(512)
    return binary, listing, report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    print(json.dumps(build(parser.parse_args().output)[2], indent=2))
