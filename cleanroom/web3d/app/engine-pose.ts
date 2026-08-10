/**
 * Per-frame pose for the 3D engine: crank rotation, rod/piston kinematics,
 * valve lift, combustion and spark light levels — all derived from the shared
 * four-stroke cycle math. The 2D math is y-down; scene space is y-up, so the
 * vertical axis flips and the crankpin's screen-x offset becomes depth (z).
 */

import * as THREE from 'three';
import { cylinderCycle, exhaustPulse } from '../../web/app/cylinder-cycle.ts';
import type { EngineViewState } from '../../web/app/engine-view.ts';
import type { EngineModel } from './engine-model.ts';
import { VALVE_SEAT_Y } from './engine-model.ts';

const UP = new THREE.Vector3(0, 1, 0);
const pin = new THREE.Vector3();
const wrist = new THREE.Vector3();
const dir = new THREE.Vector3();

export const poseEngine = (
  model: EngineModel,
  state: EngineViewState,
  cycleAngle: number,
  vibPhase: number,
): void => {
  // Cylinder 1's throw is the crank's reference; TDC puts its pin at +y.
  model.crank.rotation.x = cylinderCycle(cycleAngle, 0).angle + Math.PI / 2;

  const firing = state.running && state.fuelled;
  model.cylinders.forEach((rig, i) => {
    const c = cylinderCycle(cycleAngle, i);
    pin.set(rig.x, -c.pinY, c.pinX);
    wrist.set(rig.x, -c.pistonY, 0);

    rig.piston.position.copy(wrist);
    rig.bigEnd.position.copy(pin);
    dir.subVectors(wrist, pin).normalize();
    rig.rod.quaternion.setFromUnitVectors(UP, dir);
    rig.rod.position.addVectors(pin, wrist).multiplyScalar(0.5);

    rig.intakeValve.position.y = VALVE_SEAT_Y - c.intakeLift * 8;
    rig.exhaustValve.position.y = VALVE_SEAT_Y - c.exhaustLift * 8;

    const strength = firing ? c.combustion * (0.5 + state.throttle * 0.5) : 0;
    rig.flame.visible = strength > 0.02;
    rig.flame.scale.set(1, 0.35 + strength * 0.8, 1);
    rig.flameMat.emissiveIntensity = 1 + strength * 7;
    rig.flameLight.intensity = strength * 12000;
    rig.sparkLight.intensity = firing ? c.spark * 6000 : 0;
  });

  model.exhaustGlow.emissiveIntensity = state.running
    ? (0.15 + 2.2 * exhaustPulse(cycleAngle)) * (state.fuelled ? 1 : 0.25)
    : 0;

  model.throttlePlate.rotation.z = Math.PI / 2 - (0.1 + state.throttle * 1.2);

  const amp = state.running
    ? Math.min(2.5, 0.3 + (state.rpm / 7000) * 1.2 + (state.cutting ? 1.5 : 0))
    : 0;
  model.group.position.set(
    Math.sin(vibPhase) * amp * 0.5,
    Math.cos(vibPhase * 1.7) * amp * 0.3,
    0,
  );
};
