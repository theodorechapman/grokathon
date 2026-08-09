# Tool-assisted analysis: BMW Motronic 1.7, DME 175

> **Superseded external-ROM-only report.** The missing 8 KiB SAB80C515 mask ROM
> was subsequently recovered in `ecu/analysis/TotalCombinedROM.bin`. Statements
> below that the internal ROM, reset vectors, interpolation, or checksum
> algorithm are unavailable are no longer true. The complete ROM proves a
> 16-bit byte sum over CPU `0x0000–0x9EFF`, stored big-endian at CPU `0x9F00`
> (physical EPROM `0x1F00`): calculated and stored values are both `0x7F2F`.
> Use `ecu/e2e-analysis/README.md` and its generated artifacts for corrected
> evidence.

## Executive findings

- The 32 KiB binary identifies itself as Bosch DME `0261200175`, software
  `1267356378`. SHA-256:
  `d0dfe278311142c9e2114d106791cdd4cf09b0d0cc2d35c4f64fc20b7ecbbc68`.
- It is SAB80C515/8051-family code, not SM83/Game Boy code. Correcting the
  address map before analysis was essential.
- The XDF is substantially grounded in the firmware:
  - 30 of 35 active XDF table views have an exact firmware descriptor/payload
    match.
  - All matched payload sizes and dimensions agree. Six one-dimensional tables
    merely use the opposite row/column orientation in the XDF.
  - Five XDF tables use another representation or have no exact descriptor
    match.
- The firmware contains a 150-entry master calibration pointer index at
  `0x45c0`, with 145 unique targets.
- 127 unique pointer targets decode as structured calibration descriptors.
  Only 28 descriptor structures map to XDF entries (30 XDF titles because two
  payloads have duplicate display/conversion views). This leaves 99 structured
  firmware calibrations not represented by an exact XDF table.
- Ghidra recovered 296 functions, 76 calls to the internal map service at
  `CODE:0400`, and immediate `R2` indices for 57 of those calls.
- The XDF rev-limit values are structurally plausible but were not fully
  code-proven by this external-ROM-only model.
- The XDF checksum definition at `0x7ffd` points to erased `ffff` bytes and
  should not be trusted for this image.

## Tool path

The repository's `staticre` MCP implementation is Ghidra-backed, but its
importer and current server configuration target SM83/Game Boy ROMs. It was not
available as a callable MCP server in this session, and importing this firmware
through that path would select the wrong processor.

I used the same underlying approach directly:

- Ghidra 12.1.2 headless analysis with `8051:BE:16:default`
- custom Ghidra scripts for memory remapping, function/SFR analysis,
  decompilation, and lookup-callsite export
- radare2 as an independent instruction/byte-level check
- Python parsers for XDF equations, descriptor recovery, pointer correlation,
  and report synthesis

All work and generated evidence are isolated in `ecu/tool-assisted-analysis/`.

## Correct firmware memory map

The raw EPROM image cannot be imported at one linear CPU base.

- Physical file `0x0000–0x1fff` maps to CPU `CODE:8000–9fff`.
- Physical file `0x2000–0x7fff` maps to CPU `CODE:2000–7fff`.
- CPU `CODE:0000–1fff` is the SAB80C515 internal mask ROM and is not present in
  the dump.

The Ghidra preparation script creates:

- `INTERNAL_MASK_ROM_UNDUMPED`: `CODE:0000–1fff`
- `EXTERNAL_EPROM_LOW`: `CODE:2000–7fff`
- `EXTERNAL_EPROM_HIGH_ALIAS`: `CODE:8000–9fff`

This mapping explains both the valid external entry code at `CODE:2000` and the
valid code physically stored at file offset zero but executed near
`CODE:8000`.

## XDF validation

The XDF contains 45 parsed entries, 40 active entries, and five visual separator
entries. The active set is 35 tables and five constants.

The parser found 15 metadata issues:

- 13 axis-label count mismatches
- two duplicate-address views:
  - `Fuel WOT Map1` and its AFR view at `0x49df`
  - `High part throttle fuel map` and its AFR view at `0x4b42`

The duplicate views are intentional alternate conversions, not duplicate
payloads. The axis-label mismatches are real XDF presentation defects; they do
not change the underlying firmware dimensions.

## Recovered calibration descriptor format

The master pointer targets repeatedly use this layout:

`type rows row_axis [40 cols col_axis] payload`

Observed descriptor type bytes are `04` and `36–3b`. For a one-dimensional
map, the `40 cols ...` section is absent.

Examples:

- Pointer 1, target `0x483b`, decodes to a 12×1 payload at `0x4849`, exactly
  matching `Engine temp sensor transfer map`.
- Pointer 8, target `0x4885`, decodes to a four-value payload at `0x488b`,
  exactly matching `Injector Lag vs. Battery voltage`.
