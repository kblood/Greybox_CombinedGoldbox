"""Host composition/launcher controls; real native producers are tested by Luna."""
from pathlib import Path
from pathlib import PureWindowsPath
import hashlib
import json
import re
import shutil
import struct
import subprocess

import pytest

ROOT=Path(__file__).resolve().parents[1]
PWSH=shutil.which('pwsh')
pytestmark=pytest.mark.skipif(PWSH is None,reason='PowerShell7 required')
HELPER=ROOT/'native/secret-player-session.ps1'
LAUNCHER=ROOT/'native/run-goldbox.ps1'

def quote(value):return "'"+str(value).replace("'","''")+"'"

def run_ps(code,cwd=None):
    result=subprocess.run([PWSH,'-NoProfile','-NonInteractive','-Command',
        "$ErrorActionPreference='Stop'; . "+quote(HELPER)+'; '+code],cwd=cwd or ROOT,capture_output=True,text=True,timeout=90)
    return result

def checked(code,cwd=None):
    result=run_ps(code,cwd);assert result.returncode==0,result.stdout+result.stderr
    return json.loads(result.stdout)

def glib(area=16):
    body=bytes(20)+b'\0'
    return b'GLIB'+struct.pack('>IHBB',34+len(body),2,0,1)+b'DATA'+struct.pack('>3I3H',28,34,34+len(body),1,area,1)+body

@pytest.fixture
def inputs(tmp_path):
    amiga,dos,sessions=tmp_path/'Amiga source',tmp_path/'DOS source',tmp_path/'sessions'
    for name in ('ECL','GEO','MONCHA','MONITM','MONSPC'):
        path=amiga/'DISK2'/f'{name}.GLB';path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(glib())
    (amiga/'DISK1').mkdir();(amiga/'DISK1/ITEMS.DAT').write_bytes(bytes(2048))
    dos.mkdir()
    for slot in range(1,7):
        raw=bytearray(439);raw[:9]=b'\x08UNITTEST';raw[112]=10;raw[437]=8
        (dos/f'CHRDATA{slot}.SAV').write_bytes(raw)
    (dos/'CHRDATA1.SFX').write_bytes(bytes(9))
    return amiga,dos,sessions

def args(inputs):return ' -AmigaSource '+quote(inputs[0])+' -DosSource '+quote(inputs[1])+' -SessionRoot '+quote(inputs[2])

def create(inputs):return checked('New-SecretPlayerSession'+args(inputs)+' | ConvertTo-Json -Compress')

def fingerprint(root):return {str(p.relative_to(root)):(p.stat().st_mtime_ns,hashlib.sha256(p.read_bytes()).hexdigest()) for p in root.rglob('*') if p.is_file()}

@pytest.mark.parametrize('fault',['size','method','kind','chunk','pointer','missing-area','oversize-area','catalogue','sav-size','hp','level','sfx','stf','children','missing-mon','missing-sav'])
def test_first_copy_rejects_bad_format_before_any_persistent_write(inputs,fault):
    amiga,dos,sessions=inputs;path=amiga/'DISK2/ECL.GLB';raw=bytearray(path.read_bytes())
    if fault=='size':raw[7]^=1
    elif fault=='method':raw[10]=1
    elif fault=='kind':raw[11]=2
    elif fault=='chunk':raw[12:16]=b'NOPE'
    elif fault=='pointer':struct.pack_into('>I',raw,20,27)
    elif fault=='missing-area':raw[:]=glib(17)
    elif fault=='oversize-area':
        raw+=bytes(16000);struct.pack_into('>I',raw,4,len(raw));struct.pack_into('>I',raw,24,len(raw))
    elif fault=='catalogue':(amiga/'DISK1/ITEMS.DAT').write_bytes(bytes(2047))
    elif fault=='sav-size':(dos/'CHRDATA1.SAV').write_bytes(bytes(438))
    elif fault in ('hp','level'):
        p=dos/'CHRDATA1.SAV';body=bytearray(p.read_bytes());body[437 if fault=='hp' else 273]=19;p.write_bytes(body)
    elif fault=='sfx':(dos/'CHRDATA1.SFX').write_bytes(bytes(8))
    elif fault=='stf':(dos/'CHRDATA1.STF').write_bytes(bytes(66))
    elif fault=='children':
        body=bytearray(67);body[46]=73;body[57]=1;(dos/'CHRDATA1.STF').write_bytes(body)
    elif fault=='missing-mon':(amiga/'DISK2/MONSPC.GLB').unlink()
    elif fault=='missing-sav':(dos/'CHRDATA6.SAV').unlink()
    path.write_bytes(raw);before=(fingerprint(amiga),fingerprint(dos))
    result=run_ps('New-SecretPlayerSession'+args(inputs))
    assert result.returncode!=0 and not sessions.exists()
    assert before==(fingerprint(amiga),fingerprint(dos))

