import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { sweepAssumptions } from '../src/assumption-sweep.ts';
import { CLAIM_DEFECTS } from '../src/claim-defects.ts';
import { compareFacts, extractModelFacts, requireNoFalsePasses } from '../src/cross-validator.ts';
import { EVIDENCE_FACTS } from '../src/evidence-facts.ts';
import { loadEvidence } from '../src/evidence-loader.ts';
import { buildInventory, summarizeInventory, validateInventory } from '../src/inventory.ts';

describe('provenance inventory', () => {
  it('has exact source/line evidence for every entry', () => {
    const inventory = buildInventory();
    validateInventory(inventory);
    const summary = summarizeInventory(inventory);
    assert.equal(summary.explicitAssumptions, 26);
    assert.equal(summary.additionalModelChoices, 134);
    assert.equal(summary.total, 160);
    assert.equal(summary.defects, 16);
    assert.equal(summary.resolvedDefects, 12);
    assert.equal(summary.openDefects, 4);
  });

  it('does not collapse distinct provenance categories into assumed', () => {
    validateInventory(EVIDENCE_FACTS);
    const kinds = new Set([...buildInventory(), ...EVIDENCE_FACTS].map((item) => item.provenance));
    for (const required of [
      'binary-proven',
      'runtime-proven',
      'xdf-community',
      'datasheet-derived',
      'inferred',
      'arbitrary-model',
    ]) {
      assert.ok(kinds.has(required as never), `missing provenance kind ${required}`);
    }
  });
});

describe('external cross-validation', () => {
  const evidence = loadEvidence();

  it('passes corrected invariants while retaining genuine mismatches and unknowns', () => {
    const results = compareFacts(extractModelFacts(), evidence);
    requireNoFalsePasses(results);
    const byId = new Map(results.map((result) => [result.id, result]));
    const corrected = [
      'master-directory.base',
      'vector.adc',
      'vector.ext2',
      'sfr.CCL2',
      'sfr.CCH2',
      'sfr.CCL3',
      'sfr.CCH3',
      'sfr.CRCL',
      'sfr.CRCH',
      'confidence.scaled-units',
    ];
    for (const id of corrected) assert.equal(byId.get(id)?.status, 'pass', id);
    for (const id of ['output.ignition', 'output.injectors', 'output.idle']) {
      assert.equal(byId.get(id)?.status, 'fail', id);
    }
    for (const id of [
      'calibration.bytes',
      'scheduler.order',
      'diagnostics.service-codes',
      'fault.thresholds',
      'timing.engineering-units',
    ]) {
      assert.equal(byId.get(id)?.status, 'unknown', id);
    }
    assert.deepEqual(
      Object.fromEntries(['pass', 'fail', 'unknown'].map((status) => [
        status,
        results.filter((result) => result.status === status).length,
      ])),
      { pass: 34, fail: 3, unknown: 5 },
    );
  });

  it('rejects a regression in a corrected address', () => {
    const model = extractModelFacts();
    model.masterDirectory.base = 0x4700;
    const result = compareFacts(model, evidence).find((entry) => entry.id === 'master-directory.base');
    assert.equal(result?.status, 'fail');
  });

  it('rejects an altered constant', () => {
    const model = extractModelFacts();
    model.checksum.value ^= 1;
    const result = compareFacts(model, evidence).find((entry) => entry.id === 'checksum');
    assert.equal(result?.status, 'fail');
  });

  it('rejects altered branch order', () => {
    const model = extractModelFacts();
    [model.resetPath[2], model.resetPath[3]] = [model.resetPath[3], model.resetPath[2]];
    const result = compareFacts(model, evidence).find((entry) => entry.id === 'reset.path');
    assert.equal(result?.status, 'fail');
  });

  it('rejects overstated provenance', () => {
    const model = extractModelFacts();
    model.scaledEngineeringConfidence.supply = 'high';
    const result = compareFacts(model, evidence).find((entry) => entry.id === 'confidence.scaled-units');
    assert.equal(result?.status, 'fail');
  });
});

describe('historical defects', () => {
  it('retains resolved defects and distinguishes open work', () => {
    assert.equal(CLAIM_DEFECTS.length, 9);
    assert.equal(CLAIM_DEFECTS.filter((defect) => defect.status === 'resolved').length, 5);
    assert.equal(CLAIM_DEFECTS.filter((defect) => defect.status === 'open').length, 4);
    assert.equal(CLAIM_DEFECTS.find((defect) => defect.id === 'master-directory-wrong')?.status, 'resolved');
    assert.equal(CLAIM_DEFECTS.find((defect) => defect.id === 'ignition-output-miswired')?.status, 'open');
  });
});

describe('assumption sweep', () => {
  it('sweeps every explicit field and reports unused/unexercised choices', () => {
    const report = sweepAssumptions();
    assert.equal(report.entries.length, 26);
    assert.ok(report.entries.some((entry) => entry.unstable));
    assert.equal(report.entries.find((entry) => entry.field === 'cylinders')?.unstable, false);
    assert.equal(report.entries.find((entry) => entry.field === 'revolutionsPerCycle')?.unstable, false);
  });
});
