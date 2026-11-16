"""Compile-only private ENTRY staging worker; not an engine target."""
from pathlib import Path
import argparse
import importlib.util
import json
import hashlib
import shutil
import subprocess

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]


def build(folder):
    spec = importlib.util.spec_from_file_location("bootstrap_builder",HERE / "entry_bootstrap.py")
    bootstrap = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(bootstrap)
    bootstrap.build(folder / "bootstrap")
    source = (folder / "bootstrap/entry-bootstrap.asm").read_text()
    source = source.replace("call eb_run", "call er_run",1)
    source = "%define RW_SECTION_PROVIDER ep_read\n%define RW_SECTION_BOUND ep_span\n" + source
    source = source.replace('%include "secretreward_write.inc"','%include "secretreward_write_probe.inc"')
    source = source.replace("times 512 db 0\nstacktop:",'''%include "secretreward_entry_source.inc"
%include "secretreward_entry_compare.inc"
%include "secretreward_entry_stage.inc"
times 512 db 0
stacktop:''')
    asm=folder/"entry-stage.asm";binary=folder/"entry-stage.com";listing=folder/"entry-stage.lst"
    asm.write_text(source,encoding="ascii")
    nasm=shutil.which("nasm") or str(Path.home()/"AppData/Local/bin/NASM/nasm.exe")
    result=subprocess.run([nasm,"-I",str(ROOT/"native/src")+"/","-I",str(HERE)+"/",
                           "-f","bin",str(asm),"-o",str(binary),"-l",str(listing)],
                          capture_output=True,text=True,timeout=30)
    (folder/"nasm.log").write_text(result.stdout+result.stderr)
    assert result.returncode==0,result.stdout+result.stderr
    raw=binary.read_bytes()
    report={"raw":len(raw),"psp":256,"resident":len(raw)+256,"stack":512,
            "headroom":65280-len(raw)-256,"sha256":hashlib.sha256(raw).hexdigest(),"executed":False}
    (folder/"measurement.json").write_text(json.dumps(report,indent=2)+"\n")
    assert report["resident"]<=65280,report
    assert raw[-512:]==bytes(512)
    return binary,listing,report


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output",type=Path)
    print(json.dumps(build(parser.parse_args().output)[2],indent=2))
