# ROM, RAM, and integrity behavior

## ROM checksum invariant

The big-endian word at CPU `CODE:9f00` (physical EPROM offset `0x1f00`) is
`0x7f2f`. An independent byte sum proves:

`sum(CODE:0000..9eff) mod 65536 = 0x7f2f`

The sum over the full `0000–9fff` image is `0x41bb`, and the external-only
sum does not match. Thus the stored word covers the combined internal and
external CPU-addressed image through `9eff`.

## Runtime verification

`CODE:9016` proves the algorithm. It initializes `R1:R0` to zero, starts
`DPTR=0000`, reads each byte with `MOVC`, accumulates modulo 65536, and loops
until `DPTR=9f00`. It then compares `CODE:9f00` with high accumulator `R1`
and `9f01` with low accumulator `R0`. There is no seed, complement, CRC, or
word summation.

Failure records the fault-table identifier at `CODE:4532` with subtype 4.

The XDF checksum declaration at physical `0x7ffd` points to erased `ffff`
bytes and is not credible for this image.

## RAM integrity

Startup at `5c00` initializes sentinel values and checks complementary
`0x55/0xaa`-style markers in paged XRAM. Valid markers preserve/increment a
retained byte; invalid markers reinitialize it. `2564` disables interrupts,
writes recovery sentinels, performs repeated service calls, and re-enters
initialization.

`CODE:90f5` destructively tests XRAM page-0 offsets `ff` down through `01`
with `0x55` and `0xaa`, stopping on the first mismatch and reporting the
`4532` identifier with subtype 1.

These operations prove RAM/state-integrity and recovery behavior. They do not
identify the external RAM technology or guarantee detection coverage.

## Failure outputs

Integrity failure can clear/reinitialize state and restart software control.
Whether it sets a stored diagnostic code or inhibits engine outputs requires a
validated diagnostic/hardware trace.

## Confidence

- High: checksum coverage/equality, invalid XDF checksum location, RAM marker
  operations, recovery path.
- High: `9f00` is the runtime-verified production ROM checksum.
- Unknown: external watchdog interaction and electrical RAM coverage.