def test_complete_snapshot_never_refreshes_sources_or_borrows_authority(inputs):
    amiga,dos,_=inputs
    for path in (amiga/'DISK2/P1.GBP',dos/'_GBPARTY.GSK',dos/'OWNER.BIN',dos/'REQUEST.BIN'):
        path.write_bytes(b'borrowed authority must not be copied')
    before=(fingerprint(amiga),fingerprint(dos));session=create(inputs);mount=Path(session['GameMount'])
    assert before==(fingerprint(amiga),fingerprint(dos))
    assert len(list(mount.rglob('*.*')))==13 # six Amiga + six SAV + one SFX
    assert not list(mount.rglob('*.GSK')) and not list(mount.rglob('P1.GBP')) and not list(mount.rglob('OWNER.BIN'))
    runtime=Path(session['RuntimeMount']);runtime.mkdir();(runtime/'_GBPARTY.GBP').write_bytes(b'current owned party')
    original=fingerprint(mount)
    (amiga/'DISK2/ECL.GLB').write_bytes(b'changed retail source')
    (dos/'CHRDATA1.SAV').write_bytes(b'changed retail actor')
    assert create(inputs)==session and fingerprint(mount)==original

@pytest.mark.parametrize('candidate',['GSK','GKB','GKT'])
def test_resume_locates_each_native_candidate_without_creating_or_decoding(inputs,candidate):
    before=(fingerprint(inputs[0]),fingerprint(inputs[1]))
    result=run_ps('Get-ExistingSecretPlayerSession'+args(inputs)+' -RequireContinuation')
    assert result.returncode!=0 and not inputs[2].exists()
    session=create(inputs);runtime=Path(session['RuntimeMount']);runtime.mkdir()
    result=run_ps('Get-ExistingSecretPlayerSession'+args(inputs)+' -RequireContinuation')
    assert result.returncode!=0 and not list(runtime.iterdir())
    # Presence permits dispatch, never claims that this diagnostic is authority.
    (runtime/f'_GBPARTY.{candidate}').write_bytes(b'invalid candidate for native rejection')
    snapshot=fingerprint(Path(session['GameMount']))
    found=checked('Get-ExistingSecretPlayerSession'+args(inputs)+' -RequireContinuation | ConvertTo-Json -Compress')
    assert found==session and fingerprint(Path(session['GameMount']))==snapshot
    assert before==(fingerprint(inputs[0]),fingerprint(inputs[1]))

@pytest.mark.parametrize('fault',['absent','json','schema','root','array-root','array-layout','unknown-field'])
def test_incomplete_or_mismatched_completion_never_repairs_played_state(inputs,fault):
    session=create(inputs);marker=Path(session['Marker']);mount=Path(session['GameMount']);sentinel=mount/'played';sentinel.write_bytes(b'played')
    record=json.loads(marker.read_text())
    if fault=='absent':marker.unlink()
    elif fault=='json':marker.write_text('{')
    else:
        if fault=='schema':record['Schema']='future/2'
        elif fault=='root':record['DosSourceRoot']='foreign'
        elif fault=='array-root':record['AmigaSourceRoot']=[record['AmigaSourceRoot']]
        elif fault=='array-layout':record['RuntimeDirectory']=['GREYBOX']
        else:record['Unknown']=1
        marker.write_text(json.dumps(record))
    snapshot=fingerprint(mount);marker_bytes=marker.read_bytes() if marker.exists() else None
    for verb in ('New-SecretPlayerSession','Get-ExistingSecretPlayerSession'):
        result=run_ps(verb+args(inputs));assert result.returncode!=0
        assert fingerprint(mount)==snapshot and (marker.read_bytes() if marker.exists() else None)==marker_bytes

def test_pair_identity_uses_both_roots_and_relative_ps_location(inputs,tmp_path):
    session=create(inputs)
    second=tmp_path/'another'/'DOS source';shutil.copytree(inputs[1],second)
    other=create((inputs[0],second,inputs[2]));assert other['GameMount']!=session['GameMount']
    # PowerShell's current provider location differs from .NET process CWD.
    location=tmp_path/'provider location';location.mkdir()
    code='Set-Location '+quote(location)+'; Get-SecretSessionIdentity -AmigaSource '+quote(inputs[0])+' -DosSource '+quote(inputs[1])+" -SessionRoot 'relative sessions' | ConvertTo-Json -Compress"
    found=checked(code);assert Path(found['GameMount']).parent==location/'relative sessions'

