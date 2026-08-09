import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { adaptAccuracyXdata } from '../src/adapt-accuracy-xdata.ts';
import { generateSuite } from '../src/generate-suite.ts';
import { serializePlan } from '../src/serialize-plan.ts';

export const writeFixtures = (): void => {
  const directory = fileURLToPath(new URL('../fixtures/', import.meta.url));
  mkdirSync(directory, { recursive: true });
  const suite = generateSuite();
  writeFileSync(`${directory}/scenarios-v1.json`, `${JSON.stringify(suite)}\n`, 'utf8');
  const keyOn = suite.scenarios.find((scenario) => scenario.id === 'key-on');
  if (!keyOn) throw new Error('key-on scenario was not generated');
  writeFileSync(
    `${directory}/key-on-plan.ndjson`,
    serializePlan(adaptAccuracyXdata(keyOn)),
    'utf8',
  );
};

writeFixtures();
