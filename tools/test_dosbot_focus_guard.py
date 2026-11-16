"""Source contract for default-deny legacy DOSBox desktop activation."""

from __future__ import annotations

import re
import unittest
from pathlib import Path


LIB = Path(__file__).with_name("dosbot") / "lib.ps1"


def function_body(source: str, name: str) -> str:
    match = re.search(rf"(?im)^function\s+{re.escape(name)}\s*\{{", source)
    if not match:
        raise AssertionError(f"missing PowerShell function {name}")
    next_function = re.search(r"(?im)^function\s+\S+\s*\{", source[match.end() :])
    end = match.end() + next_function.start() if next_function else len(source)
    return source[match.end() : end]


class DosbotFocusGuardTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.source = LIB.read_text(encoding="utf-8")

    def test_launch_fails_closed_before_start_process(self) -> None:
        guard = function_body(self.source, "Assert-DosboxDesktopFocusOptIn")
        self.assertIn("$env:GOLDBOX_ALLOW_DOSBOX_DESKTOP_FOCUS -cne \"1\"", guard)
        self.assertIn("throw", guard)

        launch = function_body(self.source, "Start-DosboxConf")
        self.assertLess(
            launch.index("Assert-DosboxDesktopFocusOptIn"),
            launch.index("Start-Process"),
        )

    def test_focus_taking_input_helpers_check_opt_in_first(self) -> None:
        cases = {
            "Capture-DosboxNative": "[DosBotWin32]::ForceFocus",
            "Send-DosKeys": "[DosBotWin32]::ForceFocus",
            "Send-DosText": "[DosBotWin32]::ForceFocus",
            "Send-DosChord": "[DosBotWin32]::ForceFocus",
            "Click-DosWindow": "[DosBotWin32]::ForceFocus",
            "Click-DosboxMenuItem": "[DosBotWin32]::ForceFocus",
            "Send-DosboxHostAltPause": "[DosBotWin32]::ForceFocus",
        }
        for name, operation in cases.items():
            with self.subTest(function=name):
                body = function_body(self.source, name)
                self.assertLess(
                    body.index("Assert-DosboxDesktopFocusOptIn"),
                    body.index(operation),
                )

    def test_foreground_capture_fallback_checks_opt_in_after_printwindow(self) -> None:
        body = function_body(self.source, "Capture-DosboxWindow")
        self.assertLess(body.index("Save-DosboxPrintWindow"), body.index("Assert-DosboxDesktopFocusOptIn"))
        self.assertLess(
            body.index("Assert-DosboxDesktopFocusOptIn"),
            body.index("[DosBotWin32]::SetForegroundWindow"),
        )


if __name__ == "__main__":
    unittest.main()
