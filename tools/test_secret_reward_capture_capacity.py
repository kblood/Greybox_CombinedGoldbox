"""Unused pre-overlay intermediate remains a strict, unexecuted capacity negative."""
import pytest
from tools.test_secret_reward_recovery import recovery_image


def test_unused_recovery_intermediate_is_not_executable(tmp_path_factory):
    class Factory:
        def mktemp(self,name):
            self.path=tmp_path_factory.mktemp(name)
            return self.path
    factory=Factory()
    with pytest.raises(AssertionError):
        recovery_image.__wrapped__(factory,caller_defines=())
    raw=(factory.path/"probe.bin").read_bytes()
    assert len(raw)+256>65536
    # This test instantiates no emulator and grants no resident-limit waiver.
