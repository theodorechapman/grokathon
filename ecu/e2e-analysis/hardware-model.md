# Hardware and timing evidence

## Source tiers

1. **Firmware proof** — instructions and references in
   `program-model.json`.
2. **Manufacturer definition** — the Infineon/Siemens
   [SAB80C515 family user manual](https://www.keil.com/dd/docs/datashts/infineon/80x515_um.pdf).
3. **BMW system documentation** — BMW training material identifies the E30
   M42 as Motronic 1.7 and documents the sensor/output classes, but does not
   establish the PCB trace from each MCU pin.
4. **Community wiring evidence** — the E30 M42 88-pin pinout identifies ECU
   connector functions, including injector banks, four coil triggers, IAC,
   crank/cam inputs, temperature inputs, and diagnostic RX/TX. It is useful
   corroboration, not firmware proof.

No MCU-port-to-88-pin assignment is promoted to fact without a PCB schematic
or continuity measurement.

## Interrupt structure

The vector addresses and peripheral names are manufacturer-defined. The target
and worker behavior below is firmware-proven.

- Reset `0000` reaches `0073`, `20e0`, then initialization at `5c00`.
- External 0 `0003` dispatches through `2000` to worker `2606`.
- Timer 0 `000b` reaches `2010`; it complements bit `95` (P1.5), clears
  `TCON.TR0`, and returns at `2014`.
- External 1 `0013` reaches `2030`; it updates saturating/wrapping counters at
  `INTMEM:0016–0017` and returns.
- Timer 1 `001b` reaches `2050`, updates `INTMEM:0016`, then tail-dispatches
  to `257d`, which toggles P1.7, alternates Timer-1 reload pairs, refreshes
  the watchdog, and supervises the foreground heartbeat.
- Serial `0023` reaches `2060` and the UART worker `8960`.
- Timer 2 `002b` reaches `2070`, increments `INTMEM:003f`, clears
  `IRCON.TF2`, and returns.
- ADC completion `0043` reaches the one-instruction `RETI` at `2080`.
- External 2 `004b` reaches the one-instruction `RETI` at `2090`.
- External 3/CC0 `0053` reaches `20a0`, which selects worker `2462` or `21d8`
  from bit `BITS:0021`.
- External 4, 5, and 6 (`005b`, `0063`, `006b`) each reach a direct `RETI` at
  `20b0`, `20c0`, and `20d0`.

The no-op ADC vector is strong evidence that normal ADC acquisition is polled
or started/read by other scheduling paths rather than handled by an ADC ISR.
It does not imply that the ADC is unused.

## ADC

Firmware directly accesses:

- `DAPR` from `261c` and `9ec2`;
- `ADCON0` from initialization/control code and `9ec2`;
- `ADDAT` from `2ce8` and `9ec2`.

`CODE:9ec2` selects `(channel & 7)`, starts a conversion through `DAPR`,
polls the busy state, and returns `ADDAT`. `CODE:9e88` scans channels 1–5;
`261c` starts channel 0 and `2ce8` reads its result. These accesses prove
multiplexed ADC use.
The conversion from channel number to coolant temperature, intake
temperature, AFM voltage, battery voltage, or another physical input remains
inferred until each channel-selection write is paired with its destination
state and the BMW wiring.

## Timers and compare/capture

The SAB80C515 manual assigns Timer 2 plus CRC/CC1–CC3 to the
compare/capture unit and maps CC0–CC3 alternate functions onto P1.0–P1.3.
Firmware heavily accesses `CCEN`, the CC2/CC3 pairs, `CRCL/CRCH`,
`TL2/TH2`, and `T2CON`; no direct CC1 data-register access is recovered.

Startup sets `TMOD=0x11` (16-bit Timer 0/1 modes) and `T2CON=0x85`
(Timer 2 compare mode at the documented divided clock). The highest-evidence timing cluster is:

- External 3/CC0 dispatcher: `0053 -> 20a0 -> {21d8,2462}`.
- Compare/capture consumers: `21d8`, `2462`, `257d`, `261c`, `27cc`,
  `5d10`, `5d4e`, `6327`, and `8000`.
- `21d8` consumes injector duration `INTMEM:005b–005c` and schedules CC2
  and CC3.
- `8000` directly reads/writes compare registers for diagnostic/test service.

Direct scheduling uses CC2 and CC3; no direct CCL1/CCH1 access is recovered.

Firmware roles are logically resolved: external-3/CC0 captures the crank-like
timing input, CC2/P1.2 and CC3/P1.3 schedule two injector banks, Timer 0
toggles the P1.5 coil command, and Timer 1 toggles the P1.7 idle-actuator
command. PCB routing and connector-level bank/cylinder identities remain
outside binary proof.

## UART and diagnostics

The serial vector is active and enters `8960`. `SCON` is configured by
initialization/diagnostic functions, and `SBUF` has multiple readers and
writers (`7705`, `774f`, `8475`, `8919`, `8aa0`, `8afd`, `8b70`). The BMW
M42 connector documentation identifies pins 87/88 as diagnostic RXD/TXD.
Together with `0x55` sync, keyword complements, and per-byte complement
framing, these establish a KW71-compatible diagnostic implementation.

## Ports and physical outputs

`P4` and `P5` are initialized at `5c00` and subsequently modified by `5d4e`,
`8475`, and `8bac`. `P2` is used pervasively as the high address/page for
`MOVX @Ri`, so a `P2` write is not automatically an actuator operation.
`P1` combines ordinary port bits with timer/compare/capture alternate
functions.

`INTMEM:0022` is a discrete-output shadow committed atomically to external
I/O latch `a040` by `61b3`. Its six active shadow bits are proven, but relay
names are not. `a041`, indexed by `EXTMEM:0206`, is a separate phase/output
sequence latch.

The firmware therefore proves digital I/O and scheduled output behavior, but
the following assignments remain schematic-level hypotheses:

- injector banks (DME pins 3 and 32);
- ignition outputs for cylinders 1–4 (pins 25, 52, 24, 51);
- IAC output (pin 29);
- main/fuel-pump, oxygen-sensor-heater, and purge relays;
- tachometer and fuel-rate outputs.

## Clock and rate boundary

Instruction ordering and timer reload writes are recoverable. Absolute time
requires the installed oscillator frequency and prescaler configuration. No
frequency is assumed from generic Motronic documentation. Until the DME
crystal marking or a factory hardware specification is available, tick rates
are expressed in machine cycles and timer counts rather than milliseconds.
