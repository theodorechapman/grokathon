matcha@Henrys-MacBook-Air-1227 subsystems % cat *
# Reset, startup, scheduler, watchdog, and interrupts

## Inputs and state

Reset begins at `CODE:0000`. Startup observes interrupt-priority state at
`SFR:00a9`, preserves one bit in PSW state, and enters external code. Runtime
initialization touches paged XRAM, stack state, ports, timer/compare registers,
ADC registers, and interrupt controls. `INTMEM:0016–0017` and
`INTMEM:003f` are interrupt-maintained counters; their units are unknown.

## Proven sequence

The deterministic emulator trace executes:

`0000 -> 0073 -> 0075 -> 0077 -> 0079 -> 007b -> 20e0 -> 5c00`.

The instructions at `0073–007b` copy `IP0.6` (`WDTS`, the watchdog reset
status) into PSW `F0`, set `IEN1.SWDT`, and jump to `20e0`. `20e0` is a
trampoline to `5c00`.
`5c00` initializes runtime/XRAM sentinels and peripheral registers before
entering the rest of the program.

## Scheduling and interrupts

Firmware proves four substantial interrupt paths:

- external 0: `0003 -> 2000 -> 2606`;
- timer 1: `001b -> 2050 -> 257d`;
- serial: `0023 -> 2060 -> 8960`;
- external 3/CC0: `0053 -> 20a0 -> {21d8,2462}`.

Timer 0, external 1, and timer 2 perform small counter/register updates at
`2010–2014`, `2030–203d`, and `2070–2074`. ADC, external 2, and external
4–6 immediately return. These paths and the main-loop call graph form the
scheduler.

`CODE:601a–607d` is a fixed cooperative foreground cycle. It invokes a
deterministic service sequence, repeatedly calls housekeeping at `6096`, and
loops through `5f97–6017 -> 2112 -> 601a`. No RTOS dispatcher or idle wait
is present.

## State transitions

- Reset enters initialization unconditionally.
- External 3 chooses `21d8` or `2462` from `BITS:0021`.
- Timer 1 enters `257d`, refreshes the watchdog, reloads TH1/TL1, raises
  `BITS:002d`, and decrements heartbeat `INTMEM:0068`. Expiry reaches restart.
- INT0 is software-pended by `25f8–2605`; its worker chain `2606–3356`
  performs deferred ADC, timing, state, and serial work, then clears `EX0`.
- `CODE:2564` disables global interrupts, writes XRAM sentinels, invokes
  `25f7` three times, and re-enters `5c00`; this is a software recovery or
  reinitialization path.
- UART state can also cause `8943` to call `5c00`.

## Outputs and failure paths

Initialization establishes port and peripheral state. Interrupt workers update
capture/compare schedules, counters, and serial state. The `2564 -> 5c00`
path is firmware proof of recovery, but the triggering fault condition and
whether an external watchdog also resets the processor remain unresolved.
No direct `WDTREL` reference was recovered, so a specific watchdog timeout
equation is not claimed.

## Confidence

- High: reset path, vector targets, wrapper instructions, and recovery jump.
- High: cooperative foreground executive and Timer-1 supervision.
- Unknown: oscillator frequency, absolute tick periods, and the physical
  reason for each recovery.
# Crank synchronization and RPM calculation

## Inputs

The SAB80C515 external-3/CC0 source is the strongest firmware timing input.
BMW connector documentation separately identifies crank and cam inputs, but
the PCB route to CC0 is not available. The physical “crank” assignment is
therefore corroborated inference, not direct binary proof.

## Proven capture path

`CODE:0053` enters `20a0`. Bit `BITS:0021` selects:

- `CODE:2462`, which reads `CRCL`, `CRCH`, `TH2`, and
  `INTMEM:003f`, stores timestamp triplets through the pointer in
  `INTMEM:004f`, and advances that pointer by three bytes;
- `CODE:21d8`, a larger compare/capture worker that consumes timer/port state
  and updates event state.

