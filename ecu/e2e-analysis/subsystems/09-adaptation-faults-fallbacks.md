# Adaptation, fault records, and fallbacks

## Adaptive correction

`CODE:677c` loads XRAM correction state and enters `678e` through the
configuration selector at `7b2f`. `678e` is a bounded, debounced two-cell
adaptive-correction supervisor:

1. disable conditions neutralize XRAM `0001` and `0007` to `0x80`;
2. `6866` qualifies the operating window;
3. `68aa` detects centered-signal crossings;
4. `68e2` classifies/debounces operating regions;
5. `69b5` enforces stable-condition delay;
6. `69e4` calculates a signed correction;
7. `6a5f` clamps it to calibrated limits;
8. `6dec` selects/blends one correction cell into the control path.

Status nibbles are stored in XRAM `002f`; working/edge state occupies
`002c–002e`; the composite correction reaches `INTMEM:0057–0059`.
The structure strongly resembles additive/idle and multiplicative/part-load
fuel adaptation, but which cell is which is not binary-proven.

## Fault record format

Fault memory is XRAM `0300–03fe`, at most 51 records of five bytes:

- `+0`: fault identifier;
- `+1`: status/class/subtype;
- `+2/+3`: snapshots;
- `+4`: aging counter.

XRAM `00ec` is the count, `00ed–00f1` is a selected-record cache, and
`00f2–00f3` points at the current record.

## Record state machine

`CODE:8e50` creates or updates records. Proven status behavior is:

- low nibble: monitor-supplied subtype/state;
- bit 4: ROM-table class property;
- bit 5: qualified/stored;
- bit 6: currently active;
- bit 7: previously active/healed history.

`CODE:955c` ages inactive records and maintains global fallback timers.
`CODE:89c4` clears all records, caches, monitor counters, and adaptation
status `002f`.

## Fallback behavior

`CODE:9158` compares measured channels `INTMEM:0036–003a` against ROM
thresholds. Qualified active records can substitute calibrated defaults and
invoke neutralization helpers. `CODE:93ff` performs additional plausibility
checks; `6de3` explicitly restores XRAM `0046` and `0049` to neutral `0x80`.

ROM and RAM tests report the same fault-table identifier at `CODE:4532` with
different subtypes: RAM uses 1 and ROM checksum uses 4.

## Persistence boundary

Startup markers prove warm/cold retained-state detection, but no EEPROM write
was recovered. Adaptation and fault state are XRAM unless external retention
hardware proves otherwise.

## Confidence

- High: adaptation control sequence, record format, state bits, aging/clear,
  and sensor-default fallback.
- Medium: fuel/lambda interpretation and two-cell names.
- Unknown: BMW fault-code names, retention technology, engineering units, and
  exact physical output inhibition.
