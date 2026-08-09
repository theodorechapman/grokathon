import { fileURLToPath } from 'node:url';

const fromHere = (relative: string): string => fileURLToPath(new URL(relative, import.meta.url));

export const PATHS = {
  repository: fromHere('../../../../../'),
  cleanroom: fromHere('../../../../../cleanroom/'),
  e2e: fromHere('../../../../e2e-analysis/'),
  validationStimuli: fromHere('../../validation-stimuli/'),
  reports: fromHere('../reports/'),
} as const;