The timer-2 vector at `2070–2074` increments `INTMEM:003f`
(`timer2_overflow_epoch`) and clears `IRCON.TF2`. Together,
`003f:CRCH:CRCL` behaves as an extended capture time. `2462` includes a
rollover correction when captured `CRCH` disagrees with live `TH2`, proving
that capture timestamps cross the 16-bit Timer-2 boundary.

## State and transitions

`INTMEM:0048` counts capture phases. `INTMEM:004f` points into a timestamp
buffer. Additional state at `004a`, `0071`, and bit-addressable RAM controls
the alternative worker and synchronization transitions. These roles are
address-level facts; tooth count, missing-tooth pattern, and cylinder phase
names are not yet established.

## RPM equation boundary

The firmware proves that RPM is derived from differences between captured
timer values, but the complete consumer chain and oscillator frequency have
not established a defensible engineering-unit equation. The safe form is:

`speed ∝ timer_clock / capture_period`

The proportionality constant depends on timer prescaling and the number of
crank events per revolution. No RPM number is emitted by this specification
without those constants.

## Outputs and failures

Capture state feeds compare/capture channels 2 and 3 through `21d8`, `6327`,
and `8000`; no direct CC1 use is present. Loss-of-sync counters and fallback paths
exist in this cluster, but a unique timeout-to-fuel-cut path is not yet proven.

## Confidence

- High: extended capture timestamp mechanism and rollover correction.
- Medium: capture source is engine position/speed.
- Unknown: exact tooth model, sync state names, RPM scaling, and separation of
  crank versus cam channels.
# ADC and sensor acquisition

## Inputs and hardware

Firmware uses the SAB80C515 ADC registers `ADCON0`, `ADDAT`, and `DAPR`.
`CODE:9ec2` is a blocking channel read:

`ADCON0 = (ADCON0 & 0xf8) | (channel & 7); DAPR = 0; wait; result = ADDAT`.

`CODE:9e88` scans channels 1–5 into `INTMEM:0036–003a`.
`CODE:2ce8` separately reads `ADDAT` in the AFM path; `CODE:261c` starts
channel 0. The ADC interrupt wrapper at `2080` is a direct `RETI`, so
acquisition is polled or synchronously scheduled.

BMW wiring separately identifies AFM, coolant temperature, air temperature,
oxygen, throttle-switch, and battery-related inputs. The binary does not by
itself map each ADC channel to one of those connector signals.

## Runtime state

Calibration descriptors name their input by an 8051 direct-data address.
Frequently observed locations include `INTMEM:0036–003b` and `0040`.
`CODE:046a–0473` loads the descriptor’s first byte into `R0`, then reads
`@R0` as the live axis value. Two-axis selectors cause the same operation on
the second descriptor axis.

Static consumers support these evidence-scored names: `0036` scaled supply
voltage, `0037` intake-air temperature, `0038` coolant temperature, `0039`
an unknown hysteretic channel (possibly lambda), and `003a` an unresolved
channel. `003b` is encoded engine speed, `0040` normalized load, and
`0041–0042` filtered air mass. Physical volts/degrees units remain unresolved.

## Scaling and filtering

Descriptor axes are cumulative byte deltas. `CODE:046a` finds the active
interval; `0493` performs adjacent-value interpolation; `04a2` performs the
second-axis interpolation. This proves table-domain normalization and
interpolation, not an analog volts-to-degrees transfer function.

At `3fa0`, for calibration gain `g` and ADC state `v = INTMEM:0036`,
`p = g * v` and `0036 = min(255, p >> 7)`; the low fraction feeds `3f91`.
No generic filter equation is assigned to every sensor.

## Plausibility and failure behavior

The firmware contains comparisons, saturation, and mode-bit fallbacks around
live state. Exact open-circuit/short-circuit thresholds cannot be named from
the XDF because the XDF primarily describes calibrations rather than ADC
diagnostic thresholds.

If a descriptor selector is `0xff`, `CODE:0413–0418` sets
`BITS:004b` and returns `0xff`; callers use this to probe optional
calibrations. This is a calibration-availability failure path, not a sensor
failure diagnosis.

## Outputs

Normalized state feeds load, fuel, ignition, idle, limiter, and diagnostic
functions. `runtime-state.json` records all direct readers and writers; page
reconstruction is still required for `MOVX @Ri` locations.

