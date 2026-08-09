import { demoPlantConstants as constants } from './demo-plant-constants.ts';

interface DemoPlantState {
  step: number;
  rpmMilli: number;
  throttleIntentPermille: number;
  afmCallbackCode: number;
  injectorScheduleFeedback: 'absent' | 'inactive' | 'active';
  starterTorqueUnits: number;
  combustionTorqueUnits: number;
  dragTorqueUnits: number;
  brakeTorqueUnits: number;
  netTorqueUnits: number;
}

interface DemoPlantInput {
  pedalPermille: number;
  brakePermille: number;
  starterEngaged: boolean;
  /** Null means that the required CC2/CC3 schedule telemetry was absent. */
  injectorScheduleActive: boolean | null;
}

const requireInteger = (value: number, minimum: number, maximum: number, path: string): void => {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${path} must be an integer in ${minimum}..${maximum}`);
  }
};

const moveToward = (current: number, target: number, maximumDelta: number): number => {
  if (target > current) return Math.min(target, current + maximumDelta);
  return Math.max(target, current - maximumDelta);
};

const divideNearest = (numerator: number, denominator: number): number =>
  Math.floor((numerator + Math.floor(denominator / 2)) / denominator);

const divideTowardZero = (numerator: number, denominator: number): number =>
  Math.trunc(numerator / denominator);

const initialState = (): DemoPlantState => ({
  step: 0,
  rpmMilli: 0,
  throttleIntentPermille: 0,
  afmCallbackCode: constants.afmMinimumCode.value,
  injectorScheduleFeedback: 'absent',
  starterTorqueUnits: 0,
  combustionTorqueUnits: 0,
  dragTorqueUnits: 0,
  brakeTorqueUnits: 0,
  netTorqueUnits: 0,
});

const validateState = (state: DemoPlantState): void => {
  requireInteger(state.step, 0, Number.MAX_SAFE_INTEGER - 1, 'state.step');
  requireInteger(state.rpmMilli, 0, constants.maximumMilliRpm.value, 'state.rpmMilli');
  requireInteger(
    state.throttleIntentPermille,
    0,
    constants.throttleScale.value,
    'state.throttleIntentPermille',
  );
  requireInteger(state.afmCallbackCode, 0, 127, 'state.afmCallbackCode');
};

export const advanceDemoPlant = (
  priorState: DemoPlantState | null,
  input: DemoPlantInput,
): DemoPlantState => {
  const state = priorState ?? initialState();
  validateState(state);
  requireInteger(
    input.pedalPermille,
    0,
    constants.throttleScale.value,
    'input.pedalPermille',
  );
  requireInteger(
    input.brakePermille,
    0,
    constants.throttleScale.value,
    'input.brakePermille',
  );
  if (typeof input.starterEngaged !== 'boolean') {
    throw new Error('input.starterEngaged must be boolean');
  }
  if (input.injectorScheduleActive !== null && typeof input.injectorScheduleActive !== 'boolean') {
    throw new Error('input.injectorScheduleActive must be boolean or null');
  }

  const throttleIntentPermille = moveToward(
    state.throttleIntentPermille,
    input.pedalPermille,
    constants.throttleSlewPerStep.value,
  );
  const afmSpan = constants.afmMaximumCode.value - constants.afmMinimumCode.value;
  const afmCallbackCode =
    constants.afmMinimumCode.value +
    divideNearest(throttleIntentPermille * afmSpan, constants.throttleScale.value);
  const feedback =
    input.injectorScheduleActive === null
      ? 'absent'
      : input.injectorScheduleActive
        ? 'active'
        : 'inactive';
  const starterTorqueUnits =
    input.starterEngaged && state.rpmMilli < constants.starterCutoffMilliRpm.value
      ? constants.starterTorqueUnits.value
      : 0;
  const combustionTorqueUnits =
    feedback === 'active'
      ? constants.combustionIdleTorqueUnits.value +
        divideNearest(
          constants.combustionGainTorqueUnits.value *
            (afmCallbackCode - constants.afmMinimumCode.value),
          afmSpan,
        )
      : 0;
  const dragTorqueUnits =
    divideTowardZero(
      state.rpmMilli * constants.dragLinearPermille.value,
      constants.throttleScale.value,
    ) +
    divideTowardZero(
      state.rpmMilli * state.rpmMilli,
      constants.dragQuadraticDivisorMilliRpm.value,
    );
  const brakeTorqueUnits = divideTowardZero(
    constants.brakeTorqueUnits.value * input.brakePermille,
    constants.throttleScale.value,
  );
  const netTorqueUnits =
    starterTorqueUnits + combustionTorqueUnits - dragTorqueUnits - brakeTorqueUnits;
  const accelerationMilliRpmPerSecond = divideTowardZero(
    netTorqueUnits,
    constants.inertiaDivisor.value,
  );
  const deltaMilliRpm = divideTowardZero(
    accelerationMilliRpmPerSecond * constants.fixedStepMilliseconds.value,
    1_000,
  );
  let rpmMilli = Math.min(
    constants.maximumMilliRpm.value,
    Math.max(0, state.rpmMilli + deltaMilliRpm),
  );
  if (
    rpmMilli < constants.stallMilliRpm.value &&
    starterTorqueUnits === 0 &&
    combustionTorqueUnits === 0
  ) {
    rpmMilli = 0;
  }

  return {
    step: state.step + 1,
    rpmMilli,
    throttleIntentPermille,
    afmCallbackCode,
    injectorScheduleFeedback: feedback,
    starterTorqueUnits,
    combustionTorqueUnits,
    dragTorqueUnits,
    brakeTorqueUnits,
    netTorqueUnits,
  };
};
