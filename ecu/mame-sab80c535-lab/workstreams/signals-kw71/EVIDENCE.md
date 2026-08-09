# KW71 firmware evidence boundary

This inventory separates instructions and ROM bytes from protocol-family and
bench assumptions. Addresses refer to the combined code image.

## Firmware facts

### UART path and configuration

- Serial vector `0023 -> 2060 -> 8960` is direct. `8960` clears `ES`, writes
  `SCON=90`, conditionally writes `SCON=FA`, and returns with `RETI`.
- Startup writes `SCON=90` at `5CD6`.
- Transmit helper `8919` selects `SCON=90` or `68`, writes internal byte `35`
  to `SBUF`, then sets `ES`.
- Recovery `8943` writes `PCON=00`, `SCON=90`, clears `ES`, clears the mode
  bit, and sets `TXD`.
- The firmware therefore requires real UART receive state (`P3.0/RXD`,
  `SBUF`, `RI`, serial interrupt), not writes to protocol RAM.
- The meaning of every `SCON` mode transition, oscillator frequency, baud
  source, and transceiver polarity is not proven by these writes alone.

### Wake and keyword exchange

- `774F` accepts received `06` in its startup path and enters `8475`.
- State 0 in `8475` writes `PCON=80`, `SCON=E8`, and transmits `55`.
- ROM table `44F5+18` is `00`; `44F5+19` is `81`. State 1 transmits those
  keyword bytes and compares the received byte with `~81`, namely `7E`.
- This proves the RX bytes `06` and `7E` used by the session-start fixture.
  It does not prove a five-baud wake waveform or when an external tester should
  begin relative to power-on.

### Block framing

- Incoming assembly starts at XRAM `00A1`: length at `A1`, sequence at `A2`,
  command at `A3`, and parameters from `A4`.
- Outgoing assembly starts at XRAM `00B1`: length at `B1`, sequence at `B2`,
  response service at `B3`, and payload from `B4`.
- `8AFD` accepts a length below `11`, initializes the pointer to `A1`, and
  arranges for exactly the length byte plus its declared remainder to be read.
  The accepted on-wire length is therefore `1..16`.
- `8B36` stores each received byte and transmits its bitwise complement.
- `8AA0` requires an incoming byte to equal the bitwise complement of the last
  transmitted byte.
- ROM table entries `44F5+1A..1B` are retry timing values `14 0A`; entries
  `+1E..1F` are `02 0A`. Their physical time units remain unknown.
- Block termination is byte `03`. The length counts sequence, service,
  payload, and terminator, but not the length byte itself.
- The sequence check in `8BAC` compares incoming sequence minus one with the
  current counter. Alternating ECU/tester sequence values are therefore a
  firmware fact; starting at ECU sequence 1 depends on zeroed session state.

There is no recovered additive checksum or CRC field in this block protocol.
The `malformed-checksum` fixture corrupts the proven complement exchange. Its
name satisfies the requested test category without misrepresenting the binary.

### Confirmed command and response bytes

ROM table `44F5` begins:

```
01 02 03 04 05 06 07 08 09 0A 0B 0C FE FD FC FB FA F9 F6
```

`8BAC` compares request service `A3` against the first twelve bytes. `8475`
uses the final seven bytes as response services. Supported interactions in this
workstream are limited to paths whose layouts are visible in the disassembly:

- request `01`: data-memory/SFR read; response `FE`. Payload is
  `[count, space, low-address]`. Space `01`, address `90` is explicitly handled
  as SFR P1, so fixture `06 0C 01 01 01 90 03` is bounded and supported.
- request `03`: code-space read; response `FD`. It is documented but not
  emitted as a fixture because no runtime safety gate needs it yet.
- request `04`: actuator test. First payload byte is restricted to
  `03,20,1D,24,25,30`.
- request `05`: clear fault memory.
- request `06`: calls recovery/disconnect.
- request `09`: advances the five-block identifier transfer.
- response `FC` is used by fault pagination, `FB` by indexed ADC/runtime data,
  `FA` by another fixed/multipart block, `F9` by the programming path, and
  `F6` by the initial identifier transfer.

The firmware recognizes all request bytes `01..0C`, but this does not establish
standardized public names for every one. No fixture sends programming, fault
clear, arbitrary memory, or an unresolved service.

### Identifier transfer

State 2 automatically emits five `F6` blocks. Raw payloads are:

- `9F02`, 10 bytes: `35 37 31 30 30 32 31 36 32 30`
- `9F0C`, 10 bytes: `38 37 33 36 35 33 37 36 32 31`
- `9F16`, 7 bytes: `31 33 31 34 33 37 31`
- `9F1D`, 3 bytes: `31 30 30`
- `9F20`, 3 bytes: `30 37 32`

The first two reverse to Bosch `0261200175` and software `1267356378`.
The remaining meanings are unresolved. The identifier fixture complements
each ECU block and sends service `09` continuation blocks.

### Failures

- Bad complement, invalid length, unexpected phase, and timeout enter rollback
  or `8943` recovery paths.
- `8943` can jump to full initialization `5C00` only when internal byte `3B`
  is zero and paged XRAM `0081` is one.
- The 8051 UART has no generic firmware-visible framing-error bit in this
  recovered path. Low-stop behavior must be established in the MAME core.

## Protocol-family assumptions in fixtures

- RXD idle/recessive is logic high after the external K-line transceiver.
- Bytes use 8N1, LSB first, at nominal 9,600 bit/s (`104 us` per bit).
- Tester bytes are placed in deterministic `4 ms` slots.
- The driver uses the accuracy-xdata workstream's assumed `12 MHz` oscillator.
- No five-baud address wake, ISO voltage, pull-up, slew, collision, or echo
  circuit is modeled.
- ECU sequence starts at `01` and tester sequence at `02` after clean reset.

These assumptions are replaceable fixture parameters. They are not promoted to
firmware facts without a known-tool capture or canonical runtime trace.
