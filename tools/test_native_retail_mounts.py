"""Keep selected native DOSBox scripts from mounting source data writable.

These scripts decode their source data on the host, then make the DOS D: mount
current.  A raw source mount therefore lets transient DOS files modify retail
or never-vendored data.  The invariant is structural: source paths may be
read, but the DOSBox configuration must mount a named New-RetailStage mirror.
"""
from __future__ import annotations

import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
NATIVE = ROOT / "native"


def assert_staged_d_mount(source: str, source_var: str, mount_var: str, stage_name: str) -> None:
    """Assert the one source-to-stage-to-D: path, with no raw-source mount."""
    helper = r"retail-stage\.ps1"
    stage = re.compile(
        rf"\${re.escape(mount_var)}\s*=\s*New-RetailStage\s+"
        rf"-Source\s+\${re.escape(source_var)}\s+-Name\s+['\"]{re.escape(stage_name)}['\"]"
    )
    raw_mount = re.compile(rf'mount D "\${re.escape(source_var)}"')
    staged_mount = re.compile(rf'mount D "\${re.escape(mount_var)}"')

    if not re.search(helper, source):
        raise AssertionError("script does not load native/retail-stage.ps1")
    if not stage.search(source):
        raise AssertionError("script does not create the named New-RetailStage mirror")
    if raw_mount.search(source):
        raise AssertionError("script still mounts the source path as DOS D:")
    if not staged_mount.search(source):
        raise AssertionError("script does not mount its staged path as DOS D:")


class NativeRetailMountTests(unittest.TestCase):
    def test_buck_chained_scan_mounts_a_stage(self) -> None:
        assert_staged_d_mount(
            (NATIVE / "ccecl-buck-chained-step-scan.ps1").read_text(encoding="utf-8"),
            "BuckPath", "buckMount", "buck-chained-step-scan",
        )

    def test_nwn_chained_scan_mounts_a_stage(self) -> None:
        assert_staged_d_mount(
            (NATIVE / "ccecl-nwn-chained-step-scan.ps1").read_text(encoding="utf-8"),
            "NwnPath", "nwnMount", "nwn-chained-step-scan",
        )

    def test_cc_games_mounts_a_stage(self) -> None:
        source = (NATIVE / "cc-games.ps1").read_text(encoding="utf-8")
        self.assertRegex(source, r"\$gameMount\s*=\s*New-RetailStage\s+-Source\s+\$gameDir\s+-Name\s+\$stageName")
        self.assertNotRegex(source, r'mount D "\$gameDir"')
        self.assertRegex(source, r'mount D "\$gameMount"')
        self.assertRegex(source, r"retail-stage\.ps1")

    def test_guard_rejects_a_raw_source_mount(self) -> None:
        source = """
        . (Join-Path $native 'retail-stage.ps1')
        $buckMount = New-RetailStage -Source $BuckPath -Name 'buck-chained-step-scan'
        mount D "$BuckPath"
        """
        with self.assertRaisesRegex(AssertionError, "source path"):
            assert_staged_d_mount(source, "BuckPath", "buckMount", "buck-chained-step-scan")


if __name__ == "__main__":
    unittest.main()
