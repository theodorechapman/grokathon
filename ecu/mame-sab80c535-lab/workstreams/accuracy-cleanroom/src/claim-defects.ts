export interface ClaimDefect {
  id: string;
  severity: 'high' | 'medium';
  status: 'open' | 'resolved';
  claim: string;
  evidence: string[];
  correction: string;
}

export const CLAIM_DEFECTS: readonly ClaimDefect[] = [
  {
    id: 'assumptions-not-centralized',
    severity: 'high',
    status: 'open',
    claim: 'assumptions.ts:7-8 says every runnable default lives there and no other module hard-codes a physical constant.',
    evidence: ['cleanroom/src/ecu-services.ts:46-75', 'cleanroom/src/subsystems/engine-load.ts:30-43', 'cleanroom/src/subsystems/idle-control.ts:43-47'],
    correction: 'At least the separately inventoried model choices define behavior outside Assumptions and are not overrideable or disclosed.',
  },
  {
    id: 'scaled-confidence-overstated',
    severity: 'high',
    status: 'resolved',
    claim: 'Engineering-unit sensor/RPM APIs return confidence=medium.',
    evidence: ['cleanroom/src/subsystems/sensor-state.ts:62-112', 'e2e-analysis/OPEN-QUESTIONS.md:39-54'],
    correction: 'The names may be medium confidence, but values in volts, degrees, RPM, and percent depend on unproven equations and should be unknown/assumed.',
  },
  {
    id: 'selector-provenance-overstated',
    severity: 'high',
    status: 'open',
    claim: 'Selector records at 40aa/40ae/40b2/40b6 use provenance=spec even though the file says table contents are model-assigned.',
    evidence: ['cleanroom/src/calibration/selector-tables.ts:10-13', 'cleanroom/src/calibration/selector-tables.ts:33-36'],
    correction: 'Track base provenance separately from slot-content provenance.',
  },
  {
    id: 'master-directory-wrong',
    severity: 'high',
    status: 'resolved',
    claim: 'The master directory starts at 0x4700.',
    evidence: ['cleanroom/src/calibration/calibration-image.ts:23-25', 'e2e-analysis/calibration-index.json:2-7'],
    correction: 'Binary analysis proves 150 entries at 0x45c0..0x46eb with terminator 0x46ec.',
  },
  {
    id: 'vectors-wrong',
    severity: 'high',
    status: 'resolved',
    claim: 'ADC/ext2 vectors are 0x0033/0x003b.',
    evidence: ['cleanroom/src/kernel/vector-table.ts:40-41', 'e2e-analysis/hardware-model.json:230-270'],
    correction: 'SAB80C515 binary vectors are ADC=0x0043 and external-2=0x004b.',
  },
  {
    id: 'compare-capture-sfrs-wrong',
    severity: 'high',
    status: 'resolved',
    claim: 'CRCL/CRCH and CC2/CC3 use the addresses in cleanroom memory-map.ts.',
    evidence: ['cleanroom/src/memory-map.ts:151-159', 'e2e-analysis/hardware-model.json:2198-2721'],
    correction: 'Use CCL2/CCH2=0xc4/0xc5, CCL3/CCH3=0xc6/0xc7, CRCL/CRCH=0xca/0xcb.',
  },
  {
    id: 'ignition-output-miswired',
    severity: 'high',
    status: 'open',
    claim: 'Ignition charge/fire is scheduled on CC2/CC3 and P1.2/P1.3.',
    evidence: ['cleanroom/src/subsystems/ignition-control.ts:32-34', 'e2e-analysis/hardware-model.json:3101-3128'],
    correction: 'Binary hardware evidence maps ignition to Timer0/P1.5 and injector banks to CC2/P1.2 and CC3/P1.3.',
  },
  {
    id: 'echo-check-unreachable',
    severity: 'medium',
    status: 'open',
    claim: 'The KW71 session rejects complement mismatches.',
    evidence: ['cleanroom/src/diagnostics/kw71-session.ts:53-54', 'cleanroom/src/diagnostics/kw71-session.ts:113-120'],
    correction: 'No path sets awaitingEcho=true, so the check is unreachable.',
  },
  {
    id: 'sfr-multibyte-read',
    severity: 'medium',
    status: 'resolved',
    claim: 'The model implements memory/SFR range reads.',
    evidence: ['cleanroom/src/diagnostics/kw71-services.ts:82-93'],
    correction: 'The SFR branch now reads address+i; the former repeated-first-byte behavior remains recorded here.',
  },
];
