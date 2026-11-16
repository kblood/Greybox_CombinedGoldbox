"""Fresh acceptance lifetime seams observed in real compiled instructions."""
from pathlib import Path
import re
import shutil
import struct
import subprocess

import pytest
from unicorn import UC_HOOK_CODE,UC_HOOK_MEM_WRITE
from tools.test_secret_reward_submit import (
    submit_image, fresh, submit, commit_owner_base, recovery_image, commit_image,
    invoke, image, prepared, inputs, consumers, producer_image, party_image,
    owned_reward_fixture, owner_base)
from tools.secret_reward_dos_fixture import RewardDiskMachine
from tools.test_secret_continuation_io import BASE,x86


@pytest.fixture(scope="module")
def observed_image(tmp_path_factory):
    class Factory:
        def mktemp(self,name):
            self.path=tmp_path_factory.mktemp(name)
            return self.path
    factory=Factory()
    raw,labels=submit_image.__wrapped__(factory)
    asm=factory.path/"probe.asm"
    listing=asm.with_suffix(".lst")
    binary=asm.with_suffix(".bin")
    nasm=shutil.which("nasm") or str(Path.home()/"AppData/Local/bin/NASM/nasm.exe")
    src=Path(__file__).resolve().parents[1]/"native/src"
    run=subprocess.run([nasm,"-I",str(src)+"/","-f","bin",str(asm),"-o",str(binary),"-l",str(listing)],capture_output=True,timeout=30)
    assert run.returncode==0,run.stderr
    assert binary.read_bytes()==raw and len(raw)+256<=65280
    # Read exact assembler addresses without adding runtime export words or
    # touching the loaded code/data/stack of this tightly bounded caller.
    found={};pending_name=None
    for line in listing.read_text().splitlines():
        label=re.search(r"\b(rcommit_submit4|rs_fs_difference):",line)
        if label: pending_name=label.group(1)
        address=re.match(r"\s*\d+\s+(?:<\d+>\s+)?([0-9A-F]{8})\s",line)
        if address and pending_name:
            found[pending_name]=int(address.group(1),16)+256
            pending_name=None
        if address and re.search(r"\brs_changed\s+db\b",line):
            found["rs_changed"]=int(address.group(1),16)+256
    assert found["rcommit_submit4"]==labels["rcommit_submit4"]
    assert "rs_fs_difference" in found and "rs_changed" in found
    labels=dict(labels);labels.update(found)
    return raw,labels


class AcceptanceObserver(RewardDiskMachine):
    def __init__(self,image,files,*,replacement=None,late_error=False):
        super().__init__(image,files)
        self.replacement=replacement
        self.late_error=late_error
        self.in_compare=False
        self.saw_mismatch=False
        self.injected_at=None
        self.changed_files=[]
        start=BASE+self.labels["rs_fs_difference"]
        flag=BASE+self.labels["rs_changed"]
        self.uc.hook_add(UC_HOOK_CODE,self.enter_compare,begin=start,end=start)
        self.uc.hook_add(UC_HOOK_MEM_WRITE,self.observe_difference,begin=flag,end=flag)

    def enter_compare(self,uc,address,size,unused):
        self.in_compare=True
        if self.replacement is not None:
            path,body=self.replacement
            self.files[path]=bytearray(body)
            self.changed_files.append(path)
            self.replacement=None

    def observe_difference(self,uc,access,address,size,value,unused):
        if self.in_compare and value==1: self.saw_mismatch=True

    def interrupt(self,uc,number,unused):
        if self.late_error and self.saw_mismatch and number==0x21 and uc.reg_read(x86.UC_X86_REG_AX)>>8==0x3f:
            self.injected_at=len(self.events)+1
            self.fault_at=self.injected_at
            self.late_error=False
        super().interrupt(uc,number,unused)


def test_different_valid_request_after_derivation_cannot_replace_accepted_request(observed_image,commit_owner_base):
    files,paths,_,_=fresh(commit_owner_base,"amount",12,{"recipient":1,"value":3})
    alternative,altpaths,_,_=fresh(commit_owner_base,"amount",12,{"recipient":1,"value":4})
    assert paths==altpaths
    token=str(Path(paths[0]).with_suffix(".GRA"))
    # Independently prove the substituted request is a valid native action,
    # rather than using a malformed-wire rejection as the identity control.
    control=RewardDiskMachine(observed_image,alternative)
    assert submit(control,paths)==(False,1) and not control.handles
    changed=AcceptanceObserver(observed_image,files,replacement=(token,alternative[token]))
    assert submit(changed,paths)[0]
    snapshot=changed.disk_snapshot()
    assert changed.changed_files==[token]
    assert snapshot[token]==alternative[token]
    for path,body in files.items():
        if path!=token: assert snapshot[path]==body
    assert str(Path(paths[0]).with_suffix(".GRT")) in snapshot
    assert str(Path(paths[0]).with_suffix(".GRJ")) not in snapshot
    assert not any(e["ax"]>>8 in (0x56,0x41) for e in changed.events)
    assert not changed.handles


def test_late_fs_source_read_error_after_mismatch_is_not_changed_success(observed_image,commit_owner_base):
    files,paths,_,_=fresh(commit_owner_base,"amount",12,{"recipient":1,"value":3})
    m=AcceptanceObserver(observed_image,files,late_error=True)
    assert submit(m,paths)==(True,22)
    assert m.in_compare and m.saw_mismatch and m.injected_at is not None
    fault=m.events[m.injected_at-1]
    assert fault["ax"]>>8==0x3f and fault["carry"] and fault["result"]==5
    assert m.disk_snapshot()==files and not m.mutations and not m.handles
