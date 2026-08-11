/**
 * Procedural 3D cutaway of the inline-four: block shell, glass liners, crank
 * train, valvetrain, and manifolds, built from three.js primitives. All
 * dimensions come from the shared 2D cycle math so both frontends agree.
 * Front half of the casings is omitted — a display-stand cutaway.
 */

import * as THREE from 'three';
import { BASE_X, ROD_L, SPACING, THROW_R } from '../../web/app/cylinder-cycle.ts';

/** Deck height in y-up scene space (the 2D math is y-down). */
export const DECK = 184;
export const VALVE_SEAT_Y = 188;

export interface CylinderRig {
  x: number;
  piston: THREE.Group;
  rod: THREE.Mesh;
  bigEnd: THREE.Mesh;
  intakeValve: THREE.Group;
  exhaustValve: THREE.Group;
  flame: THREE.Mesh;
  flameMat: THREE.MeshStandardMaterial;
  flameLight: THREE.PointLight;
  sparkLight: THREE.PointLight;
}

export interface EngineModel {
  group: THREE.Group;
  crank: THREE.Group;
  cylinders: CylinderRig[];
  throttlePlate: THREE.Mesh;
  exhaustGlow: THREE.MeshStandardMaterial;
}

const CYL_X = [0, 1, 2, 3].map((i) => BASE_X + i * SPACING);
/** Flat-plane crank: pins of cylinders 1 and 4 up when 2 and 3 are down. */
const PIN_SIGN = [1, -1, -1, 1] as const;

const standard = (color: number, metalness: number, roughness: number): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, metalness, roughness });

const mesh = (
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  x: number,
  y: number,
  z: number,
): THREE.Mesh => {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
};

/** Cylinder whose axis runs along X (three's default is Y). */
const xCylinder = (r: number, length: number, segments = 20): THREE.CylinderGeometry => {
  const geometry = new THREE.CylinderGeometry(r, r, length, segments);
  geometry.rotateZ(Math.PI / 2);
  return geometry;
};

const buildCrank = (steel: THREE.Material, dark: THREE.Material): THREE.Group => {
  const crank = new THREE.Group();
  for (const x of [-142, -72, 0, 72, 142]) crank.add(mesh(xCylinder(9, 40), steel, x, 0, 0));
  const webGeo = new THREE.CylinderGeometry(40, 40, 6, 28);
  webGeo.rotateZ(Math.PI / 2);
  const pinGeo = xCylinder(8, 22, 16);
  CYL_X.forEach((cx, i) => {
    crank.add(mesh(webGeo, dark, cx - 13, 0, 0));
    crank.add(mesh(webGeo, dark, cx + 13, 0, 0));
    crank.add(mesh(pinGeo, steel, cx, PIN_SIGN[i] * THROW_R, 0));
  });

  // flywheel with a ring gear, keyed to the crank so it spins with it
  crank.add(mesh(new THREE.CylinderGeometry(56, 56, 12, 48).rotateZ(Math.PI / 2), dark, 174, 0, 0));
  const toothGeo = new THREE.BoxGeometry(8, 4.5, 6);
  for (let t = 0; t < 32; t += 1) {
    const a = (t / 32) * Math.PI * 2;
    const tooth = mesh(toothGeo, dark, 174, Math.cos(a) * 58, Math.sin(a) * 58);
    tooth.rotation.x = a;
    crank.add(tooth);
  }
  for (let b = 0; b < 6; b += 1) {
    const a = (b / 6) * Math.PI * 2;
    crank.add(mesh(xCylinder(3.5, 14, 10), steel, 168, Math.cos(a) * 24, Math.sin(a) * 24));
  }
  return crank;
};

const buildShell = (group: THREE.Group, casing: THREE.Material, dark: THREE.Material): void => {
  const back = mesh(new THREE.BoxGeometry(400, 150, 8), casing, 0, -15, -48);
  back.receiveShadow = true;
  group.add(back);
  group.add(mesh(new THREE.BoxGeometry(8, 150, 90), casing, -198, -15, -6));
  group.add(mesh(new THREE.BoxGeometry(8, 150, 90), casing, 198, -15, -6));
  group.add(mesh(new THREE.BoxGeometry(400, 8, 88), casing, 0, -92, -6));
  group.add(mesh(new THREE.BoxGeometry(250, 28, 80), dark, 0, -110, -6));

  // deck segments between the bores
  const spans: Array<[number, number]> = [[-178, CYL_X[0] - 23]];
  for (let i = 0; i < 3; i += 1) spans.push([CYL_X[i] + 23, CYL_X[i + 1] - 23]);
  spans.push([CYL_X[3] + 23, 178]);
  for (const [a, b] of spans) {
    group.add(mesh(new THREE.BoxGeometry(b - a, 6, 60), casing, (a + b) / 2, DECK + 3, 0));
  }

  // head and cam cover, back half only, so the valve gear stays visible
  group.add(mesh(new THREE.BoxGeometry(356, 26, 34), casing, 0, 203, -24));
  group.add(mesh(new THREE.BoxGeometry(356, 10, 34), dark, 0, 221, -24));
};

