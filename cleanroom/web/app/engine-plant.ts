/**
 * The engine on the other side of the connector — bench equipment, not the ECU.
 *
 * Nothing in SPECS.md describes an engine, and nothing in `src/` models one.
 * This is a first-order inertia that turns throttle and "is the controller
 * still injecting" into a crank speed, so the page has something to stimulate
 * the capture input with. Every constant below is made up for the demo, which
 * is why it lives here and not in the model.
 *
 * The one behaviour worth the code: when the controller latches BITS:0038 and
 * fuel goes to zero, torque goes with it, speed falls back through the resume
 * point, and the latch releases — the rev limiter bounces on its own.
 */

export interface PlantInputs {
  /** 0..1 pedal. */
  throttle: number;
  /** 0..1 dyno brake, so wide-open throttle can be held below the limiter. */
  brake: number;
  /** Starter motor engaged. */
  cranking: boolean;
  /** True while the controller is still commanding injection. */
  fuelled: boolean;
}

/** Full-throttle torque, in rpm/s before inertia. */
const TORQUE_GAIN = 13_000;
const IDLE_FRACTION = 0.05;
const DRAG_LINEAR = 0.6;
const DRAG_QUADRATIC = 1.1 / 6500;
const STARTER_TORQUE = 2200;
const BRAKE_GAIN = 2.5;
const INERTIA = 3.5;
const STALL_RPM = 60;

export interface EnginePlant {
  rpm(): number;
  advance(seconds: number, inputs: PlantInputs): void;
  stop(): void;
}

export const createEnginePlant = (): EnginePlant => {
  let rpm = 0;

  return {
    rpm: () => rpm,
    stop: () => {
      rpm = 0;
    },
    advance: (seconds, inputs) => {
      const pedal = Math.min(1, Math.max(0, inputs.throttle));
      const torque = inputs.fuelled
        ? (IDLE_FRACTION + (1 - IDLE_FRACTION) * pedal ** 1.3) * TORQUE_GAIN
        : 0;
      const starter = inputs.cranking && rpm < 400 ? STARTER_TORQUE : 0;
      const brake = 1 + BRAKE_GAIN * Math.min(1, Math.max(0, inputs.brake));
      const drag = rpm * (DRAG_LINEAR + DRAG_QUADRATIC * rpm) * brake;
      rpm = Math.max(0, rpm + ((torque + starter - drag) / INERTIA) * seconds);
      if (rpm < STALL_RPM && !inputs.cranking) rpm = 0;
    },
  };
};
