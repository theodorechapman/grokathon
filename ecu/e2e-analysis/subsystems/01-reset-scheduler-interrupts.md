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
- Timer 1 enters `257d`, refreshes the watchdog, alternates TH1/TL1 reload
  pairs while toggling P1.7 for IAC PWM, raises `BITS:002d`, and decrements
  heartbeat `INTMEM:0068`. Expiry reaches restart.
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
