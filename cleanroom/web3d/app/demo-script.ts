/**
 * Attract-mode timeline: sweeps the throttle and load levers through a loop of
 * accelerator states (idle, cruise, full pull, lift, limiter, coast) with
 * smooth ramps, so the bench demonstrates itself until someone takes over.
 */

export interface LeverTargets {
  throttle: number;
  brake: number;
}

interface DemoPhase extends LeverTargets {
  /** Seconds spent easing from the previous phase's levers to this one's. */
  ramp: number;
  /** Seconds the levers rest at this phase's position. */
  hold: number;
}

const PHASES: readonly DemoPhase[] = [
  { throttle: 0, brake: 0, ramp: 1.6, hold: 2.4 },
  { throttle: 0.3, brake: 0.24, ramp: 2.0, hold: 3.0 },
  { throttle: 1, brake: 0.12, ramp: 1.1, hold: 3.6 },
  { throttle: 0.12, brake: 0.45, ramp: 0.9, hold: 2.0 },
  { throttle: 1, brake: 0, ramp: 1.3, hold: 3.4 },
  { throttle: 0, brake: 0.35, ramp: 1.2, hold: 2.2 },
];

const smoothstep = (t: number): number => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export interface DemoScript {
  /** Advance the timeline and return where the levers should sit now. */
  advance(seconds: number): LeverTargets;
  reset(): void;
}

export const createDemoScript = (): DemoScript => {
  let index = 0;
  let elapsed = 0;
  let from: LeverTargets = { throttle: 0, brake: 0 };

  return {
    reset: () => {
      index = 0;
      elapsed = 0;
      from = { throttle: 0, brake: 0 };
    },
    advance: (seconds) => {
      const phase = PHASES[index];
      elapsed += Math.max(0, seconds);
      if (elapsed >= phase.ramp + phase.hold) {
        from = { throttle: phase.throttle, brake: phase.brake };
        index = (index + 1) % PHASES.length;
        elapsed = 0;
        return from;
      }
      const t = phase.ramp <= 0 ? 1 : Math.min(1, elapsed / phase.ramp);
      const eased = smoothstep(t);
      return {
        throttle: lerp(from.throttle, phase.throttle, eased),
        brake: lerp(from.brake, phase.brake, eased),
      };
    },
  };
};
