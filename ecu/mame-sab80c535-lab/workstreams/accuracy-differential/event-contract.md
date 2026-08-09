# Differential event contract

Schema identifier: `motronic-differential-event/v1`.

Each normalized JSON document has four required members:

- `schema`: the identifier above.
- `provenance`: evidence identity and generation details.
- `availability`: fields the engine can actually observe.
- `events`: ordered instruction-boundary records.

## Provenance

Required provenance fields are:

- `engine`: `mame`, `ghidra-emulatorhelper`, or `independent-static`.
- `runtime`: `true` only for executed MAME or EmulatorHelper evidence.
- `profile`: the deterministic reset/init or microcase profile.
- `tool_revision`: pinned MAME commit, Ghidra version, or static decoder hash.
- `rom_sha256` and `rom_size`.
- `command`: the producing command or reproducible command description.

Runtime normalizers also record hashes of their raw logs/artifacts and executable
where available. The comparator rejects unknown engines, wrong runtime flags,
wrong ROM identity, empty commands, and empty tool revisions. The independent
static decoder always has `runtime: false`; it is never promoted to runtime
evidence.

## Availability

`availability` declares:

- `cycles`: `observed`, `derived-8051-machine-cycles`, or `unavailable`.
- `registers`: names actually present in each boundary.
- `access_spaces`: independent states for `idata`, `sfr`, and `xdata`.
- `interrupts`: how entries were observed or derived.

An unavailable field is not equal to any value. It is counted in
`unmatched_fields`. If a stream ends while another continues, the first
divergence is `unavailable_evidence`.

## Instruction boundary

Every `events` item has:

```json
{
  "kind": "instruction",
  "ordinal": 12,
  "pc": 23564,
  "cycles": 18,
  "opcode": 240,
  "registers": {"a": 1, "b": 0, "psw": 1, "sp": 7, "dptr": 41089},
  "accesses": [{
    "space": "xdata",
    "access": "write",
    "address": 41089,
    "data": 1,
    "source": "mame-driver-runtime"
  }],
  "interrupt_entry": null
}
```

- `ordinal` is the zero-based instruction count.
- `pc` and registers describe state before executing that instruction.
- `cycles` is the pre-instruction 8051 machine-cycle count or `null`.
- `opcode` is independently read from the identified ROM at `pc`.
- `accesses` belong to the instruction beginning at that boundary.
- `interrupt_entry` names a vector only when execution enters it after reset.

MAME exposes instruction PCs, cycles, core registers, SFR accesses, and XDATA
accesses. Its current driver does not tap IDATA. EmulatorHelper exposes PCs and
registers but not cycle or read/write callbacks. The static decoder derives
cycles and accesses only for its fail-closed supported opcode subset.

## Comparison modes

Exact comparison uses full-width masks: bytes `0xff`, DPTR `0xffff`.
Masked comparison accepts explicit masks such as `psw=0xfe`; masked bits remain
listed in report provenance and are not described as exact agreement.

At each ordinal, the comparator checks:

1. PC and opcode;
2. all cycle values that are available in at least two streams;
3. each register available in at least two streams;
4. per-space ordered access tuples `(direction, address, masked data)`;
5. interrupt entry.

The first unequal compared field stops comparison. Classification is:

- `cpu_semantics`: PC, opcode, or core-register behavior.
- `timing`: cycle mismatch or invalid monotonicity.
- `peripheral_state`: interrupt or IE/IP state.
- `memory_mapping`: missing or changed IDATA/SFR/XDATA access.
- `unavailable_evidence`: invalid provenance or a stream ending first.

Missing raw runtime logs are normalization errors, not skips.
