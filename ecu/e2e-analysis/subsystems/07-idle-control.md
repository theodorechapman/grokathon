# Idle target and actuator control

## Target selection

The control path is `6b8d -> 217e -> 7b87 -> 6bb7`. `7b87` selects pointer
base `46ae` and selector `40e0` or `40ea` from coding bits in
`INTMEM:00ba`.

Under selector `40e0`, `6bb7` chooses:

- logical 1 -> master 120/payload `57ef`: P/N target;
- logical 2 -> master 121/payload `57fb`: D/R with A/C on;
- logical 3 -> master 122/payload `5805`: D/R with A/C off;
- logical 4 -> master 123/payload `580f`: untitled default/variant.

The `57ef` XDF view has six firmware values but four axis labels, so its
presentation labels are incomplete.

## A/C and transmission conditions

`CODE:33a0` reads the external I/O ASIC at effective XRAM `a040/a041`,
applies XOR/mask normalization, and stores input state at `INTMEM:0020–0021`.
In `6bb7`, bits `0020.4` and `0020.6` select the D/R and A/C variants.
Their behavioral meaning is strongly constrained by the chosen maps, but raw
polarity and connector pins still require wiring evidence. `00ba` is
variant/transmission coding rather than a live A/C input.

## Controller

`CODE:6bb7` combines the selected target with speed `003b–003c`, load
`0040`, and accumulated control state. It calls `6db6`, which publishes two
Timer-1 reload pairs:

- `0064–0065`: phase A;
- `0066–0067`: phase B.

The arithmetic and state are recovered, but this specification does not
invent named P/I gains or RPM units.

## IAC output

Timer-1 vector `001b -> 2050 -> 257d` toggles P1.7 and alternates TH1/TL1
between the two reload pairs. `257d` also refreshes the watchdog and supervises
foreground heartbeat `0068`; an expired heartbeat enters reset recovery.

P1.7 is therefore the logical software-PWM IAC command. BMW documentation
identifies DME pin 29 as idle-speed control, but the MCU-to-connector PCB route
is not directly available.

## Failure behavior

Invalid timing or stalled foreground state reaches `2564`/restart behavior.
Sensor faults can substitute calibrated values before the idle controller.
The electrical valve fail-safe state remains outside binary evidence.

## Confidence

- High: target selectors, mode-bit behavior, Timer-1 reload generation, and
  P1.7 software PWM.
- Medium: physical IAC and A/C/gear assignments.
- Unknown: RPM scaling, gain terminology, raw input polarity, and electrical
  fail-safe behavior.