## Confidence

- High: ADC use, polling behavior, descriptor input addresses, interpolation.
- Medium: `0036–0040` are normalized engine/sensor state.
- Unknown: channel 4/5 identities and physical transfer equations.
# Engine-load calculation and operating-mode selection

## Inputs

This subsystem consumes normalized direct-data state, paged XRAM flags, and
calibration results. `CODE:3610` compares descriptor-backed state at
`INTMEM:003b` and `0040`, and uses bits `3–5` of page-relative
`EXTMEM:007a` to select one of several record fields.

`CODE:2ce8` acquires AFM samples; `790d` selects alternate curves at
`4730/4750`; `7921` selects the primary `4700` family; and assembly-authority
function `2d73` produces filtered air mass at `0041–0042`.
`CODE:6099` derives normalized load `0040` and encoded speed `003b`.

## Calibration selection

Lookup setup routines at `7930–7c0c` write:

- pointer-window base to `INTMEM:0073–0074`;
- selector-table base to `INTMEM:0075–0076`.

The windows overlap the 150-entry master directory. Selector tables represent
operating variants, not separate physical maps. `CODE:798b`, for example,
chooses selector bases `40aa`, `40ae`, `40b2`, or `40b6` from mode bits.

This establishes a state-dependent calibration-mode architecture. It also
means a literal `R2` value at a callsite is not one globally named map.

## Control flow and state transitions

The dense lookup consumers at `33a0`, `3585`, `3610`, `3723`, and `3800`
form the main calibrated-control cluster. `3610` probes logical descriptors
until the lookup service reports a `0xff` selector, then applies additional
state comparisons and writes page-relative XRAM outputs.

`lookup-dataflow.json` resolves 75 of 76 `CODE:0400` callsites to a concrete
or finite logical `R2` set. `CODE:3640` remains a documented live-in
dependency through `3585 -> 212a -> 3610`; the lookup itself increments `R2`
at `040f`, so the loop walks successive logical entries.

## Equation boundary

The producer/consumer chain strongly supports the names air mass, normalized
load, and encoded engine speed, but does not prove percent or RPM units. No generic
`load = air_mass / engine_speed` equation is imported from Motronic
literature.

## Outputs and failures

Mode selection changes selector tables and therefore which master-pointer
slots feed downstream control. Missing selectors return `0xff` and set a
status bit. Other mode/fallback bits are preserved as unknown until their
producers and physical inputs are established.

## Confidence

- High: variant selector architecture, comparison addresses, lookup walk.
- High: AFM-to-airmass-to-load producer chain.
- Medium: the cluster selects named operating modes.
- Unknown: engineering units and names for each mode bit and state byte.
# Fuel target, corrections, pulse width, and scheduling

## Inputs and calibrations

The XDF labels fuel payloads at:

- idle `49c1`;
- WOT views `49df` and `4a2f`;
- acceleration enrichment `4977`;
- temperature enrichment `4967` and `4988`;
- low/part-throttle families `4b42`, `4bac`, `4cd4`, `4d3e`,
  `4e66`, and `4ed0`.

Thirty of 35 active XDF tables exactly match a selector-decoded payload.
“Fuel” and AFR names remain XDF/community claims until the consuming function
and output chain establish them. Duplicate AFR views apply `1881.6 / raw` to
the same bytes and are not independent firmware equations.

High-evidence corrections include master slot 8/payload `488b` (injector lag
versus supply state), slot 16/variant `4931` (8×5 temperature/voltage trim),
slots 18/20 (`4967/4988`, temperature enrichment), slot 19 (`4977`,
acceleration enrichment), slot 25 (`49c1`, idle fuel), and slots 26/32
(`49df/4a2f`, WOT variants).

## Control algorithm

Firmware-proven operations are:

1. operating state selects a lookup configuration (`7930–7c0c`);
2. logical `R2` selects a descriptor through `0400`;
3. `046a`, `0493`, and `04a2` interpolate byte-domain calibration values;
4. external control functions combine those results with live state using
   bounded integer arithmetic.

