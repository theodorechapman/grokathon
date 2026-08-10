# Clean-room Motronic 1.7 (SAB80C515) engine controller

A runnable reimplementation of the ECU described in [`SPECS.md`](./SPECS.md), written from that
document alone. No original binary, disassembly, XDF, or analysis artefact was consulted, and none
is contained here — the ROM image this model verifies is synthesised to satisfy the checksum
invariant the specification states, not copied from anywhere.

```bash
npm test          # 96 tests, node --test, no runtime dependencies
npm run typecheck # tsc --noEmit, strict
./demo.sh         # build every demo (and the MAME gateway when available), hub on :8099 — see DEMOS.md
node examples/drive-cycle.ts
```

Requires Node 22.18+ (the `.ts` files run directly through native type stripping). The only
dependency is `@types/node`, dev-only and type-only.

## Which ECU this is

SPECS.md never names the car, the engine, or the Motronic generation — it gives only the identity
blocks decoded from the image, `0261200175` and `1267356378`. Cross-referencing that Bosch number
against public parts catalogues identifies the unit as a **Bosch Motronic M1.7 for the E30 318is,
M42B18, 1990–91**. That identification is external corroboration, not a finding of the
specification, and nothing in `src/` depends on it.

Two things follow that the specification could not state. The M42 is genuinely distributorless with
one coil per cylinder, which corroborates the "four independent coil trigger pins" the writeup
attributes to BMW wiring; and the engine is a four, which confirms `cylinders` and
`revolutionsPerCycle` as facts rather than assumptions.

It also exposes a gap. Four coil pins, but the specification observes only compare channels 2 and 3
in use — so something bridges two scheduled channels to four outputs, and neither the writeup nor
this model knows what. It is listed in `OPEN_QUESTIONS`.

## What it does

```ts
import { createEcu } from './src/index.ts';

const ecu = createEcu();
ecu.powerOn();                       // 0000 -> 0073 -> ... -> 20e0 -> 5c00
ecu.setAnalogInput(0, 0x60);         // AFM
ecu.spinCrank(2500, 200);            // 200 ms of crank captures at 2500 rpm

ecu.parts.sync.isLocked();           // true
ecu.parts.fuel.latest();             // base, correction, lag, pulse width, AFR view
ecu.machine.idata.read(0x3b);        // encoded engine speed, at its real address
```

Every named piece of runtime state lives at the address the specification gives it, so assertions
can be made against the memory image rather than against JavaScript fields. `INTMEM:0068` really is
the heartbeat the timer-1 worker decrements; `BITS:0038` really is the bit `27cc` owns; fault
records really occupy `XRAM:0300-03fe` five bytes at a time.

## Proven, assumed, and unknown

The specification grades every claim it makes, and so does this model.

**Proven** facts are reproduced exactly and are not configurable: the reset trace, the checksum
invariant `sum(0000..9eff) mod 65536 = 0x7f2f` stored big-endian at `9f00`, the rev-limit bytes
`0x90`/`0x03`, the five-byte fault record format and its status bits, the `0x10` diagnostic length
bound, the `0x55` sync byte and `0x06` handshake, the six actuator request codes, and the identity
numbers `0261200175` / `1267356378`.

**Assumed** values are everything the specification marks unknown but a running model still needs —
oscillator frequency, crank events per revolution, RPM and angle scaling, pulse-width units, baud
rate, watchdog timeout. They all live in [`src/assumptions.ts`](./src/assumptions.ts), each with a
line saying what the specification actually said, and they are all overridable:

```ts
createEcu({ assumptions: { oscillatorHz: 16_000_000, crankEventsPerRevolution: 36 } });
disclosure();  // every value this model rests on, tagged 'proven' or 'assumed'
```

**Unknown** things stay unknown. `OPEN_QUESTIONS` in [`src/disclosure.ts`](./src/disclosure.ts)
lists what no assumption can close — which compare channel reaches which injector bank, which ADC
channel carries which connector signal, which adaptation cell is which. Where the specification
refuses to name something, this model names it `bank-a`, `cellA`, `compare-2`, and claims nothing
about the pin on the other end.

## The browser bench

`web/` builds a page that runs this model — not a recording of it — in the browser.

```bash
npm run build:web   # tsc -> web/.build, inlined into web/dist/motronic-bench.html
npm run demo        # build all demos, then a hub at http://localhost:8099
npm run demo:3d     # vite dev server for web3d/ (hot reload while hacking on it)
```

The hub at `/` links every demo: `/3d/` (the three.js engine bay in `web3d/`),
`/2d` (this page), and `/classic` (the pre-rework demo frozen in `web-original/`).

The output is a single self-contained HTML file (~300 kB, no network requests, no dependencies),
so `web/dist/motronic-bench.html` can also just be opened from disk. Building needs `tsc` on the
PATH, the same as `npm run typecheck`; it compiles `src/` and `web/app/` together to CommonJS,
which is what rewrites the `.ts` import specifiers a browser cannot resolve, and `web/build.js`
inlines the emitted modules behind a twenty-line registry.

