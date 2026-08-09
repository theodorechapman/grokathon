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