def test_session_inside_either_source_is_rejected_without_writes(inputs):
    for source in inputs[:2]:
        altered=(inputs[0],inputs[1],source/'sessions');before=fingerprint(source)
        result=run_ps('New-SecretPlayerSession'+args(altered));assert result.returncode!=0 and fingerprint(source)==before

@pytest.mark.parametrize('pointers,entries,accepted',[(256,127,True),(257,1,False),(3,128,False)])
def test_ecl_native_pointer_and_member_table_boundaries(inputs,pointers,entries,accepted):
    # Put area16 in the final table row and final addressable member, making
    # native truncation discriminating rather than testing an early row.
    member=pointers-2
    table=struct.pack('>H',entries)+b''.join(struct.pack('>2H',1000+i,member) for i in range(entries-1))+struct.pack('>2H',16,member)
    start=16+4*pointers;body=bytes(20)+b'\0'
    offsets=[start,start+len(table)]+[start+len(table)]*(pointers-3)+[start+len(table)+len(body)]
    raw=b'GLIB'+struct.pack('>IHBB',offsets[-1],pointers-1,0,1)+b'DATA'+struct.pack('>'+'I'*pointers,*offsets)+table+body
    (inputs[0]/'DISK2/ECL.GLB').write_bytes(raw)
    result=run_ps('New-SecretPlayerSession'+args(inputs))
    assert (result.returncode==0)==accepted,result.stderr
    assert inputs[2].exists()==accepted

def test_public_rejections_precede_staging_or_build(inputs):
    base='& '+quote(LAUNCHER)+' -GamePath '+quote(inputs[0])+' -Profile SecretAmiga -SecretDosPath '+quote(inputs[1])+' -SessionRoot '+quote(inputs[2])+' -PrepareOnly'
    for extra in (' -PartyMenu',' -Resume'):
        result=run_ps(base+extra);assert result.returncode!=0 and not inputs[2].exists()
    result=run_ps(base.replace(' -SecretDosPath '+quote(inputs[1]),''));assert result.returncode!=0 and not inputs[2].exists()

def test_generated_guest_call_resolves_an_existing_dos83_batch(inputs):
    code='& '+quote(LAUNCHER)+' -GamePath '+quote(inputs[0])+' -Profile SecretAmiga -SecretDosPath '+quote(inputs[1])+' -SessionRoot '+quote(inputs[2])+" -PrepareOnly 6>$null | Where-Object { $_ -is [pscustomobject] } | Select-Object -Last 1 | ConvertTo-Json -Compress"
    prepared=checked(code)
    config=Path(prepared['Conf']).read_text()
    calls=re.findall(r'(?im)^call\s+(\S+)\s*$',config)
    assert len(calls)==1
    guest=PureWindowsPath(calls[0]);name=guest.name
    assert guest.drive.upper()=='C:' and guest.parent==PureWindowsPath('C:\\')
    assert re.fullmatch(r'[A-Za-z0-9_-]{1,8}\.[A-Za-z0-9]{1,3}',name),name
    runtime=Path(prepared['RuntimeMount']);resolved=runtime/name
    assert resolved.is_file() and resolved==Path(prepared['Batch'])
    assert 'C:\\GBBOOT /E /! /A16 /9 1' in resolved.read_text()

def test_explicit_branch_preserves_auto_registry_and_native_boundaries():
    source=LAUNCHER.read_text();branch=source[source.index("if ($Profile -eq 'SecretAmiga')"):source.index('function Test-RequiredFiles')]
    assert 'Get-ExistingSecretPlayerSession' in branch and '-RequireContinuation' in branch
    assert branch.index('Get-ExistingSecretPlayerSession')<branch.index("'build.ps1'")
    assert "'/5 /! /A16 /9 1'" in branch and "'/E /! /A16 /9 1'" in branch and '/@' not in branch
    assert 'if errorlevel 1 goto failed' in branch and 'NATIVE_FAILURE' in branch and 'NativeFailure=$failure' in branch
    assert 'SecretAmiga' not in (ROOT/'native/goldbox-profile-layout.ps1').read_text()
    assert 'New-PlayerSession' not in HELPER.read_text()
