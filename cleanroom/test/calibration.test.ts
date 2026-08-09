/** Descriptors, interpolation, the lookup service, and selector variants. */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { createEcu } from '../src/ecu.ts';
import { decodeDescriptor, encodeDescriptor } from '../src/calibration/descriptor.ts';
import { blend, interpolateDescriptor, locateAxis } from '../src/calibration/interpolate.ts';
import { buildCalibrationImage, MASTER_DIRECTORY_BASE } from '../src/calibration/calibration-image.ts';
import { PAYLOAD_CATALOG } from '../src/calibration/payload-catalog.ts';
import {
  LOOKUP_CONFIGURATIONS,
  MODE_VARIANT_BASES,
  SELECTOR_TABLES,
  selectorBaseForModeBits,
} from '../src/calibration/selector-tables.ts';
import { BITS, IDATA } from '../src/memory-map.ts';

describe('descriptors', () => {
  it('round-trips through cumulative byte deltas', () => {
    const spec = {
      axes: [{ inputAddress: IDATA.encodedEngineSpeed, points: [0, 40, 90, 200] }],
      values: [10, 20, 30, 40],
    };
    const bytes = encodeDescriptor(spec);
    const decoded = decodeDescriptor(bytes, 0, false);

    assert.equal(decoded.axes[0].inputAddress, IDATA.encodedEngineSpeed);
    assert.deepEqual(decoded.axes[0].points, [0, 40, 90, 200]);
    assert.deepEqual([...decoded.payload], [10, 20, 30, 40]);
  });

  it('names its input by a direct-data address in the first byte', () => {
    const bytes = encodeDescriptor({
      axes: [{ inputAddress: IDATA.coolantTemperature, points: [0, 255] }],
      values: [1, 2],
    });
    assert.equal(bytes[0], IDATA.coolantTemperature);
  });
});

describe('interpolation', () => {
  it('locates the active interval and clamps outside the domain', () => {
    const points = [0, 64, 128, 192, 255];
    assert.equal(locateAxis(points, 0).index, 0);
    assert.equal(locateAxis(points, 96).index, 1);
    assert.equal(locateAxis(points, 255).fraction, 0xff);
    assert.equal(locateAxis(points, 300).clamped, true);
  });

  it('blends adjacent bytes in the integer domain', () => {
    assert.equal(blend(0, 0xff, 0), 0);
    assert.equal(blend(0, 0x80, 0x80), 0x40);
    assert.equal(blend(0x40, 0x40, 0xff), 0x40);
  });

  it('applies the second axis to a two-axis descriptor', () => {
    const bytes = encodeDescriptor({
      axes: [
        { inputAddress: 0x3b, points: [0, 255] },
        { inputAddress: 0x40, points: [0, 255] },
      ],
      values: [0, 100, 200, 255],
    });
    const descriptor = decodeDescriptor(bytes, 0, true);
    assert.equal(interpolateDescriptor(descriptor, [0, 0]).value, 0);
    // The fraction numerator tops out at 0xff/0x100, so the far corner lands
    // two counts short of the cell value. That truncation is the integer
    // behaviour, not an approximation of it.
    assert.equal(interpolateDescriptor(descriptor, [255, 255]).value, 253);
    assert.ok(interpolateDescriptor(descriptor, [128, 128]).value > 0);
  });
});

describe('calibration image', () => {
  it('places every catalogued payload at the address SPECS gives', () => {
    const image = buildCalibrationImage();
    for (const entry of PAYLOAD_CATALOG) {
      const base = image.descriptorBaseFor(entry.payloadAddress);
      assert.ok(base < entry.payloadAddress, `${entry.payloadAddress.toString(16)} header precedes payload`);
      const descriptor = image.descriptorAt(base, entry.axes.length > 1);
      assert.equal(descriptor.axes[0].inputAddress, entry.axes[0].inputAddress);
      assert.equal(descriptor.rows * descriptor.columns, entry.axes.reduce((n, a) => n * a.count, 1));
    }
  });

  it('reaches payloads through the 150-entry master directory', () => {
    const image = buildCalibrationImage();
    const entry = image.directoryEntry(MASTER_DIRECTORY_BASE, 8);
    assert.ok(entry);
    assert.equal(image.descriptorBaseFor(0x488b), entry.base);
  });
});

