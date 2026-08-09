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

`CODE:2f83 -> 6f30 -> 2fd3` computes and publishes the final 16-bit
injector duration at `INTMEM:005b–005c`, including saturation. The complete
source-level correction order remains unresolved. No floating-point AFR
equation exists in the binary.

## Runtime state

Fuel-related functions are concentrated in `2f83–3ab2` and the lookup-heavy
external graph. `005b–005c` is the proven injector pulse-duration word;
paged XRAM still contains unresolved intermediates.

## Event scheduling and outputs

`CODE:21d8` subtracts the complemented duration from CC2 and CC3 deadlines,
enables their compare outputs, and drives P1.2/P1.3. It supports alternating
and simultaneous modes. These are the logical injector-bank channels; bank
numbering and connector routing remain wiring-level evidence.

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

- High: payload addresses, interpolation, final pulse word, and CC2/CC3
  scheduling.
- Medium: XDF fuel-family labels and physical injector-bank assignment.
- Unknown: connector routing, pulse-width units, AFR conversion, and
  complete correction order.