`CODE:3585` updates transient enrichment, including
`EXTMEM:006e = high8(calibration_a * calibration_b)`. `CODE:3800`
assembles many lookup results with fixed-point multiplication and dispatches
the composite correction through `6b60 -> 2178`. `CODE:3a83` evaluates a
configuration-dependent WOT variant into page-relative XRAM `0069–006a`.

The original base-pulse-width equation and final injector pulse-width storage
remain unresolved. No floating-point AFR equation exists in the binary.

## Runtime state

Fuel-related candidate functions are concentrated in `33a0–3ab2` and the
lookup-heavy external graph. Paged XRAM writes represent intermediate targets
and scheduled outputs, but `MOVX @Ri` page reconstruction is required before
assigning stable names.

## Event scheduling and outputs

Timer-2/compare-capture functions prove timed output scheduling. BMW wiring
identifies two injector-bank outputs at DME pins 3 and 32. The firmware-to-PCB
channel mapping is unavailable, so no `CCn` register is declared to be a
specific injector bank.

## State transitions and cuts

Mode tables distinguish idle, acceleration, and WOT calibrations. Six XDF
part-throttle maps have no consumers in recovered selector configurations;
that means unobserved, not dead. Limiter/overrun conditions can suppress or alter scheduled fuel,
but the exact controlling bit and output compare channel remain under the
limiter specification.

## Failure paths

Selector termination returns `0xff`; state comparisons and saturation prevent
byte overflow. Sensor fallback and injector disable behavior are visible only
as candidate state paths until their physical outputs are mapped.

## Confidence

- High: payload addresses, interpolation, integer/saturation behavior.
- Medium: XDF fuel-family labels and timed injector scheduling.
- Unknown: physical channel assignment, pulse-width units, AFR conversion, and
  complete correction order.
# Ignition advance, dwell, and cylinder scheduling

## Inputs and calibrations

The XDF identifies ignition payload families at `5165`, `518c`, `51b6`,
`52c2`, `532c`, `538b`, `53f5`, `54be`, `551d`, `5587`, and `55e6`.
It identifies a battery-voltage/RPM dwell table at `50eb`.
Descriptor/payload matching supports the locations and dimensions; the
engineering labels remain XDF evidence.

## Advance and dwell calculation

The lookup service supplies interpolated bytes from the selected operating
variant. Integer consumers then combine calibrated values with runtime state.
The exact signed angle representation is not yet proven, so XDF “real BTDC”
conversion text is not treated as a firmware equation.

Dwell is plausibly voltage- and speed-dependent because the XDF payload is an
exact descriptor match and BMW documentation describes that control strategy.
The binary evidence required to assign its two direct-data axes to battery
voltage and RPM is still incomplete.

## Timing and cylinder events

The compare/capture cluster reads captured Timer-2 state and writes
`CCL/CCH` and `CRCL/CRCH` schedules. `CODE:8000` is a direct
compare-register service; `21d8`, `257d`, `261c`, `27cc`, `5d10`, `5d4e`,
and `6327` participate in the same hardware graph.

BMW wiring identifies four independent coil trigger pins. The firmware proves
multiple scheduled outputs but does not expose the PCB mapping from CC
channels/port bits to cylinders. Cylinder order is therefore not assigned to
individual registers.

## State transitions

Capture events select synchronization workers, calibrated advance/dwell is
converted to timer-domain deadlines, and compare events update output state.
Recovery at `2564 -> 5c00` disables normal interrupt operation during
reinitialization.

## Failure paths

Potential loss-of-sync, over-rev, and sensor fallback paths can alter or
suppress scheduled ignition. Their exact output bits remain unresolved.
No safety claim about coil dwell or power-stage behavior is possible without
hardware testing.

## Confidence

- High: compare/capture scheduling and calibration payload structure.
- Medium: XDF advance/dwell labels and multiple coil-event scheduling.
- Unknown: angle units, cylinder/channel mapping, dwell limits, and physical
  driver timing.
# Idle detection, targets, and actuator control

## Inputs and calibrations

The XDF identifies target-speed payloads at:

- `57ef`: P/N, A/C on or off;
- `57fb`: D/R with A/C on;
- `5805`: D/R with A/C off.

