/**
 * Head, valvetrain, and manifold paint for the cutaway inline-four.
 * Cams turn at half crank speed and press each valve open on its stroke;
 * the throttle butterfly tilts with the pedal and the header glows on
 * blowdown. Cycle math is shared with engine-draw.ts via cylinder-cycle.ts.
 */

import { BASE_X, DECK_Y, SPACING, cylinderCycle, exhaustPulse } from './cylinder-cycle.ts';
import type { EngineViewState } from './engine-view.ts';

const HEAD_TOP = -206;
const GALLERY_TOP = -228;
const COVER_TOP = -246;

const paintHeadBody = (ctx: CanvasRenderingContext2D): void => {
  ctx.fillStyle = '#252e3b';
  ctx.fillRect(-178, HEAD_TOP, 356, DECK_Y - HEAD_TOP);
  ctx.strokeStyle = '#6b7788';
  ctx.lineWidth = 2;
  ctx.strokeRect(-178, HEAD_TOP, 356, DECK_Y - HEAD_TOP);

  // head gasket line on the deck
  ctx.strokeStyle = '#0d1117';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-178, DECK_Y);
  ctx.lineTo(178, DECK_Y);
  ctx.stroke();

  // cam gallery recess, then the cover on top
  ctx.fillStyle = '#151b25';
  ctx.fillRect(-172, GALLERY_TOP, 344, HEAD_TOP - GALLERY_TOP);
  ctx.strokeStyle = '#4c5665';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(-172, GALLERY_TOP, 344, HEAD_TOP - GALLERY_TOP);
  ctx.fillStyle = '#2b3442';
  ctx.beginPath();
  ctx.roundRect(-178, COVER_TOP, 356, GALLERY_TOP - COVER_TOP, 6);
  ctx.fill();
  ctx.strokeStyle = '#7f8b9c';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  for (let x = -160; x < 178; x += 28) {
    ctx.beginPath();
    ctx.moveTo(x, COVER_TOP + 4);
    ctx.lineTo(x, GALLERY_TOP - 4);
    ctx.stroke();
  }
};

const paintChamber = (ctx: CanvasRenderingContext2D, cx: number): void => {
  ctx.fillStyle = '#0c1015';
  ctx.beginPath();
  ctx.moveTo(cx - 19, DECK_Y);
  ctx.lineTo(cx - 19, DECK_Y - 6);
  ctx.lineTo(cx, DECK_Y - 12);
  ctx.lineTo(cx + 19, DECK_Y - 6);
  ctx.lineTo(cx + 19, DECK_Y);
  ctx.closePath();
  ctx.fill();
};