Four panels, one argument:

- **Bench** — throttle, dyno load and four scenarios drive a real `Ecu`: `spinCrank`-style capture
  events into external-3/CC0, an AFM level into the converter, `step()` in real time. Mode, speed,
  load, pulse width, advance, dwell and the rev-cut state come back out of the model.
- **Memory** — the named `INTMEM`/`BITS`/`XRAM` locations from `src/memory-map.ts`, live, each read
  through `idata.read`, `idata.getBit` or `xram.read`. A byte that changed is highlighted.
- **Scope** — `machine.events` on a 30 ms axis: capture stimulus, compare-channel coil events, and
  injector pulses with their durations.
- **Evidence** — `disclosure()` in full. The proven column is fixed; every assumed value is an input,
  and editing one rebuilds the controller with it.

Everything on the page is graded. Black is what the binary settles; red pen is what this model
filled in, dashed for an assumption and dotted for a mechanism the specification located but did not
decode. Point at any red number and the margin note says what it actually rests on. Labels are in
plain language with the firmware's own name underneath, so the page reads without SPECS.md open. The single
clearest demonstration: set `revLimitNumerator` to something else and the cut speed moves off
6336.8 rpm while the record byte at 42d5 stays `0x90`, because that byte is proven and the
conversion is not.

The bench engine that supplies the crank events is written for the page, in `web/app/engine-plant.ts`,
and is not part of the model — it says so on screen. `window.motronic` is the bench handle, so the
live controller is reachable from the browser console (`motronic.ecu()`, `motronic.tick(0.05)`).

## Layout

| Area | Contents |
| --- | --- |
| `src/hardware/` | Memory, SFRs, timer 1, timer 2 with compare/capture, ADC, UART, watchdog, ports, interrupt controller |
| `src/kernel/` | Reset, initialisation, recovery, vector table, interrupt dispatch, timer-1 supervision, deferred INT0 chain, foreground executive |
| `src/calibration/` | Descriptor format, interpolation, lookup service, master directory, selector variants, rev-limit records |
| `src/subsystems/` | Capture, sync, speed, air mass, load, fuel, ignition, idle, limiter, overrun, adaptation, faults, integrity |
| `src/diagnostics/` | KW71 framing, UART layer, protocol state machine, services, actuator tests |

## Specification coverage

| SPECS chapter | Implementation |
| --- | --- |
| Reset, startup, scheduler, watchdog, interrupts | `kernel/reset.ts`, `kernel/startup.ts`, `kernel/vector-table.ts`, `kernel/interrupt-service.ts`, `kernel/foreground-executive.ts`, `kernel/timer1-supervisor.ts`, `kernel/deferred-worker.ts`, `kernel/recovery.ts`, `hardware/watchdog.ts` |
| Crank synchronization and RPM | `subsystems/crank-capture.ts`, `subsystems/crank-sync.ts`, `subsystems/speed-estimate.ts`, `hardware/timer2.ts` |
| ADC and sensor acquisition | `subsystems/adc-acquisition.ts`, `subsystems/sensor-state.ts`, `hardware/adc-unit.ts` |
| Engine load and operating modes | `subsystems/air-mass.ts`, `subsystems/engine-load.ts`, `calibration/selector-tables.ts` |
| Fuel | `subsystems/fuel-control.ts`, `calibration/lookup-service.ts`, `calibration/payload-catalog.ts` |
| Ignition | `subsystems/ignition-control.ts` |
| Idle | `subsystems/idle-control.ts` |
| Limiters, overrun, WOT, limp | `subsystems/rev-limiter.ts`, `subsystems/overrun-latch.ts`, `calibration/rev-limit-record.ts` |
| Adaptation, faults, fallbacks | `subsystems/adaptation.ts`, `subsystems/fault-memory.ts`, `subsystems/fault-monitors.ts` |
| KW71 diagnostics | `diagnostics/kw71-*.ts` |
| ROM, RAM, integrity | `subsystems/integrity.ts`, `rom-image.ts` |

## Notes on fidelity

A few places where following the specification produced something better than a guess would have:

- **The calibration layout is a check on the addresses.** Descriptors are laid out backwards from
  the XDF payload addresses the specification quotes, and the builder throws if any two overlap.
  That every quoted address admits a sensible set of dimensions is evidence the addresses are real.
- **The six orphan part-throttle families are present but unreferenced.** They sit in the master
  directory and no selector table points at them, matching "that means unobserved, not dead". A
  controller still needs a part-load base, so `fuel-control.ts` reaches one of them directly by
  slot — the single place where this model adds an edge the analysis never found, and it says so
  at the callsite.
- **Interpolation truncates like an 8051.** The fraction numerator tops out at `0xff/0x100`, so the
  far corner of a table lands two counts short of the cell value. That is the integer behaviour, not
  an approximation of it.
- **The secondary rev-limit record exists and is never read**, because no direct access to
  `4313/4314` was recovered.
- **Programming operations are refused rather than guessed.** The specification records that the
  service exists but not its encoding, and a model that writes code space on a guessed command is
  worse than one that says no.
