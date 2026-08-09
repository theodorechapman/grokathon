#!/usr/bin/env python3
"""Fail-closed semantic gate for the checked-in KW71 scenario manifest."""

from __future__ import annotations

_SCENARIOS = {
	"actuator-test",
	"disconnect",
	"framing-error",
	"identifier-transfer",
	"malformed-checksum",
	"no-tester",
	"read-memory-sfr",
	"timeout",
	"valid-session-start",
}
_SAFE_REQUESTS = {
	"actuator-test": "04",
	"disconnect": "06",
	"identifier-continue": "09",
	"read-memory-sfr": "01",
}


def verify_manifest(manifest: object) -> None:
	"""Reject missing scenarios, guessed services, or false checksum claims."""
	if not isinstance(manifest, dict):
		raise AssertionError("manifest must be an object")
	if manifest.get("schema") != "motronic-kw71-stimuli/v1":
		raise AssertionError("wrong manifest schema")
	if manifest.get("timing_class") != "protocol-family assumption":
		raise AssertionError("timing must remain qualified as an assumption")
	if manifest.get("request_services") != _SAFE_REQUESTS:
		raise AssertionError("unsafe or unsupported request service")
	scenarios = manifest.get("scenarios")
	if not isinstance(scenarios, dict) or set(scenarios) != _SCENARIOS:
		raise AssertionError("required scenario set is incomplete")
	malformed = scenarios["malformed-checksum"]
	if not isinstance(malformed, dict):
		raise AssertionError("malformed-checksum metadata missing")
	if malformed.get("expected") != "f2" or malformed.get("injected") != "f3":
		raise AssertionError("bad-complement negative was weakened")
	meaning = malformed.get("meaning")
	if not isinstance(meaning, str) or "no additive checksum" not in meaning:
		raise AssertionError("checksum evidence boundary was removed")
