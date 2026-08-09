import { generateScenario } from './generate-scenario.ts';
import { scenarioSpecs } from './scenario-specs.ts';
import type { SignalContract } from './signal-contract.ts';

export interface SignalSuite {
  schema: 'motronic-signal-suite/v1';
  scenarios: SignalContract[];
}

export const generateSuite = (): SignalSuite => ({
  schema: 'motronic-signal-suite/v1',
  scenarios: scenarioSpecs.map((spec) => generateScenario(spec)),
});