describe('lookup service', () => {
  it('writes the configuration bases to INTMEM:0073-0076', () => {
    const ecu = createEcu();
    ecu.powerOn();
    ecu.context.lookup.configure(LOOKUP_CONFIGURATIONS.fuelPartLoad);

    assert.equal(ecu.machine.idata.readWord(IDATA.pointerWindowLow), 0x45c0);
    assert.equal(ecu.machine.idata.readWord(IDATA.selectorTableLow), 0x4000);
  });

  it('returns 0xff and sets BITS:004b when the selector terminates', () => {
    const ecu = createEcu();
    ecu.powerOn();
    ecu.context.lookup.configure(LOOKUP_CONFIGURATIONS.fuelPartLoad);

    const result = ecu.context.lookup.evaluate(99);
    assert.equal(result.available, false);
    assert.equal(result.value, 0xff);
    assert.equal(ecu.machine.idata.getBit(BITS.calibrationMissing), true);
  });

  it('walks successive logical entries until termination', () => {
    const ecu = createEcu();
    ecu.powerOn();
    ecu.context.lookup.configure(LOOKUP_CONFIGURATIONS.fuelPartLoad);

    const walked = ecu.context.lookup.walk(0);
    assert.equal(walked.length, 5);
    assert.deepEqual(walked.map((r) => r.slot), [8, 16, 18, 19, 20]);
  });

  it('reads the live axis value through the descriptor address', () => {
    const ecu = createEcu();
    ecu.powerOn();
    ecu.context.lookup.configure(LOOKUP_CONFIGURATIONS.fuelPartLoad);

    ecu.machine.idata.write(IDATA.coolantTemperature, 0x00);
    const cold = ecu.context.lookup.evaluateSlot(18).value;
    ecu.machine.idata.write(IDATA.coolantTemperature, 0xff);
    const hot = ecu.context.lookup.evaluateSlot(18).value;

    assert.ok(cold > hot, 'temperature enrichment falls as the axis rises');
  });
});

describe('selector variants', () => {
  it('CODE:798b chooses among 40aa, 40ae, 40b2 and 40b6 from mode bits', () => {
    assert.deepEqual([...MODE_VARIANT_BASES], [0x40aa, 0x40ae, 0x40b2, 0x40b6]);
    assert.equal(selectorBaseForModeBits(0), 0x40aa);
    assert.equal(selectorBaseForModeBits(3), 0x40b6);
    assert.equal(selectorBaseForModeBits(7), 0x40b6);
  });

  it('variants reuse master slots rather than owning separate maps', () => {
    const variants = SELECTOR_TABLES.filter((t) => MODE_VARIANT_BASES.includes(t.base as 0x40aa));
    const slots = new Set(variants.flatMap((t) => t.slots));
    const total = variants.reduce((n, t) => n + t.slots.length, 0);
    assert.ok(slots.size < total, 'variants share slots');
  });

  it('leaves the six part-throttle families in the directory with no consumer', () => {
    const unconsumed = PAYLOAD_CATALOG.filter((entry) => !entry.consumed);
    assert.equal(unconsumed.length, 6);

    const referenced = new Set(SELECTOR_TABLES.flatMap((t) => t.slots));
    for (const entry of unconsumed) {
      assert.equal(referenced.has(entry.slot), false, `slot ${entry.slot} has no selector`);
      const image = buildCalibrationImage();
      assert.ok(image.directoryEntry(0x45c0, entry.slot), 'but is still in the directory');
    }
  });
});
