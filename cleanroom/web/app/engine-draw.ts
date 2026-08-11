/**
 * Canvas paint routines for the moving parts of the cutaway inline-four:
 * crank train, pistons, combustion, and flywheel. Static scenery lives in
 * engine-block.ts, the head in engine-head.ts, cycle math in cylinder-cycle.ts.
 */

import type { CylinderState } from './cylinder-cycle.ts';
import { BASE_X, BORE, DECK_Y, SPACING, THROW_R, cylinderCycle } from './cylinder-cycle.ts';
import { paintBackdrop, paintBlock, paintBore } from './engine-block.ts';
import { paintHead } from './engine-head.ts';
import type { EngineViewState } from './engine-view.ts';

const TAU = Math.PI * 2;

const paintCrankWeb = (ctx: CanvasRenderingContext2D, cx: number, angle: number): void => {
  ctx.save();
  ctx.translate(cx, 0);
  ctx.rotate(angle);
  // counterweight sector opposite the pin, then the arm out to it
  ctx.fillStyle = '#333d4b';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, 42, Math.PI - 0.95, Math.PI + 0.95);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#6f7b8c';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = '#3c4654';
  ctx.beginPath();
  ctx.roundRect(-8, -11, THROW_R + 16, 22, 8);
  ctx.fill();
  ctx.strokeStyle = '#727e90';
  ctx.stroke();
  ctx.restore();
};

