"""DOS execution of the streaming removal module, including I/O failure recovery."""
from pathlib import Path
import shutil
import struct
import subprocess

import pytest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT/'native/cokremove-test.ps1'


def _damage_fixture():
    from tools.cok_item_removal_oracle import load
    table = load(ROOT/'Champions of Krynn')[2]
    body = bytearray((ROOT/'Champions of Krynn/SAVE/CHRDATA1.SAV').read_bytes())

    def item(type_, kind=0, ready=0, cursed=0, marker=0, ident=23):
        raw = bytearray(63)
        raw[46], raw[49], raw[52], raw[54], raw[61], raw[62] = type_, marker, ready, cursed, ident, 128+kind
        raw[55:59] = struct.pack('<HH', 17, 2)
        return bytes(raw)

    def effect(kind=23, applied=1, flags=0):
        return struct.pack('<BHBBI', kind, 17, flags, applied, 0)

    return table, bytes(body), item(39, ready=1, ident=7), effect(7, 1, 0)


@pytest.mark.parametrize('prior_status,damage', [(1, 10), (2, 0), (4, 5), (6, 0)])
def test_cm_authorize_output_rejects_nonzero_prior_status(prior_status, damage):
    """2026-09-09 adversarial-review fix, proven against the real assembled
    binary (Unicorn, no DOSBox): retail E6:0xA7 has two mechanisms keyed on
    the prior status byte (a second route to status 6, and a post-hoc
    {0,1}-membership gate -- see tools.test_cok_effect7_damage_consumer's
    prior-status-axis tests for the retail ground truth) that
    cm_authorize_output's arithmetic did not reproduce. Rather than
    reimplement that state machine unverified, native/src/cokremove.inc now
    rejects (falls to cm_bad) any write-present GBOC record whose target's
    prior status is not exactly 0. This test exercises the real assembled
    cm_authorize_output routine directly, not a Python reimplementation.
    """
    pytest.importorskip('unicorn')
    from tools.cok_native_removal import destroy, gboc_raw, gboc_fold
    from tools.cok_item_removal import RemovalError
    table, body, damage_item, damage_effect = _damage_fixture()
    mutated = bytearray(body)
    mutated[392] = prior_status
    gboc = gboc_raw(draws=1, rng_before=1000, rng_after=gboc_fold(1000, 1), damage=damage)
    with pytest.raises(RemovalError):
        destroy(bytes(mutated), [damage_item], [damage_effect], table, 39, gboc=gboc, gbef_rng=1000)


def test_cm_authorize_output_still_accepts_prior_status_zero():
    """Control for the guard above: prior status 0 is the one value this
    routine's arithmetic is proven correct for, and must remain accepted."""
    pytest.importorskip('unicorn')
    from tools.cok_native_removal import destroy, gboc_raw, gboc_fold
    table, body, damage_item, damage_effect = _damage_fixture()
    gboc = gboc_raw(draws=1, rng_before=1000, rng_after=gboc_fold(1000, 1), damage=10)
    result = destroy(body, [damage_item], [damage_effect], table, 39, gboc=gboc, gbef_rng=1000)
    assert (result.body[407], result.body[392], result.body[393]) == (17, 0, 1)


def test_streaming_removal_under_dosbox():
    # Asserted, not skipped: the script is repo content, not an external
    # prerequisite, so a deleted or renamed script must be RED on every
    # machine instead of skipping green where DOSBox is absent.
    assert SCRIPT.exists(), f'{SCRIPT} is missing -- this gate cannot skip that away'
    # The subprocess call below spells the path as a LITERAL so
    # tools/test_native_gate_coverage.py's AST scan can attribute this gate to a
    # script; this equality stops that literal and SCRIPT drifting apart.
    assert SCRIPT == ROOT/'native/cokremove-test.ps1'
    if not (ROOT/'The Dark Queen of Krynn/DOSBOX/DOSBox.exe').exists():
        pytest.skip('held DOSBox unavailable')
    if not shutil.which('pwsh'):
        pytest.skip('PowerShell unavailable')
    result = subprocess.run(['pwsh', '-NoProfile', '-File', str(ROOT/'native/cokremove-test.ps1')],
                            cwd=ROOT, capture_output=True, text=True, timeout=120)
    assert result.returncode == 0, result.stdout+result.stderr
    assert 'PASS: 394 DOS removal cases' in result.stdout
