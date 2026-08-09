#!/usr/bin/env python3
"""Write deterministic KW71 fixtures beside this workstream."""

from __future__ import annotations

import importlib.util
from pathlib import Path
from types import ModuleType

_ROOT = Path(__file__).resolve().parents[1]


def _load_builder() -> ModuleType:
	path = Path(__file__).with_name("kw71-fixtures.py")
	spec = importlib.util.spec_from_file_location("kw71_fixtures", path)
	if spec is None or spec.loader is None:
		raise RuntimeError(f"cannot load {path}")
	module = importlib.util.module_from_spec(spec)
	spec.loader.exec_module(module)
	return module


def generate_fixtures() -> None:
	"""Regenerate all checked-in fixture files."""
	target = _ROOT / "fixtures"
	target.mkdir(exist_ok=True)
	files = _load_builder().build_kw71_fixtures()
	for name, text in files.items():
		(target / name).write_text(text, encoding="utf-8")


if __name__ == "__main__":
	generate_fixtures()
