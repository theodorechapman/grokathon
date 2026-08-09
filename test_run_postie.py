from __future__ import annotations

import subprocess
import unittest
from unittest import mock

import run_postie


class GrokAuthenticationTests(unittest.TestCase):
    def test_authenticated_models_response(self) -> None:
        response = subprocess.CompletedProcess(["grok", "models"], 0, "Default model: grok-4.5\n")
        with mock.patch.object(run_postie.subprocess, "run", return_value=response):
            self.assertTrue(run_postie.grok_is_authenticated("grok"))

    def test_unauthenticated_models_response(self) -> None:
        response = subprocess.CompletedProcess(
            ["grok", "models"], 0, "You are not authenticated.\n"
        )
        with mock.patch.object(run_postie.subprocess, "run", return_value=response):
            self.assertFalse(run_postie.grok_is_authenticated("grok"))


if __name__ == "__main__":
    unittest.main()
