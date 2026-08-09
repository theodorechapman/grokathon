interface CrankGeometry {
  machineCyclesPerSecond: number;
  positionsPerRevolution: number;
  missingPositions: readonly number[];
  captureEdge: 'falling';
  pulseWidthCycles: number;
  initialSettleCycles: number;
}

interface CrankSchedulerState {
  nextCycle: number;
  nextPosition: number;
  nextRevolution: number;
  fractionalRemainderAngleUnits: number;
  lastTransitionCycle: number;
  geometrySignature: string;
}

interface CrankTransition {
  cycle: number;
  event: 'cc0-line';
  level: 0 | 1;
}

interface ScheduledCrankPulse {
  slot: {
    cycle: number;
    position: number;
    revolution: number;
    present: boolean;
  };
  transitions: CrankTransition[];
  state: CrankSchedulerState;
}

const requireInteger = (value: number, minimum: number, path: string): void => {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${path} must be a safe integer at least ${minimum}`);
  }
};

const validateGeometry = (geometry: CrankGeometry): void => {
  requireInteger(geometry.machineCyclesPerSecond, 1, 'geometry.machineCyclesPerSecond');
  requireInteger(geometry.positionsPerRevolution, 2, 'geometry.positionsPerRevolution');
  requireInteger(geometry.pulseWidthCycles, 1, 'geometry.pulseWidthCycles');
  requireInteger(geometry.initialSettleCycles, 1, 'geometry.initialSettleCycles');
  if (geometry.captureEdge !== 'falling') {
    throw new Error('geometry.captureEdge must be falling');
  }
  let previous = -1;
  for (const position of geometry.missingPositions) {
    requireInteger(position, 0, 'geometry.missingPositions entry');
    if (position >= geometry.positionsPerRevolution) {
      throw new Error('missing position lies outside the configured wheel');
    }
    if (position <= previous) {
      throw new Error('missing positions must be unique and increasing');
    }
    previous = position;
  }
  if (geometry.missingPositions.length === geometry.positionsPerRevolution) {
    throw new Error('wheel cannot omit every position');
  }
};

const signatureFor = (geometry: CrankGeometry): string =>
  [
    geometry.machineCyclesPerSecond,
    geometry.positionsPerRevolution,
    geometry.missingPositions.join(','),
    geometry.captureEdge,
    geometry.pulseWidthCycles,
    geometry.initialSettleCycles,
  ].join('/');

const divideNearestTiesUp = (numerator: number, denominator: number): number =>
  Math.floor((numerator * 2 + denominator) / (denominator * 2));

const initialState = (
  geometry: CrankGeometry,
  geometrySignature: string,
  startCycle: number,
): CrankSchedulerState => ({
  nextCycle: startCycle + geometry.initialSettleCycles,
  nextPosition: 0,
  nextRevolution: 0,
  fractionalRemainderAngleUnits: 0,
  lastTransitionCycle: 0,
  geometrySignature,
});

const validateState = (
  state: CrankSchedulerState,
  geometrySignature: string,
  geometry: CrankGeometry,
): void => {
  if (state.geometrySignature !== geometrySignature) {
    throw new Error('crank geometry cannot change while a schedule is active');
  }
  requireInteger(state.nextCycle, geometry.initialSettleCycles, 'state.nextCycle');
  requireInteger(state.nextPosition, 0, 'state.nextPosition');
  if (state.nextPosition >= geometry.positionsPerRevolution) {
    throw new Error('state.nextPosition lies outside the configured wheel');
  }
  requireInteger(state.nextRevolution, 0, 'state.nextRevolution');
  requireInteger(state.lastTransitionCycle, 0, 'state.lastTransitionCycle');
  if (!Number.isSafeInteger(state.fractionalRemainderAngleUnits)) {
    throw new Error('state fractional remainder must be a safe integer');
  }
};

export const scheduleNextCrankPulse = (
  priorState: CrankSchedulerState | null,
  rpmMilli: number,
  geometry: CrankGeometry,
  startCycle = 0,
): ScheduledCrankPulse => {
  validateGeometry(geometry);
  requireInteger(rpmMilli, 1, 'rpmMilli');
  requireInteger(startCycle, 0, 'startCycle');
  const geometrySignature = signatureFor(geometry);
  const state = priorState ?? initialState(geometry, geometrySignature, startCycle);
  validateState(state, geometrySignature, geometry);

  const present = !geometry.missingPositions.includes(state.nextPosition);
  const transitions: CrankTransition[] = priorState === null
    ? [{ cycle: startCycle, event: 'cc0-line', level: 1 }]
    : [];
  let lastTransitionCycle = state.lastTransitionCycle;
  if (present) {
    if (state.nextCycle <= lastTransitionCycle) {
      throw new Error('crank pulses overlap at the configured speed');
    }
    transitions.push(
      { cycle: state.nextCycle, event: 'cc0-line', level: 0 },
      {
        cycle: state.nextCycle + geometry.pulseWidthCycles,
        event: 'cc0-line',
        level: 1,
      },
    );
    lastTransitionCycle = state.nextCycle + geometry.pulseWidthCycles;
  }

  const targetAngleUnits = geometry.machineCyclesPerSecond * 60_000;
  const rateAngleUnitsPerCycle = rpmMilli * geometry.positionsPerRevolution;
  if (
    !Number.isSafeInteger(targetAngleUnits) ||
    !Number.isSafeInteger(rateAngleUnitsPerCycle)
  ) {
    throw new Error('crank rate exceeds exact integer arithmetic limits');
  }
  const angleUnitsRemaining =
    targetAngleUnits - state.fractionalRemainderAngleUnits;
  const intervalCycles = divideNearestTiesUp(
    angleUnitsRemaining,
    rateAngleUnitsPerCycle,
  );
  if (intervalCycles <= geometry.pulseWidthCycles) {
    throw new Error('configured speed cannot produce distinct two-level pulses');
  }
  const nextCycle = state.nextCycle + intervalCycles;
  const fractionalRemainderAngleUnits =
    state.fractionalRemainderAngleUnits +
    intervalCycles * rateAngleUnitsPerCycle -
    targetAngleUnits;
  if (
    !Number.isSafeInteger(nextCycle) ||
    !Number.isSafeInteger(fractionalRemainderAngleUnits)
  ) {
    throw new Error('crank schedule exceeds exact integer arithmetic limits');
  }
  const nextPosition =
    (state.nextPosition + 1) % geometry.positionsPerRevolution;
  const nextRevolution =
    state.nextRevolution + (nextPosition === 0 ? 1 : 0);

  return {
    slot: {
      cycle: state.nextCycle,
      position: state.nextPosition,
      revolution: state.nextRevolution,
      present,
    },
    transitions,
    state: {
      nextCycle,
      nextPosition,
      nextRevolution,
      fractionalRemainderAngleUnits,
      lastTransitionCycle,
      geometrySignature,
    },
  };
};
