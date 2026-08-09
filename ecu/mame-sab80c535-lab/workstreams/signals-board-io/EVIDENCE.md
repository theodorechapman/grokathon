# Board-I/O evidence boundary

The canonical image identity is SHA-256
`e262e6aa26ddf6c7c8aa02f636d422709309e0a08945739b84886204d1693e33`.
Instruction statements below come from `ecu/e2e-analysis/program-model.json`.
Runtime statements come from the `accuracy-xdata` combined logs.

## Proven by binary or runtime

### A040

Startup reads effective XDATA `A040` at `5CEA`, XORs with `1E`, copies ACC.0
to carry, and executes `JNC 5D0A` at `5CEF`.

- Raw bit 0 clear takes `5D0A` and reaches startup frontier `5D0D`.
- Raw bit 0 set takes `5CF1`, enables interrupt bits, writes `FF` to the A040
  output latch at `5D03`, and repeats from `5CE5`.
- The combined zero run records `5CEA -> 5CEF -> 5D0A`.
- The earlier FF-backed MCU run records repeated `5CE5..5D08`.

At `33A5`, the firmware computes:

```text
INTMEM:20 = (read(A040) XOR 1E) AND INTMEM:2E
```

The supervisor repeats the read at `9099`, applies XOR `1E`, and stores
`INTMEM:20` without the mask. Thus raw bits 1–4 are inverted; raw bits 0 and
5–7 are not. The effective state still depends on the live mask at `002E`.

Idle control at `6BD2..6BDE` proves these normalized-bit effects:

- bit 4 clear: logical selector remains 4;
- bit 4 set and bit 6 clear: selector 2;
- bit 4 set and bit 6 set: selector 3.

### A041

Reads at `33AE` and `90A0` apply XOR `02` and store `INTMEM:21`. Only raw bit 1
is inverted. Normalized bit 1 has one direct consumer: `JB 09,65DF` at `65BB`.
When set it skips `65BE..65DD`; when clear it falls through into additional
state and threshold qualification. The binary does not establish a physical
label for that condition.

### Separate write channels

Writes to A040 and A041 have output-latch producers. A040 receives the
`INTMEM:22` discrete-output shadow; A041 receives phase/output sequencing
values. In the strict runtime log, startup writes A040=`FF` and later reads
A040=`00`. That directly rejects ordinary latch readback.

The provider therefore has no write API. The integration path consults it only
for reads; existing output-latch storage remains write-only.

### P3, P5, and P6

- P3.4 at `2282` and `2540`: high branches forward; low sets `BITS:5D`.
  Both sites are in capture/synchronization scheduling code.
- P5.2 at `5CB9`: low selects startup P5=`FB`; high selects P5=`FF`.
- P5.4 at `230C`, `2625`, and `2C66`: firmware first releases the
  quasi-bidirectional bit. An externally low sample clears `BITS:3C` and the
  latch; high takes the forward branch.
- P5.3 at `320E`, `34A1`, and `3505`: low gates a protected path, enters
  restart initialization, or remains in the supervision loop respectively.
- P5.0 at `9702` and `9C36`: high enables a call or loop body; low skips it.
- Whole P3/P5 bytes are exposed through diagnostic/test paths at `769C/76A7`
  and read-modify-write paths around `8668/8680` and `8CCC/8CF2`.
- No direct P6 SFR reference exists in the exported program model. The
  validated MCU patch defines P6 as a digital callback whose writes are
  ignored. Canonical ADC code reads `ADDAT`, not P6.

P3 and P5 reads are combined with their MCU output latches by the CPU core.
Provider bytes represent external pin levels, not replacement latch contents.

## BMW/Motronic corroboration

BMW documentation identifies crank/cam, throttle-switch, A/C, transmission,
and other digital input classes at the DME connector. It does not provide the
PCB trace from those connector pins to A040/A041 or the MCU ports.

The idle calibration structure constrains normalized A040 bits 4 and 6:
logical selectors 2 and 3 reach payloads identified as D/R with A/C on and
D/R with A/C off. This supports an A/C/transmission condition pair, but does
not prove which raw bit is which, either raw polarity, or a connector pin.

Similarly, P3.4 is sampled inside crank-related routines, while BMW documents
crank and cam inputs. That context is not enough to name P3.4 as either input.

## Explicit scenario assumptions

- Cycle 4096 is a deterministic startup-release time, not measured hardware
  timing.
- Raw A041=`00` and baseline P3/P5/P6=`FF` preserve the prior combined-run
  assumptions; they are not recovered electrical idle levels.
- Raw A040=`40` after release makes normalized bits 4 and 6 high if their mask
  bits are enabled. It is used only for the corroborated idle selector case.
- The P3.4 low window in `crank` exercises a proven branch. It is not a tooth,
  cam, or crank waveform.
- Part-load, WOT, and overrun deliberately share board-digital values. Their
  recovered selectors depend on speed, load, temperature, and calibration
  state rather than a proven input bit in this scope.
- `fault-inputs` combines independent raw fault injections for coverage. The
  byte combination is not asserted to occur on a vehicle.

## Unresolved

- A040 mask initialization and all physical raw polarities.
- Every A041 physical bit meaning.
- P3/P5 MCU-to-board and board-to-connector routing.
- P6 canonical use and digital/analog pin electrical interaction.
- ADC channel identities and transfer functions.
- Exact CC0 tooth geometry, oscillator-dependent rates, and engine speed units.
- The additional input or scheduler condition needed to reach `601A`.

These gaps require a PCB schematic or continuity work, known-input bench
captures, and integrated runtime experiments. They cannot be closed by naming
bits from generic Motronic literature.