const paintValve = (ctx: CanvasRenderingContext2D, vx: number, lift: number, camRot: number): void => {
  const drop = lift * 6;

  // cam lobe: an off-centre ellipse reads as the egg profile edge-on
  ctx.save();
  ctx.translate(vx, -217);
  ctx.rotate(camRot);
  ctx.fillStyle = '#48525f';
  ctx.beginPath();
  ctx.ellipse(3.5, 0, 10, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#7d8898';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#5a6472';
  ctx.beginPath();
  ctx.arc(0, 0, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = '#8b96a5';
  ctx.fillRect(vx - 5, -211 + drop, 10, 5);
  ctx.strokeStyle = '#c5ced9';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(vx, -206 + drop);
  ctx.lineTo(vx, -190 + drop);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(180,190,205,0.5)';
  ctx.lineWidth = 1;
  for (const y of [-203, -199, -195]) {
    ctx.beginPath();
    ctx.moveTo(vx - 4.5, y + drop * 0.5);
    ctx.lineTo(vx + 4.5, y + drop * 0.5);
    ctx.stroke();
  }
  ctx.strokeStyle = '#dfe6ef';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(vx - 6.5, -189 + drop);
  ctx.lineTo(vx + 6.5, -189 + drop);
  ctx.stroke();
};

const paintPlug = (ctx: CanvasRenderingContext2D, cx: number, spark: number): void => {
  ctx.fillStyle = '#d9dee6';
  ctx.fillRect(cx - 2.5, -216, 5, 8);
  ctx.fillStyle = '#8a94a3';
  ctx.fillRect(cx - 3.5, -208, 7, 12);
  ctx.strokeStyle = '#c5ced9';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx, -196);
  ctx.lineTo(cx, -191);
  ctx.stroke();
  if (spark > 0) {
    const flash = ctx.createRadialGradient(cx, -190, 1, cx, -190, 6 + spark * 8);
    flash.addColorStop(0, `rgba(220,235,255, ${0.9 * spark})`);
    flash.addColorStop(1, 'rgba(140,180,255, 0)');
    ctx.fillStyle = flash;
    ctx.beginPath();
    ctx.arc(cx, -190, 6 + spark * 8, 0, Math.PI * 2);
    ctx.fill();
  }
};

const paintIntake = (ctx: CanvasRenderingContext2D, state: EngineViewState): void => {
  ctx.fillStyle = '#232c38';
  ctx.beginPath();
  ctx.moveTo(-178, -204);
  ctx.lineTo(-214, -212);
  ctx.lineTo(-214, -184);
  ctx.lineTo(-178, -188);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#5a6575';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = '#2a3340';
  ctx.beginPath();
  ctx.roundRect(-246, -212, 32, 28, 5);
  ctx.fill();
  ctx.strokeStyle = '#6b7788';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#11161d';
  ctx.fillRect(-243, -205, 26, 14);
  ctx.fillStyle = '#1c232d';
  ctx.fillRect(-254, -210, 8, 24);

  // butterfly: vertical is closed, tilts open with the pedal
  ctx.save();
  ctx.translate(-230, -198);
  ctx.rotate(Math.PI / 2 - (0.12 + state.throttle * 1.15));
  ctx.strokeStyle = '#c5ced9';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-9, 0);
  ctx.lineTo(9, 0);
  ctx.stroke();
  ctx.restore();

  if (state.running && state.throttle > 0.02) {
    ctx.strokeStyle = `rgba(94, 234, 212, ${0.12 + state.throttle * 0.3})`;
    ctx.lineWidth = 1.5;
    for (const y of [-201, -196]) {
      ctx.beginPath();
      ctx.moveTo(-252, y);
      ctx.lineTo(-216, y);
      ctx.stroke();
    }
  }
};

const paintExhaust = (ctx: CanvasRenderingContext2D, state: EngineViewState, cycleAngle: number): void => {
  const pulse = state.running && state.rpm > 100 ? exhaustPulse(cycleAngle) : 0;
  const heat = state.fuelled ? 1 : 0.25;
  const pipe = (): void => {
    ctx.beginPath();
    ctx.moveTo(176, -198);
    ctx.bezierCurveTo(226, -196, 246, -172, 250, -134);
    ctx.stroke();
  };
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#454f5d';
  ctx.lineWidth = 15;
  pipe();
  ctx.strokeStyle = '#2a323d';
  ctx.lineWidth = 11;
  pipe();
  if (pulse > 0) {
    ctx.strokeStyle = `rgba(255, 150, 60, ${(0.1 + 0.4 * pulse) * heat})`;
    ctx.lineWidth = 7;
    pipe();
    const puff = ctx.createRadialGradient(250, -128, 2, 250, -128, 18);
    puff.addColorStop(0, `rgba(255, 130, 50, ${0.35 * pulse * heat})`);
    puff.addColorStop(1, 'rgba(255, 90, 30, 0)');
    ctx.fillStyle = puff;
    ctx.beginPath();
    ctx.arc(250, -128, 18, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.lineCap = 'butt';
};

export const paintHead = (
  ctx: CanvasRenderingContext2D,
  state: EngineViewState,
  cycleAngle: number,
): void => {
  paintHeadBody(ctx);
  for (let i = 0; i < 4; i += 1) {
    const cx = BASE_X + i * SPACING;
    const c = cylinderCycle(cycleAngle, i);
    paintChamber(ctx, cx);
    // cam nose points down (π/2) exactly at each valve's peak lift
    paintValve(ctx, cx - 11, c.intakeLift, (c.phase - 2.5 * Math.PI) / 2 + Math.PI / 2);
    paintValve(ctx, cx + 11, c.exhaustLift, (c.phase - 1.5 * Math.PI) / 2 + Math.PI / 2);
    paintPlug(ctx, cx, state.running && state.fuelled ? c.spark : 0);
  }
  paintIntake(ctx, state);
  paintExhaust(ctx, state, cycleAngle);
};
