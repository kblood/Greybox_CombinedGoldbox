"""Closed source admission for the isolated GameLink tool recipe."""
import hashlib
from pathlib import Path

import pytest

import build_dosbox_gamelink as recipe


@pytest.mark.parametrize("data", [b"", recipe.OLD_LINE,
                                   recipe.OLD_LINE + recipe.OLD_LINE,
                                   recipe.NEW_LINE])
def test_foreign_or_already_patched_source_is_rejected(data):
    before = hashlib.sha256(data).digest()
    with pytest.raises(ValueError, match="Unexpected upstream"):
        recipe.patch_source(data)
    assert hashlib.sha256(data).digest() == before


def test_documented_patch_changes_only_tracking_reset():
    patch = Path(__file__).with_name("dosbox-gamelink-mode-change.patch").read_text()
    removed = [row[1:] for row in patch.splitlines() if row.startswith("-") and not row.startswith("---")]
    added = [row[1:] for row in patch.splitlines() if row.startswith("+") and not row.startswith("+++")]
    assert removed == [recipe.OLD_LINE.decode().rstrip("\n")]
    assert added == [recipe.NEW_LINE.decode().rstrip("\n")]
    # These real upstream neighbours discriminate the previously published
    # nonapplicable frame_counter/track/return-Init patch context.
    assert "     bool trackonly_mode = sdl.desktop.want_type != SCREEN_GAMELINK;" in patch
    assert "     int iresult = GameLink::Init(trackonly_mode);" in patch
    assert "     if (iresult != 1) {" in patch
    assert "frame_counter" not in patch and "return GameLink::Init();" not in patch
