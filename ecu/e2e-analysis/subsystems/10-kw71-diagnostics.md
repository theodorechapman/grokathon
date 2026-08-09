# KW71-style serial diagnostics

## Hardware path

The serial vector `0023` jumps through `2060` to `8960`.
`8960` disables the serial interrupt, selects `SCON = 0x90` or `0xfa` from a
mode bit, and returns. `8919` configures `SCON`, writes one byte to `SBUF`,
and re-enables the serial interrupt.

BMW connector documentation identifies DME pins 87/88 as diagnostic RXD/TXD.
This corroborates the UART role but does not establish external electrical
levels or baud timing.

## Protocol state

The diagnostic state machine uses:

- `INTMEM:0034`: protocol phase;
- `0035`: current transmit/receive byte;
- `0032`: timeout/retry counter;
- `0030`: data pointer;
- `0031`: remaining length;
- `0033`: command/mode.

`CODE:8a1b` dispatches phases to `8aa0`, `8aed`, `8afd`, `8b36`, and
`8b70`. `8afd` accepts a length byte no greater than `0x10`. `8b36` stores a
received byte, decrements the remaining length, complements the next byte,
and transmits it. `8aa0` verifies a received byte against the complement of
the previous byte. These are strong protocol-framing facts.

## Handshake and transitions

`CODE:774f` recognizes received `0x06` in one startup state, updates paged
XRAM protocol state, and calls `8475`. State 0 transmits synchronization
`0x55`; state 1 performs keyword/complement exchange. Timeouts decrement `0032`; expiration
calls `8943`, which resets serial configuration and can re-enter full
initialization at `5c00` under a specific runtime condition.

## Data blocks, commands, and actuator tests

Outgoing frames use XRAM `00b1` length, `00b2` sequence, `00b3` service,
payload at `00b4`, and trailing `0x03`. Recovered services include five-block
identity transfer, memory/SFR read, code-space read, programming operations,
fault-record pagination, indexed runtime data, secondary fixed blocks, and
fault clear.

`CODE:8bac` also decodes six actuator requests (`03`, `20`, `1d`, `24`,
`25`, `30`). Periodic service `8000` drives CC3/P1.3, CC2/P1.2, routine
`6db6`, XRAM output bits, or internal flags. Their physical actuator names
remain unresolved.

Primary identity blocks at `9f02` and `9f0c` decode to Bosch/DME
`0261200175` and software `1267356378`.

## Failure behavior

Invalid length, complement mismatch, timeout, and protocol-state mismatch
reset or roll back the state machine. The maximum observed payload length is
16 bytes. Electrical K-line behavior and exact KW71 baud initialization are
outside binary-only proof.

## Confidence

- High: UART interrupt path, state-machine addresses, complement framing,
  `0x06` handshake, length bound, and timeout recovery.
- Medium: KW71 family identification and actuator-test support.
- Unknown: complete command dictionary, block fields, baud rate, and physical
  line interface.
