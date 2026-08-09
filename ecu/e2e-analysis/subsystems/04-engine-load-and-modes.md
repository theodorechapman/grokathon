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
