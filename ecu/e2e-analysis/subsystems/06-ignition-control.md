# Ignition advance, dwell, and event scheduling

## Advance selection

`CODE:3610` consumes load `INTMEM:0040`, engine-speed index `003b`, and
half-scale speed `003c`. It selects logical lookup 0 or 2, calls `0400`,
applies corrections, and updates:

- `0056`: requested ignition angle;
- `0051`: commanded ignition angle;
- `0050`: scheduled ignition angle.

`CODE:36fa` encodes a saturated signed correction around `0x1e`.
`CODE:3585` applies mode-dependent ignition and transient corrections.
`CODE:27cc` ramps/clamps the resulting states and produces Timer-0 deadlines.
Angle units and the XDF “real BTDC” conversion remain unproven.

## Exact map selectors

`CODE:795b` selects pointer base `463c`; `798b` chooses selector bases
`40aa`, `40ae`, `40b2`, `40b6`, or `40ba`.

For `40aa`:

- logical 0 -> master 91, descriptor `52ab`, payload `52c2`
  (“High part Throttle Ignition map”);
- logical 2 -> master 92, descriptor `5316`, payload `532c`
  (“Low part Throttle Ignition Map”).

For `40ae`, logical 0 reaches master 93/payload `538b`, the second
high-part-throttle family. Master 81/payload `5165` is the WOT family and
master 83/payload `518c` is idle timing. The later selector arrays need more
configuration evidence to distinguish ignition families 3 and 4.

## Dwell

`CODE:3711` calls logical lookup `0x13`, stores the result in `0055`, and
clamps it to a minimum of 8. All recovered `795b` variants resolve that
logical index to master 78/object `50d4`. `CODE:27cc` consumes `0055` while
building both Timer-0 edge schedules.

The XDF’s 12×7 dwell matrix at `50eb–513f` lies inside this custom object,
not a standard recovered descriptor. Its code association is proven; its
axis/cell layout and units are not.

## Coil output

The logical coil path is P1.5:

- `27cc` programs Timer-0 reloads and drives P1.5;
- Timer-0 wrapper `2010` complements P1.5 and stops Timer 0;
- `21d8` handles immediate/late edge cases and can also toggle P1.5.

This is one logical timed coil command. BMW documentation lists four external
coil triggers, so downstream distribution or PCB circuitry must explain the
connector-level channels.

## Related injector timing

CC2/P1.2 and CC3/P1.3 are not ignition-coil channels in the recovered graph.
`CODE:2fd3` publishes a 16-bit injector duration at `005b–005c`; `21d8`
subtracts that duration from CC2/CC3 deadlines and schedules alternating or
simultaneous injector-bank pulses. `6327` is a probable supplemental compare
pulse path.

## Confidence

- High: advance state path, dwell consumer, Timer-0/P1.5 coil command, and
  CC2/CC3 injector distinction.
- Medium: physical coil, injector-bank, and supplemental-pulse assignments.
- Unknown: angle/dwell units, downstream four-coil distribution, and custom
  dwell-object layout.
