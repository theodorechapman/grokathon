/**
 * Cutaway inline-four that turns on the canvas.
 *
 * The crank is integrated over a full 720° four-stroke cycle so firing order,
 * valve events, and spark all stay phased. Display speed is a compressed map
 * of plant RPM — real crank speed would alias to noise at 60 fps — while the
 * vibration phase tracks the true speed so the engine still feels fast.
 */

import { paintEngine } from './engine-draw.ts';

export interface EngineViewState {
  rpm: number;
  running: boolean;
  throttle: number;
  fuelled: boolean;
  cutting: boolean;
}

export interface EngineView {
  node: HTMLCanvasElement;
  setSize(width: number, height: number): void;
  draw(state: EngineViewState, seconds: number): void;
}

const TAU = Math.PI * 2;
const CYCLE = 2 * TAU;

const displayRevPerSec = (rpm: number): number => (rpm <= 0 ? 0 : 0.9 + (rpm / 7000) * 3.4);

export const createEngineView = (): EngineView => {
  const node = document.createElement('canvas');
  node.className = 'engine-canvas';
  node.setAttribute('aria-label', 'Animated cutaway of a four-cylinder engine');
  const ctx = node.getContext('2d');
  if (ctx === null) throw new Error('2d canvas is unavailable');

  let cssW = 640;
  let cssH = 420;
  let cycleAngle = 0;
  let vibPhase = 0;

  const setSize = (width: number, height: number): void => {
    cssW = Math.max(320, Math.floor(width));
    cssH = Math.max(240, Math.floor(height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    node.width = Math.floor(cssW * dpr);
    node.height = Math.floor(cssH * dpr);
    node.style.width = `${cssW}px`;
    node.style.height = `${cssH}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const draw = (state: EngineViewState, seconds: number): void => {
    const dt = Math.min(0.05, Math.max(0, seconds));
    if (state.running && state.rpm > 0) {
      cycleAngle = (cycleAngle + displayRevPerSec(state.rpm) * TAU * dt) % CYCLE;
      vibPhase = (vibPhase + (state.rpm / 60) * TAU * dt) % TAU;
    }
    paintEngine(ctx, cssW, cssH, state, cycleAngle, vibPhase);
  };

  setSize(cssW, cssH);
  return { node, setSize, draw };
};
