from __future__ import annotations

import io
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))

import run_agent
import write_task


class RunStatusTests(unittest.TestCase):
    def test_missing_status_continues(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            status = run_agent._read_run_status(Path(tmp) / "RUN_STATUS.json")
        self.assertEqual(status["status"], "incomplete")
        self.assertTrue(status["next_priority"])

    def test_terminal_status_is_preserved(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "RUN_STATUS.json"
            path.write_text(json.dumps({"status": "complete", "summary": "done"}))
            status = run_agent._read_run_status(path)
        self.assertEqual(status["status"], "complete")
        self.assertEqual(status["blockers"], [])

    def test_invalid_status_continues(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "RUN_STATUS.json"
            path.write_text('{"status":"nearly done"}')
            status = run_agent._read_run_status(path)
        self.assertEqual(status["status"], "incomplete")


class CommandTests(unittest.TestCase):
    def test_grok_command_is_headless_and_passes_effort(self) -> None:
        command = run_agent._grok_cmd(Path("/work"), "continue", "grok-test", "high")
        self.assertIn("--trust", command)
        self.assertIn("--no-auto-update", command)
        self.assertIn("--output-format", command)
        self.assertIn("streaming-json", command)
        self.assertIn("--reasoning-effort", command)
        self.assertEqual(command[-2:], ["-p", "continue"])

    def test_dynamic_task_json_survives_template_formatting(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            path = write_task.write_task(
                workspace,
                "program-test",
                agent_dir=Path("/agent"),
                rom_path=Path("/rom.gb"),
            )
            task = path.read_text()
        self.assertIn('"status": "complete | hard_blocked | incomplete"', task)
        self.assertIn("from sameboy import SameBoy", task)


class PersistenceTests(unittest.TestCase):
    def test_incomplete_pass_is_followed_by_complete_pass(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            meta_path = workspace / "run_meta.json"
            meta: dict = {"passes": []}
            declarations = [
                {
                    "status": "incomplete",
                    "summary": "more remains",
                    "next_priority": "recover gravity",
                    "blockers": [],
                },
                {
                    "status": "complete",
                    "summary": "recovered",
                    "next_priority": "",
                    "blockers": [],
                },
            ]

            class FakeProcess:
                def __init__(self, *_args, **_kwargs) -> None:
                    declaration = declarations.pop(0)
                    (workspace / "RUN_STATUS.json").write_text(json.dumps(declaration))
                    self.stdout = io.StringIO("agent output\n")

                def wait(self) -> int:
                    return 0

            with mock.patch.object(run_agent, "_agent_cmd", return_value=["fake"]), \
                    mock.patch.object(run_agent.subprocess, "Popen", FakeProcess):
                result = run_agent._run_passes(
                    ws=workspace,
                    engine="grok",
                    model=None,
                    mcp_command="mcp",
                    mcp_args=[],
                    mcp_env={},
                    effort="high",
                    tier=None,
                    max_passes=4,
                    env={},
                    meta_path=meta_path,
                    meta=meta,
                )

            self.assertEqual(result, 0)
            self.assertEqual(len(meta["passes"]), 2)
            self.assertEqual(meta["passes"][0]["declaration"]["status"], "incomplete")
            self.assertEqual(meta["passes"][1]["declaration"]["status"], "complete")
            self.assertIn("agent pass 2", (workspace / "agent.log").read_text())


if __name__ == "__main__":
    unittest.main()
