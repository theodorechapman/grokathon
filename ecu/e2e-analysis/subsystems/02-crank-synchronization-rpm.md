# Crank synchronization and RPM calculation

## Inputs

The SAB80C515 external-3/CC0 source is the strongest firmware timing input.
BMW connector documentation separately identifies crank and cam inputs, but
the PCB route to CC0 is not available. The physical “crank” assignment is
therefore corroborated inference, not direct binary proof.

## Proven capture path

`CODE:0053` enters `20a0`. `BITS:0021`
(`crank_sync_running_mode`) selects:

- `CODE:2462`, synchronization acquisition, which reads `CRCL`, `CRCH`, `TH2`, and
  `INTMEM:003f`, stores timestamp triplets through the pointer in
  `INTMEM:004f`, and advances that pointer by three bytes;
- `CODE:21d8`, the synchronized edge and injection scheduler.

The timer-2 vector at `2070–2074` increments `INTMEM:003f`
(`timer2_overflow_epoch`) and clears `IRCON.TF2`. Together,
`003f:CRCH:CRCL` behaves as an extended capture time. `2462` includes a
rollover correction when captured `CRCH` disagrees with live `TH2`, proving
that capture timestamps cross the 16-bit Timer-2 boundary.

## State and transitions

`2462` compares interval ratios in `INTMEM:00c9–00d4`. A valid reference
pattern resets `INTMEM:0049` and `0071`, sets `BITS:0021`, and calls
`25f8` to enter synchronized mode. Rejection reaches `2564`, which resets
the synchronization state.

`INTMEM:0048` is the acquisition countdown, `004f` is the timestamp write
pointer, `0049` is the event index, and `004a` is an ignition-event
countdown. Tooth count and missing-tooth geometry remain unresolved.

Once synchronized, `EXT0 -> 2000 -> 20ee -> 261c -> 20f4 -> 27cc`.
`27cc` publishes the current period at `003d–003e` and sets
`BITS:002b` (`new_crank_period_available`).

## RPM equation boundary

`CODE:6099` consumes and clears `BITS:002b`, converts `003d–003e` through
the fixed-point helpers with scale constant `0x4a`, and publishes
`INTMEM:003b` (`engine_speed_index`) and `003c`
(`engine_speed_half_scale`). These states feed ignition, fuel, idle,
diagnostics, and calibration axes.

The safe engineering-unit form remains:

`speed ∝ timer_clock / capture_period`

The proportionality constant depends on timer prescaling and the number of
crank events per revolution. No RPM number is emitted by this specification
without those constants.

## Outputs and failures

Capture state feeds the Timer-0 ignition edge, CC2/CC3 injector scheduling,
and phase/output sequencing through `21d8`, `27cc`, `6327`, and `8000`.
Loss-of-sync recovery is proven; the final physical fail-safe behavior is not.

## Confidence

- High: capture/synchronization state machine, period publication, and
  engine-speed state.
- Medium: physical capture source is the crank input.
- Unknown: exact tooth model, RPM scaling, and crank/cam PCB routing.