const buildValve = (alloy: THREE.Material, x: number, z: number): THREE.Group => {
  const valve = new THREE.Group();
  valve.add(mesh(new THREE.CylinderGeometry(8.5, 8.5, 2.5, 16), alloy, 0, 0, 0));
  valve.add(mesh(new THREE.CylinderGeometry(1.7, 1.7, 24, 8), alloy, 0, 13, 0));
  valve.position.set(x, VALVE_SEAT_Y, z);
  return valve;
};

const buildManifolds = (
  group: THREE.Group,
  casing: THREE.Material,
  dark: THREE.Material,
  alloy: THREE.Material,
): { throttlePlate: THREE.Mesh; exhaustGlow: THREE.MeshStandardMaterial } => {
  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(178, 196, -24),
    new THREE.Vector3(220, 188, -24),
    new THREE.Vector3(246, 150, -16),
    new THREE.Vector3(252, 80, 4),
    new THREE.Vector3(246, 16, 36),
  ]);
  group.add(mesh(new THREE.TubeGeometry(path, 40, 7, 12), dark, 0, 0, 0));
  const exhaustGlow = new THREE.MeshStandardMaterial({
    color: 0x0a0a0a,
    emissive: 0xff5a14,
    emissiveIntensity: 0,
  });
  const inner = mesh(new THREE.TubeGeometry(path, 40, 4.5, 10), exhaustGlow, 0, 0, 0);
  inner.castShadow = false;
  group.add(inner);

  group.add(mesh(xCylinder(16, 60), casing, -208, 200, -18));
  group.add(mesh(xCylinder(10, 26, 16), dark, -250, 200, -18));
  const throttlePlate = mesh(new THREE.CylinderGeometry(8.5, 8.5, 1.4, 16), alloy, -250, 200, -18);
  throttlePlate.rotation.z = Math.PI / 2;
  group.add(throttlePlate);
  return { throttlePlate, exhaustGlow };
};

export const createEngineModel = (): EngineModel => {
  const steel = standard(0x9aa4b2, 0.85, 0.4);
  const dark = standard(0x4a5462, 0.8, 0.5);
  const casing = standard(0x232b36, 0.55, 0.6);
  const alloy = standard(0xd6dde7, 0.8, 0.42);
  const ceramic = standard(0xe8ecf2, 0.1, 0.3);
  const ringMat = standard(0x1c232d, 0.4, 0.6);
  const liner = new THREE.MeshPhysicalMaterial({
    color: 0xa8c8e8,
    metalness: 0,
    roughness: 0.08,
    transparent: true,
    opacity: 0.09,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const group = new THREE.Group();
  const crank = buildCrank(steel, dark);
  group.add(crank);
  buildShell(group, casing, dark);
  const { throttlePlate, exhaustGlow } = buildManifolds(group, casing, dark, alloy);

  const linerGeo = new THREE.CylinderGeometry(23, 23, 148, 32, 1, true);
  const bodyGeo = new THREE.CylinderGeometry(20, 20, 44, 24);
  const grooveGeo = new THREE.TorusGeometry(20, 1, 8, 24);
  grooveGeo.rotateX(Math.PI / 2);
  const rodGeo = new THREE.CylinderGeometry(4.5, 4.5, ROD_L - 26, 12);
  const flameGeo = new THREE.SphereGeometry(15, 16, 12);

  const cylinders = CYL_X.map((cx) => {
    const glass = mesh(linerGeo, liner, cx, 108, 0);
    glass.castShadow = false;
    glass.renderOrder = 10;
    group.add(glass);

    const piston = new THREE.Group();
    const body = mesh(bodyGeo, alloy, 0, 4, 0);
    piston.add(body);
    for (const gy of [21, 17, 13]) piston.add(mesh(grooveGeo, ringMat, 0, gy, 0));
    group.add(piston);

    const rod = mesh(rodGeo, steel, cx, 60, 0);
    group.add(rod);
    const bigEnd = mesh(xCylinder(10.5, 16, 16), dark, cx, 0, 0);
    group.add(bigEnd);

    const intakeValve = buildValve(alloy, cx - 11, -8);
    const exhaustValve = buildValve(alloy, cx + 11, -8);
    group.add(intakeValve, exhaustValve);
    group.add(mesh(new THREE.CylinderGeometry(2.5, 2.5, 10, 10), ceramic, cx, 196, -8));

    const flameMat = new THREE.MeshStandardMaterial({
      color: 0x000000,
      emissive: 0xff7a1e,
      emissiveIntensity: 0,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.set(cx, 172, 0);
    flame.visible = false;
    group.add(flame);

    const flameLight = new THREE.PointLight(0xff8a30, 0, 220, 2);
    flameLight.position.set(cx, 160, 10);
    group.add(flameLight);
    const sparkLight = new THREE.PointLight(0xbfd8ff, 0, 120, 2);
    sparkLight.position.set(cx, 180, 4);
    group.add(sparkLight);

    return { x: cx, piston, rod, bigEnd, intakeValve, exhaustValve, flame, flameMat, flameLight, sparkLight };
  });

  return { group, crank, cylinders, throttlePlate, exhaustGlow };
};
