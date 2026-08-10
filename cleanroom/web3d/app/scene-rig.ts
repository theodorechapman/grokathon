/**
 * Renderer + stage for the cutaway engine demo: a dark dyno-bay look.
 *
 * Owns the WebGL canvas, orbit camera, lighting, and bloom pipeline. The
 * engine model itself is built elsewhere and added to `scene` by the caller;
 * this module only sets the stage — floor, fog, environment, and post.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export interface SceneRig {
  canvas: HTMLCanvasElement;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Advance orbit damping/auto-rotate and render one frame. */
  render(dt: number): void;
  /** Resize the drawing buffer + camera + composer. */
  setSize(width: number, height: number): void;
}

const FLOOR_Y = -126;

const createRenderer = (): THREE.WebGLRenderer => {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  return renderer;
};

const createScene = (renderer: THREE.WebGLRenderer): THREE.Scene => {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0d13);
  scene.fog = new THREE.FogExp2(0x0a0d13, 0.0008);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment()).texture;
  scene.environmentIntensity = 0.55;
  pmrem.dispose();

  return scene;
};

const createFloor = (): THREE.Mesh => {
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(2200, 64),
    new THREE.MeshStandardMaterial({ color: 0x0c0f14, roughness: 0.9, metalness: 0.1 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = FLOOR_Y;
  floor.receiveShadow = true;
  return floor;
};

const createKeyLight = (): THREE.SpotLight => {
  const key = new THREE.SpotLight(0xfff4e6, 6);
  key.position.set(250, 450, 300);
  key.angle = Math.PI / 4;
  key.penumbra = 0.5;
  key.decay = 0;
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004;
  key.shadow.camera.near = 50;
  key.shadow.camera.far = 1500;
  return key;
};

const createRimLight = (): THREE.DirectionalLight => {
  const rim = new THREE.DirectionalLight(0x7fa8d8, 1.2);
  rim.position.set(-300, 200, -300);
  return rim;
};

export const createSceneRig = (): SceneRig => {
  const renderer = createRenderer();
  const scene = createScene(renderer);
  scene.add(createFloor(), createKeyLight(), createRimLight());

  const camera = new THREE.PerspectiveCamera(40, 1, 1, 4000);
  camera.position.set(320, 210, 640);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(10, 40, 0);
  controls.enableDamping = true;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.5;
  // Sway, don't orbit: ping-pong the auto-rotation ±90° around the home view
  // (a full lap spends half the time behind the engine).
  const swayCenter = Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z);
  controls.minDistance = 220;
  controls.maxDistance = 1000;
  controls.maxPolarAngle = Math.PI / 2 + 0.15 - 0.01;
  controls.update();

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0.4, 1.0);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  return {
    canvas: renderer.domElement,
    scene,
    camera,
    render: (dt: number): void => {
      // Positive autoRotateSpeed decreases the azimuth; flip at the sway edges.
      const azimuth = controls.getAzimuthalAngle();
      if (azimuth < swayCenter - Math.PI / 2) controls.autoRotateSpeed = -0.5;
      else if (azimuth > swayCenter + Math.PI / 2) controls.autoRotateSpeed = 0.5;
      controls.update(dt);
      composer.render();
    },
    setSize: (width: number, height: number): void => {
      renderer.setSize(width, height);
      composer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    },
  };
};
