from __future__ import annotations

import unittest

import run_postie


class EngineDefaultTests(unittest.TestCase):
    def test_grok_is_pinned_to_45_high(self) -> None:
        self.assertEqual(run_postie.engine_defaults("grok"), ("grok-4.5", "high"))

    def test_codex_defaults_are_unchanged(self) -> None:
        self.assertEqual(run_postie.engine_defaults("codex"), ("gpt-5.6-sol", "high"))


if __name__ == "__main__":
    unittest.main()