const paintPiston = (ctx: CanvasRenderingContext2D, cx: number, c: CylinderState): void => {
  const crownY = c.pistonY - 26;

  ctx.strokeStyle = '#b7c1cf';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(cx + c.pinX, c.pinY);
  ctx.lineTo(cx, c.pistonY);
  ctx.stroke();
  ctx.strokeStyle = '#69758a';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = '#4d5867';
  ctx.beginPath();
  ctx.arc(cx + c.pinX, c.pinY, 10, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#94a0b0';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#202832';
  ctx.beginPath();
  ctx.arc(cx + c.pinX, c.pinY, 4, 0, TAU);
  ctx.fill();

  const skin = ctx.createLinearGradient(cx - BORE / 2, 0, cx + BORE / 2, 0);
  skin.addColorStop(0, '#d3dae4');
  skin.addColorStop(0.55, '#9aa5b4');
  skin.addColorStop(1, '#7e8a99');
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.roundRect(cx - BORE / 2 + 3, crownY, BORE - 6, 40, 3);
  ctx.fill();
  ctx.strokeStyle = '#e8eef5';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // ring pack lives just under the crown, not at the pin
  ctx.strokeStyle = 'rgba(24, 28, 36, 0.55)';
  ctx.lineWidth = 1.5;
  for (const dy of [5, 9.5, 14]) {
    ctx.beginPath();
    ctx.moveTo(cx - BORE / 2 + 5, crownY + dy);
    ctx.lineTo(cx + BORE / 2 - 5, crownY + dy);
    ctx.stroke();
  }

  ctx.fillStyle = '#7a8798';
  ctx.beginPath();
  ctx.arc(cx, c.pistonY, 5, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#dfe6ef';
  ctx.lineWidth = 1.2;
  ctx.stroke();
};

const paintCharge = (ctx: CanvasRenderingContext2D, state: EngineViewState, cx: number, c: CylinderState): void => {
  const crownY = c.pistonY - 26;
  const strength = c.combustion * (0.55 + state.throttle * 0.45);
  if (state.fuelled && state.running && strength > 0.06) {
    const flame = ctx.createLinearGradient(0, DECK_Y - 10, 0, crownY + 10);
    flame.addColorStop(0, `rgba(255, 246, 205, ${Math.min(1, 1.1 * strength)})`);
    flame.addColorStop(0.4, `rgba(255, 168, 60, ${0.7 * strength})`);
    flame.addColorStop(1, 'rgba(255, 90, 20, 0)');
    ctx.fillStyle = flame;
    ctx.fillRect(cx - BORE / 2 + 3, DECK_Y - 9, BORE - 6, crownY - DECK_Y + 18);
    const core = ctx.createRadialGradient(cx, DECK_Y + 6, 2, cx, DECK_Y + 6, 20);
    core.addColorStop(0, `rgba(255, 255, 230, ${0.75 * strength})`);
    core.addColorStop(1, 'rgba(255, 200, 80, 0)');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(cx, DECK_Y + 6, 20, 0, TAU);
    ctx.fill();
  } else if (state.running && c.intakeLift > 0) {
    ctx.fillStyle = `rgba(96, 196, 232, ${(0.05 + 0.12 * state.throttle) * c.intakeLift})`;
    ctx.fillRect(cx - BORE / 2 + 3, DECK_Y - 4, BORE - 6, crownY - DECK_Y + 2);
  }
};

const paintFlywheel = (ctx: CanvasRenderingContext2D, cycleAngle: number, rpm: number): void => {
  ctx.save();
  ctx.translate(BASE_X + 3 * SPACING + 82, 0);
  const disc = ctx.createRadialGradient(0, 0, 8, 0, 0, 58);
  disc.addColorStop(0, '#38424f');
  disc.addColorStop(1, '#262e3a');
  ctx.fillStyle = disc;
  ctx.beginPath();
  ctx.arc(0, 0, 58, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#93a0b1';
  ctx.lineWidth = 3;
  ctx.stroke();

  // ring gear + spokes; extra ghosted passes read as motion blur at speed
  const passes = rpm > 2500 ? 3 : 1;
  for (let p = 0; p < passes; p += 1) {
    ctx.save();
    ctx.rotate((cycleAngle % TAU) - p * 0.11);
    ctx.globalAlpha = 1 / (p + 1);
    ctx.strokeStyle = '#5b6779';
    ctx.lineWidth = 2;
    for (let t = 0; t < 28; t += 1) {
      const a = (t / 28) * TAU;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 52, Math.sin(a) * 52);
      ctx.lineTo(Math.cos(a) * 57, Math.sin(a) * 57);
      ctx.stroke();
    }
    ctx.strokeStyle = '#6a7688';
    for (let s = 0; s < 8; s += 1) {
      const a = (s / 8) * TAU;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 17, Math.sin(a) * 17);
      ctx.lineTo(Math.cos(a) * 48, Math.sin(a) * 48);
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#ccd4e0';
  ctx.beginPath();
  ctx.arc(0, 0, 13, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#8b96a5';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
};

export const paintEngine = (
  ctx: CanvasRenderingContext2D,
  cssW: number,
  cssH: number,
  state: EngineViewState,
  cycleAngle: number,
  vibPhase: number,
): void => {
  ctx.clearRect(0, 0, cssW, cssH);
  paintBackdrop(ctx, cssW, cssH);

  const scale = Math.min(cssW, cssH) / 545;
  const amp = state.running
    ? Math.min(4, 0.5 + (state.rpm / 7000) * 2 + (state.cutting ? 2.2 : 0))
    : 0;
  ctx.save();
  ctx.translate(cssW * 0.48 + Math.sin(vibPhase) * amp * 0.7, cssH * 0.6 + Math.cos(vibPhase * 1.7) * amp * 0.4);
  ctx.scale(scale, scale);

  paintBlock(ctx);
  for (let i = 0; i < 4; i += 1) paintBore(ctx, BASE_X + i * SPACING);
  paintHead(ctx, state, cycleAngle);

  ctx.strokeStyle = '#39424f';
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(BASE_X - 46, 0);
  ctx.lineTo(BASE_X + 3 * SPACING + 46, 0);
  ctx.stroke();

  for (let i = 0; i < 4; i += 1) {
    const cx = BASE_X + i * SPACING;
    const c = cylinderCycle(cycleAngle, i);
    paintCrankWeb(ctx, cx, c.angle);
    paintPiston(ctx, cx, c);
    paintCharge(ctx, state, cx, c);
  }
  paintFlywheel(ctx, cycleAngle, state.rpm);
  ctx.restore();

  ctx.fillStyle = 'rgba(200, 210, 220, 0.45)';
  ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText('INLINE-4  ·  FIRING 1-3-4-2  ·  CUTAWAY SLOWED FOR CLARITY', 16, cssH - 16);
};
