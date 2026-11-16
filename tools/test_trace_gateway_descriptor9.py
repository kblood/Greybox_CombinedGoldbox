from __future__ import annotations

import subprocess
import tempfile
import unittest
from pathlib import Path


REPO = Path(__file__).resolve().parent.parent
SCRIPT = REPO / "tools" / "trace_gateway_descriptor9.ps1"


class TraceGatewayDescriptor9Tests(unittest.TestCase):
    def test_absolute_existing_output_stops_before_launch(self) -> None:
        with tempfile.TemporaryDirectory(dir=REPO / "build") as directory:
            output = Path(directory).resolve()
            result = subprocess.run(
                ["pwsh", "-NoProfile", "-File", str(SCRIPT), "-OutDir", str(output)],
                cwd=REPO,
                text=True,
                capture_output=True,
                timeout=15,
                check=False,
            )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(f"output directory already exists: {output}", result.stderr)
        self.assertNotIn(f"{REPO}\\{output}", result.stderr)

    def test_harness_is_silent_input_free_and_profile_scoped(self) -> None:
        text = SCRIPT.read_text(encoding="utf-8")
        self.assertIn("-NoInitialScreenshots -NoActionScreenshots", text)
        self.assertIn("input_sent = $false", text)
        self.assertIn("screenshots_captured = $false", text)
        self.assertIn("--profile gateway-to-the-savage-frontier", text)
        self.assertNotIn("gamelink.py press", text.lower())


if __name__ == "__main__":
    unittest.main()
