"""Original complete WHO execution, identity navigation and device boundaries."""
import pytest
from pathlib import Path
import hashlib
from tools.secret_melee_oracle import load, DEFAULT_ROOT, Machine
from tools.secret_player_oracle import PlayerMachine
from tools.secret_who_oracle import WhoMachine, HANDLER, INPUT
from tools.secret_continuation import source_member


@pytest.fixture(scope='module')
def retail():
    return load()


@pytest.fixture(scope='module')
def bodies(retail):
    files = {p.name:p.read_bytes() for p in DEFAULT_ROOT.glob('CHRDATA*.*')
             if p.suffix.upper() in ('.SAV','.STF','.SFX')}
    return tuple(PlayerMachine(retail,files).load_player(f'CHRDATA{i}.SAV').body
                 for i in range(1,7))


def test_video_relocation_preserves_original_procedures_and_device_arena(retail):
    normal, ui = Machine(retail), Machine(retail,video_safe=True)
    assert any(start < 0xb0000 and end > 0xa0000 for start,end in normal.code_ranges)
    assert all(end <= 0xa0000 or start >= 0xc0000 for start,end in ui.code_ranges)
    # Non-call instruction bytes are unchanged. Relocated calls remain the
    # same original targets under their declared source file coordinates.
    for offset in (HANDLER, INPUT,0x3b7f3,0x38915):
        assert bytes(normal.uc.mem_read(normal.location(offset),8)) == bytes(ui.uc.mem_read(ui.location(offset),8))


@pytest.mark.parametrize('start,keys,expected', [
    (0,(0x1c0d,),0),(2,(0x1c0d,),2),
    (0,(0x5000,0x1c0d),1),(2,(0x5000,0x1c0d),0),
    (0,(0x4800,0x1c0d),2),(2,(0x4800,0x1c0d),1),
    (0,(0x5000,0x5000,0x1c0d),2),
    (0,(0x0332,0x1c0d),1),(0,(0x0938,0x1c0d),2),
    (1,(0x011b,0x1c0d),1),
])
def test_complete_original_who_returns_selected_identity(retail,bodies,start,keys,expected):
    machine = WhoMachine(retail)
    result = machine.who(bodies[:3],keys,selected=start)
    assert result.selected == expected and result.pc == 0x8003
    assert machine.location(INPUT) in result.visited
    assert machine.location(0x3b7f3) in result.visited
    assert machine.location(0x38915) in result.visited
    assert not result.data_changes & {0xa4d4,0x7d3c,0x7d3d,0x7d3e,0x7d3f,0x599c,0x8dc7}
    assert sum(event.get('interrupt') == 0x16 and event['ax'] >> 8 == 0 for event in result.events) == len(keys)


@pytest.mark.parametrize('mode',[0,2,3,6])
def test_declared_view_modes_preserve_navigation(retail,bodies,mode):
    result = WhoMachine(retail).who(bodies[:3],(0x5000,0x1c0d),view_mode=mode)
    assert result.selected == 1 and result.pc == 0x8003


def test_escape_does_not_cancel_or_exit_actual_who_caller(retail,bodies):
    machine = WhoMachine(retail)
    with pytest.raises(AssertionError,match='exhausted the declared keyboard'):
        machine.who(bodies[:3],(0x011b,),selected=1)


@pytest.mark.parametrize('keys,expected',[
    ((0x1c0d,),None),((0x5000,0x1c0d),0),((0x4800,0x1c0d),2),
])
def test_null_current_actor_is_not_inferred_as_first_member(retail,bodies,keys,expected):
    result = WhoMachine(retail).who(bodies[:3],keys,selected=None)
    assert result.selected == expected and result.pc == 0x8003


@pytest.mark.parametrize('field,value',[(437,0),(423,255),(424,255)])
def test_declared_members_remain_navigable_without_inferred_eligibility(retail,bodies,field,value):
    changed = bytearray(bodies[1]); changed[field] = value
    result = WhoMachine(retail).who((bodies[0],bytes(changed),bodies[2]),(0x5000,0x1c0d))
    assert result.selected == 1


@pytest.mark.parametrize('area,offset,packed_length',[
    (49,0xa2a,19),(49,0xf77,9),(49,0x160d,9),(50,0x11b8,9),
    (51,0x11d4,9),(64,0x1bed,19),(65,0x1cfd,19),(66,0x1c7f,19),
    (96,0x1a9e,19),(97,0x60c,16),(97,0x1574,19),(98,0xf1d,18),
    (98,0xfc4,18),(98,0x130f,19),(98,0x19cf,17),
])
def test_actual_held_prompt_operands_execute_complete_dos_who(retail,bodies,area,offset,packed_length):
    archive = Path(r'D:\Games\Emulator\Amiga\WHDLoad\WHDLoadPacks\WHDLoad Collection\Games-WHDLoad\unpacked\SecretOfTheSilverBlades\data\DISK2\ECL.GLB')
    if not archive.is_file():
        pytest.skip('held Secret Amiga GLIB unavailable')
    source = archive.read_bytes()
    assert hashlib.sha256(source).hexdigest() == '8c247ad1e1acceb02061197ea6745f5e090189a77dd8295f61b30ef90f390d12'
    member = source_member(source,area)
    assert member[offset:offset+3] == bytes([0x39,0x80,packed_length])
    result = WhoMachine(retail).who(bodies,selected=5,
                                  prompt=member[offset+3:offset+3+packed_length])
    assert result.selected == 5 and result.pc == 0x8003+packed_length


def test_complete_original_helper_drains_queued_keys_after_each_input(retail,bodies):
    machine=WhoMachine(retail)
    result=machine.who(bodies[:3],(0x5000,0x5000,0x1c0d),selected=0,
                      queued_after=((0x1c0d,0x5000),(),()))
    assert result.selected==2 and result.pc==0x8003
    assert machine.location(0x3de88) in result.visited
    assert not machine.buffered_words
    assert sum(e.get('interrupt')==0x16 and e['ax']>>8==0 for e in result.events)==5
