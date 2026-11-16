import subprocess
import tempfile
import unittest
from pathlib import Path


REPO = Path(__file__).resolve().parent.parent
SCRIPT = REPO / "tools" / "trace_secret_begin_selector.ps1"


class TraceSecretBeginSelectorPathTests(unittest.TestCase):
    def run_with_existing_output(self, output: Path) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [
                "pwsh",
                "-NoProfile",
                "-File",
                str(SCRIPT),
                "-OutDir",
                str(output),
            ],
            cwd=REPO,
            text=True,
            capture_output=True,
            timeout=15,
            check=False,
        )

    def test_absolute_output_path_is_not_prefixed_with_repo(self) -> None:
        with tempfile.TemporaryDirectory(dir=REPO / "build") as directory:
            output = Path(directory).resolve()
            result = self.run_with_existing_output(output)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn(f"output directory already exists: {output}", result.stderr)
        self.assertNotIn(f"{REPO}\\{output}", result.stderr)

    def test_relative_output_path_is_resolved_from_repo(self) -> None:
        with tempfile.TemporaryDirectory(dir=REPO / "build") as directory:
            output = Path(directory).resolve()
            relative = output.relative_to(REPO)
            result = self.run_with_existing_output(relative)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn(f"output directory already exists: {output}", result.stderr)


if __name__ == "__main__":
    unittest.main()