It also identifies fuel-idle payload `49c1` and ignition-idle payload `518c`.
The first target table has an XDF axis-label count mismatch (four labels for
six values), so label-to-cell interpretation is not trusted.

## Operating modes

The payload families support state-dependent idle targets for transmission and
A/C inputs. BMW wiring documents two A/C-related DME inputs and one IAC
output. Firmware mode bits and selector-table variants are consistent with
that architecture, but the exact bit-to-input mapping is not yet proven.

## Control behavior

The binary proves:

1. target selection through the common descriptor lookup;
2. idle-specific fuel and ignition calibration families;
3. timed/digital output control through port and compare functions.

It does not yet prove a named proportional/integral controller or the unit of
the target bytes. No PI gains are invented from generic Motronic descriptions.

## State transitions

Idle entry/exit depends on live mode flags, speed/load state, and
transmission/A/C compensation. Selector configuration changes choose
calibration variants. Recovery and fault modes can replace normal targets.

## Outputs and failures

BMW wiring assigns DME pin 29 to idle-speed control. The MCU port or compare
channel that reaches pin 29 is unresolved. Sensor plausibility or
loss-of-speed state can force a fallback, but the fallback byte and actuator
duty equation are not yet uniquely traced.

## Confidence

- High: target payload addresses/dimensions and separate idle fuel/ignition
  families.
- Medium: P/N, D/R, and A/C compensation labels; IAC closed-loop behavior.
- Unknown: target scaling, controller equation, mode-bit names, and physical
  output channel.
# Rev limiting, overrun, WOT switching, and limp modes

## Rev-limit records

The canonical image contains two structurally matching records:

- primary base `42d0`, limit byte `42d5 = 0x90`, buffer
  `42d6 = 0x03`;
- secondary base `430e`, limit byte `4313 = 0x90`, buffer
  `4314 = 0x03`.

Their first 18 bytes are identical. The XDF equations report
`912500 / 0x90 = 6336.8 RPM` and `3 * 40 = 120 RPM`.
Those equations and the staged-injector-cut description are XDF claims, not
yet recovered firmware mathematics.

`CODE:27cc` directly consumes the primary record: `2909–291f` reads record
fields through offset `0x11` (`42d5`), and `2ad9–2ade` selects offset `0x12`
(`42d6`) into `INTMEM:0052`. `CODE:3530` independently copies
`42d0–42d2` into XRAM `0207–0209`. No direct access to the secondary
`4313/4314` pair is recovered.

## Mode switching

Fuel and ignition have distinct WOT, part-throttle, and idle payload
families. Runtime selector setup chooses overlapping pointer windows and
selector tables from mode bits. This is firmware proof of mode-dependent
calibration selection; exact TPS/load thresholds are not named.

## Cuts and transitions

The expected high-level transitions are:

- normal part-load to WOT calibration selection;
- normal fueling to overrun/fuel-cut state;
- normal control to one or more over-speed cut states;
- sensor/synchronization fault to fallback or recovery.

`CODE:27cc` owns `BITS:0038` (`rev_cut_stage_active`), complementary
`BITS:003a`, and the transition countdown at `INTMEM:0052`.
`CODE:3723` maintains a separate speed/load/temperature-qualified
`BITS:003b` deceleration/overrun latch with timer `INTMEM:00a0`.

The full chain from these latches to a physical injector or ignition output
has not been uniquely proven. The over-rev scenario fixture therefore reports the raw
records and lookup saturation only; it does not simulate injector shutdown.

## Outputs and failure behavior

Possible outputs are reduced fuel events, suppressed ignition events, changed
selector tables, and reinitialization at `5c00`. A physical ECU is required
to establish cut sequencing, hysteresis under real acceleration, and safety
behavior.

## Confidence

- High: duplicate records and raw values.
- High: primary record is consumed by a staged cut state machine.
- Medium: mode tables select WOT/part load and `BITS:003b` is overrun logic.
- Low: exact RPM conversion and staged injector-cut narrative.
- Unknown: overrun thresholds, output channels, and limp-mode transition map.
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
matcha@Henrys-MacBook-Air-1227 subsystems % 