- Pointer 19, target `0x496d`, decodes to a 3×3 payload at `0x4977`, exactly
  matching `Fuel Acceleration enrichment`.
- Pointer 25, target `0x49b6`, decodes to a 4×3 payload at `0x49c1`, exactly
  matching `Fuel Idle Map`.
- Pointer 45, target `0x4b2b`, decodes to a 12×7 payload at `0x4b42`, exactly
  matching the high-part-throttle fuel map.
- Pointer 81, target `0x5153`, decodes to a 16×1 payload at `0x5165`, exactly
  matching `Ignition WOT Map 1`.

The five active XDF tables without an exact descriptor/payload match are:

- injector trim (air temperature / battery voltage), `0x4931`, 8×5
- ignition dwell (battery voltage / RPM), `0x50eb`, 12×7
- the XDF's truncated view of the master index, `0x45c0`, 132×2 (the
  terminated firmware directory actually has 150 entries)
- AFM voltage transfer, `0x4710`, 32×1
- AFM scale factors, `0x4700`, 1×8

This does not establish that those five definitions are wrong. The index is not
a calibration descriptor, and AFM/compound tables can use different formats.

## Master lookup and code usage

`CODE:0400` was not loaded into this external-ROM-only project, but the external
firmware contains 76 direct `LCALL 0x0400` instructions. The callsites
consistently use `R2` as the master-pointer index.

- 57 callsites have an immediately recoverable `MOV R2,#index`.
- 19 callsites use a dynamic value or require wider data-flow analysis.
- 20 distinct immediate indices are visible:
  `0–13, 16, 17, 19, 20, 21, 24`.
- Index 0 is the most common, with 21 direct callsites.
- Pointer target `0x4835` is shared by five index entries and accounts for 24
  resolved calls when aliases are combined.

The lack of immediate external calls to higher pointer indices does not mean
those maps are unused. Selection can occur dynamically or inside the internal
ROM that this superseded project did not import.

## Rev-limit records

The XDF defines:

- primary limit at `0x42d5`: raw `90`, `912500 / 144 = 6336.8 RPM`
- primary buffer at `0x42d6`: raw `03`, `3 × 40 = 120 RPM`
- secondary limit at `0x4313`: the same raw/value pair
- secondary buffer at `0x4314`: the same raw/value pair

The surrounding structure supplies independent support:

- primary record base: `0x42d0`
- secondary record base: `0x430e`
- the first 18 bytes of both records are identical:
  `02010154509003340f04100a331040080105`
- the limit and buffer bytes are offsets +5 and +6 in each record

Ghidra and radare2 find one direct load of the primary record base:

- `CODE:3535`: `MOV DPTR,#0x42d0`
- function `CODE:3530` copies only record offsets 0, 1, and 2 to XRAM
  `0x0207–0x0209`

No dumped external function directly references `0x42d5`, `0x42d6`, `0x430e`,
`0x4313`, or `0x4314`. Therefore the XDF labels are plausible and supported by
duplicated record structure, but the exact runtime cut behavior remains
unproven. The consuming code may be in `CODE:0000–1fff`.

## Checksum assessment

The XDF claims a 16-bit checksum at physical `0x7ffd`, but the image contains
`ffff` there. Those are erased EPROM bytes, not a credible checksum value.

Physical offset `0x1f00` contains `0x7f2f` immediately before the reversed DME
and software identifier strings. That is a stronger metadata/checksum
candidate. Its algorithm is not established by the dumped external code, so
the analysis deliberately does not claim a verified checksum formula.

## Static-analysis boundaries

- This project omitted the separately recovered 8 KiB internal image, hiding
  reset/interrupt bodies and the implementation of `CODE:0400`.
- Ghidra's high-ROM speculative analysis identifies a small number of functions
  that flow beyond `CODE:9fff` or into then-unmapped internal addresses. Treat those
  specific decompilations as low confidence.
- The SameBoy dynamic-analysis tooling in the repository cannot execute an
  SAB80C515 ECU image. No dynamic ECU hardware/emulator validation was claimed.

## Reproduction and artifacts

Run:

```sh
bash ecu/tool-assisted-analysis/run-analysis.sh
```

The pipeline retains its temporary Ghidra project and regenerates:

- `analysis-report.json`: compact synthesized evidence
- `xdf-analysis.json`: every parsed XDF entry, value, and issue
- `descriptors.json`: all decoded firmware descriptors and exact XDF matches
- `master-map-callsites.json`: instruction context for all 76 lookup calls
- `map-usage.json`: pointer/index/callsite/XDF correlation
- `ghidra-report.json`: memory map, 296 functions, references, and 80 selected
  decompilations

Source files:

- `PrepareMotronic175.java`
- `ExportMapCallsites.java`
- `ExportGhidraReport.java`
- `analyze-xdf.py`
- `analyze-map-usage.py`
- `analyze-descriptors.py`
- `synthesize-analysis.py`
- `run-analysis.sh`
