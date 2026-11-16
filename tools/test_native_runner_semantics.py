"""Exercise native/test.ps1's child-result classification without DOSBox.

The serial runner must not turn a child `exit 7` into a suite pass, and it
must keep an intentional `SKIP:` distinct from PASS. Its self-test writes two
temporary scripts and proves both directions; this test puts that proof in the
normal Python corpus without needing retail data or a DOSBox session.
"""

from pathlib import Path
import shutil
import subprocess

import pytest


ROOT = Path(__file__).resolve().parents[1]
RUNNER = ROOT / "native" / "test.ps1"
FLOW_RUNNER = ROOT / "native" / "run-flow-suite.ps1"


def test_native_runner_classifies_nonzero_and_skip_children_in_every_installed_powershell_host():
    hosts = [host for host in ("powershell", "pwsh") if shutil.which(host)]
    if not hosts:
        pytest.skip("pwsh is unavailable; native runner semantics self-test did not run")
    assert RUNNER.is_file(), f"missing native runner: {RUNNER}"
    for host in hosts:
        result = subprocess.run(
            [host, "-NoProfile", "-File", str(RUNNER), "-SelfTestRunnerSemantics"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=60,
        )
        output = (result.stdout or "") + (result.stderr or "")
        assert result.returncode == 0, f"{host}: {output}"
        assert "SKIP: synthetic optional retail data is absent" in output, f"{host}: {output}"
        assert "synthetic child reached its controlled failure" in output, f"{host}: {output}"
        assert "native runner child-exit and SKIP classification self-test PASS" in output, f"{host}: {output}"


def test_flow_runner_reads_child_exit_codes_in_every_installed_powershell_host():
    hosts = [host for host in ("powershell", "pwsh") if shutil.which(host)]
    if not hosts:
        pytest.skip("no PowerShell host is available for the flow-runner exit-capture self-test")
    assert FLOW_RUNNER.is_file(), f"missing flow runner: {FLOW_RUNNER}"
    for host in hosts:
        result = subprocess.run(
            [host, "-NoProfile", "-File", str(FLOW_RUNNER), "-SelfTestExitCapture"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=60,
        )
        output = (result.stdout or "") + (result.stderr or "")
        assert result.returncode == 0, f"{host}: {output}"
        assert "flow runner exit-capture self-test PASS" in output, f"{host}: {output}"


def test_required_dosbox_is_not_classified_as_an_optional_skip(tmp_path):
    pwsh = shutil.which("pwsh") or shutil.which("powershell")
    if not pwsh:
        pytest.skip("no PowerShell host is available for the required-DOSBox gate test")
    missing = tmp_path / "absent-dosbox.exe"
    env = {**__import__("os").environ, "GOLDBOX_DOSBOX_EXE": str(missing)}

    core = subprocess.run(
        [pwsh, "-NoProfile", "-File", str(RUNNER)],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=30,
        env=env,
    )
    core_output = (core.stdout or "") + (core.stderr or "")
    assert core.returncode != 0, core_output
    assert "Required DOSBox executable is unavailable" in core_output, core_output

    status_path = tmp_path / "flow-status.json"
    flow = subprocess.run(
        [pwsh, "-NoProfile", "-File", str(FLOW_RUNNER), "-Out", str(status_path)],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=30,
        env=env,
    )
    flow_output = (flow.stdout or "") + (flow.stderr or "")
    assert flow.returncode == 0, flow_output
    status = __import__("json").loads(status_path.read_text(encoding="utf-8-sig"))
    assert status["counts"]["fail"] == status["counts"]["total"], flow_output
    assert {item["classification_rule"] for item in status["scripts"]} == {"required-dosbox-unavailable"}
