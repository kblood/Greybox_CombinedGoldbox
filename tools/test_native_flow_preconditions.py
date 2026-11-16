"""Portable contracts for native flow scripts' DOSBox and source-data prerequisites.

Every flow that launches DOSBox must exit 0 with a visible ``SKIP:`` line when
the emulator is absent.  This runs each script from a temporary miniature
repository with no retail games and no DOSBox executable.  Reaching a build or
any later game-data assertion is therefore a failure of the early guard.

The sole synthetic flow, ``gbbroader-flow-test.ps1``, is deliberately exempt
from the data case.  Every other roster entry is run with a placeholder
DOSBox executable and no game data, and must return a visible ``SKIP:`` before
NASM can run.
"""

from __future__ import annotations

import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
NATIVE = REPO_ROOT / "native"
TEST_PS1 = NATIVE / "test.ps1"
DATA_GUARDED_SCRIPTS = (
    "gbmatrix-flow-test.ps1",
    "gbpools-flow-test.ps1",
    "gbtreasures-flow-test.ps1",
    "gbgateway-dos-flow-test.ps1",
    "ccecl-pools-flow-test.ps1",
    "ccecl-treasures-flow-test.ps1",
    "gbintro-flow-test.ps1",
    "gbcok-playable-flow-test.ps1",
    "gbcombat-icon-flow-test.ps1",
    "gbscene-dos-flow-test.ps1",
    "gbboot-create-test.ps1",
    "gbflow-test.ps1",
    "gbdok-intro-flow-test.ps1",
    "gbdok-create-test.ps1",
    "gbdok-flow-test.ps1",
    "gbdok-camp-rest-flow-test.ps1",
    "gbdok-journal-flow-test.ps1",
    "gbdok-playable-flow-test.ps1",
    "gbdqk-combat-flow-test.ps1",
    "gbdqk-intro-flow-test.ps1",
    "gbdqk-dispatch-flow-test.ps1",
    "gbdqk-npc-join-test.ps1",
    "gbdqk-multistep-flow-test.ps1",
    "gbdqk-create-test.ps1",
    "gbdqk-playable-flow-test.ps1",
    "gbdqk-flow-test.ps1",
    "gbdqk-area2-menu-flow-test.ps1",
    "gbbuck-flow-test.ps1",
    "gbnwn-flow-test.ps1",
    "gbcoab-flow-test.ps1",
    "ccecl-dqk-vmrun-test.ps1",
    "ccecl-dqk-combat-test.ps1",
    "ccecl-dok-combat-gap-test.ps1",
    "ccecl-dok-thief-matrix-test.ps1",
    "ccecl-dok-static-combat-scan.ps1",
    "ccecl-dok-b51-watch-test.ps1",
    "cgb-gbim-test.ps1",
    "ccfp-encounter-art-test.ps1",
    "gbfp-encounter-dos-test.ps1",
    "gbsecret-glib-combat-flow-test.ps1",
    "gbdqk-amiga-glib-flow-test.ps1",
    "gbpool-flow-test.ps1",
    "gbsecret-hlib-flow-test.ps1",
    "gbsecret-glib-flow-test.ps1",
    "gbgateway-glib-flow-test.ps1",
)


def flow_scripts() -> list[Path]:
    text = TEST_PS1.read_text(encoding="utf-8")
    match = re.search(r"\$flowScripts\s*=\s*@\((.*?)\n\)", text, re.DOTALL)
    if not match:
        raise AssertionError("native/test.ps1 no longer declares $flowScripts")
    names = re.findall(r'"([^"\r\n]+\.ps1)"', match.group(1))
    return [NATIVE / name for name in names]


class NativeFlowPreconditionsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.pwsh = shutil.which("pwsh") or shutil.which("powershell")
        if not cls.pwsh:
            raise unittest.SkipTest("pwsh is not available")

    def run_without_dosbox(self, script: Path, *, mutate: bool = False) -> subprocess.CompletedProcess[str]:
        with tempfile.TemporaryDirectory(prefix="goldbox-flow-preconditions-") as raw:
            root = Path(raw)
            native = root / "native"
            native.mkdir()
            target = native / script.name
            text = script.read_text(encoding="utf-8")
            if mutate:
                text, count = re.subn(
                    r"\r?\nif \(-not \(Test-Path -LiteralPath \$dosbox\)\) \{"
                    r"\r?\n  Write-Output 'SKIP: [^\r\n]+'"
                    r"\r?\n  exit 0"
                    r"\r?\n\}",
                    "",
                    text,
                    count=1,
                )
                self.assertEqual(1, count, f"could not remove {script.name}'s DOSBox skip guard")
            target.write_text(text, encoding="utf-8")
            # Some scripts load this helper before testing $dosbox.  It is
            # copied only so execution can reach the prerequisite guard.
            shutil.copy2(NATIVE / "retail-stage.ps1", native / "retail-stage.ps1")
            shutil.copy2(NATIVE / "dosbox-smoke.ps1", native / "dosbox-smoke.ps1")
            if (NATIVE / "ccecl-short2-common.ps1").exists():
                shutil.copy2(NATIVE / "ccecl-short2-common.ps1", native / "ccecl-short2-common.ps1")
            if script.name in {"gbdqk-combat-flow-test.ps1", "gbdqk-playable-flow-test.ps1"}:
                shutil.copy2(NATIVE / "dqk-combat-oracle.ps1", native / "dqk-combat-oracle.ps1")
            if mutate and script.name == "gbintro-flow-test.ps1":
                game = root / "Champions of Krynn"
                game.mkdir()
                for name in (
                    "KRYNN.CFG",
                    "TITLE.DAX",
                    "ECL1.DAX",
                    "GEO1.DAX",
                    "WALLDEF1.DAX",
                    "8X8D1.DAX",
                ):
                    (game / name).touch()
            return subprocess.run(
                [self.pwsh, "-NoProfile", "-File", str(target)],
                cwd=root,
                capture_output=True,
                text=True,
                timeout=30,
            )

    def run_without_data(self, script: Path, *, mutate: bool = False) -> subprocess.CompletedProcess[str]:
        with tempfile.TemporaryDirectory(prefix="goldbox-flow-data-preconditions-") as raw:
            root = Path(raw)
            native = root / "native"
            native.mkdir()
            target = native / script.name
            text = script.read_text(encoding="utf-8")
            if mutate:
                text, count = re.subn(
                    r"if \(-not \(Test-Path \(Join-Path \$source \$name\)\)\) \{",
                    "if ($false) {",
                    text,
                    count=1,
                )
                self.assertEqual(1, count, f"could not disable {script.name}'s retail-data skip guard")
            target.write_text(text, encoding="utf-8")
            shutil.copy2(NATIVE / "retail-stage.ps1", native / "retail-stage.ps1")
            shutil.copy2(NATIVE / "dosbox-smoke.ps1", native / "dosbox-smoke.ps1")
            if (NATIVE / "ccecl-short2-common.ps1").exists():
                shutil.copy2(NATIVE / "ccecl-short2-common.ps1", native / "ccecl-short2-common.ps1")
            if script.name in {"gbdqk-combat-flow-test.ps1", "gbdqk-playable-flow-test.ps1"}:
                shutil.copy2(NATIVE / "dqk-combat-oracle.ps1", native / "dqk-combat-oracle.ps1")
            dosbox = root / "The Dark Queen of Krynn" / "DOSBOX" / "DOSBox.exe"
            dosbox.parent.mkdir(parents=True)
            dosbox.touch()
            args = [self.pwsh, "-NoProfile", "-File", str(target)]
            optional_data = root / "optional-data"
            optional_data.mkdir()
            if script.name == "gbbuck-flow-test.ps1":
                args.extend(["-BuckPath", str(optional_data)])
            elif script.name == "gbnwn-flow-test.ps1":
                args.extend(["-NwnPath", str(optional_data)])
            elif script.name == "gbdqk-amiga-glib-flow-test.ps1":
                args.extend(["-DqkAmigaPath", str(optional_data)])
            elif script.name == "gbpool-flow-test.ps1":
                args.extend(["-PoolPath", str(optional_data)])
            elif script.name in {"gbsecret-hlib-flow-test.ps1", "gbsecret-glib-flow-test.ps1",
                                 "gbsecret-glib-combat-flow-test.ps1"}:
                args.extend(["-SecretPath", str(optional_data)])
            elif script.name == "gbgateway-glib-flow-test.ps1":
                args.extend(["-GatewayPath", str(optional_data)])
            elif script.name in {"ccecl-pools-flow-test.ps1", "ccecl-treasures-flow-test.ps1",
                                 "gbpools-flow-test.ps1", "gbtreasures-flow-test.ps1",
                                 "gbgateway-dos-flow-test.ps1"}:
                args.extend(["-GogPath", str(optional_data)])
            return subprocess.run(
                args,
                cwd=root,
                capture_output=True,
                text=True,
                timeout=30,
            )

    def test_each_dosbox_flow_skips_before_build_when_emulator_is_absent(self) -> None:
        scripts = [script for script in flow_scripts() if re.search(r"dosbox", script.read_text(encoding="utf-8"), re.IGNORECASE)]
        self.assertEqual(45, len(scripts), "flow roster changed; audit its DOSBox contract")
        for script in scripts:
            with self.subTest(script=script.name):
                run = self.run_without_dosbox(script)
                output = (run.stdout or "") + (run.stderr or "")
                self.assertEqual(0, run.returncode, output)
                self.assertRegex(output, r"(?m)^SKIP: .*DOSBox\.exe absent", output)
                self.assertNotIn("nasm -f bin", output, output)

    def test_removing_a_guard_does_not_stay_green(self) -> None:
        run = self.run_without_dosbox(NATIVE / "gbintro-flow-test.ps1", mutate=True)
        output = (run.stdout or "") + (run.stderr or "")
        self.assertNotEqual(0, run.returncode, output)

    def test_audited_flows_skip_before_build_when_retail_data_is_absent(self) -> None:
        self.assertEqual(
            {script.name for script in flow_scripts()} - {"gbbroader-flow-test.ps1"},
            set(DATA_GUARDED_SCRIPTS),
            "flow roster changed; classify its source-data prerequisite",
        )
        for name in DATA_GUARDED_SCRIPTS:
            with self.subTest(script=name):
                run = self.run_without_data(NATIVE / name)
                output = (run.stdout or "") + (run.stderr or "")
                self.assertEqual(0, run.returncode, output)
                self.assertRegex(output, r"(?m)^SKIP(?: ARM)?:", output)
                self.assertNotIn("nasm -f bin", output, output)

    def test_removing_a_data_guard_does_not_stay_green(self) -> None:
        run = self.run_without_data(NATIVE / "gbdqk-combat-flow-test.ps1", mutate=True)
        output = (run.stdout or "") + (run.stderr or "")
        self.assertNotEqual(0, run.returncode, output)


if __name__ == "__main__":
    unittest.main()
