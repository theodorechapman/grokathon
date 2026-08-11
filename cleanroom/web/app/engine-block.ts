/**
 * Static scenery for the cutaway inline-four: dyno-bay backdrop, block
 * casting, oil pan, and cylinder bores. The moving parts are painted by
 * engine-draw.ts on top of this.
 */

import { BORE, DECK_Y } from './cylinder-cycle.ts';

const TAU = Math.PI * 2;

export const paintBackdrop = (ctx: CanvasRenderingContext2D, w: number, h: number): void => {
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#131722');
  bg.addColorStop(0.7, '#0c0f15');
  bg.addColorStop(1, '#080a0e');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(120, 140, 160, 0.07)';
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 36) {
    ctx.beginPath();
    ctx.moveTo(x, h * 0.72);
    ctx.lineTo(x + 40, h);
    ctx.stroke();
  }
};

export const paintBlock = (ctx: CanvasRenderingContext2D): void => {
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(6, 56, 218, 26, 0, 0, TAU);
  ctx.fill();

  const steel = ctx.createLinearGradient(0, DECK_Y, 0, 98);
  steel.addColorStop(0, '#2c3543');
  steel.addColorStop(0.55, '#212936');
  steel.addColorStop(1, '#171d27');
  ctx.fillStyle = steel;
  ctx.beginPath();
  ctx.moveTo(-178, DECK_Y);
  ctx.lineTo(178, DECK_Y);
  ctx.lineTo(196, 46);
  ctx.lineTo(-196, 46);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#66748a';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // oil pan with a glint of oil at the sump line
  ctx.fillStyle = '#131820';
  ctx.beginPath();
  ctx.moveTo(-150, 46);
  ctx.lineTo(150, 46);
  ctx.lineTo(112, 98);
  ctx.lineTo(-112, 98);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#4c5665';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(212, 158, 64, 0.3)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-118, 78);
  ctx.lineTo(118, 78);
  ctx.stroke();
};

export const paintBore = (ctx: CanvasRenderingContext2D, cx: number): void => {
  const wall = ctx.createLinearGradient(cx - BORE / 2, 0, cx + BORE / 2, 0);
  wall.addColorStop(0, '#0d1117');
  wall.addColorStop(0.5, '#1a212b');
  wall.addColorStop(1, '#0d1117');
  ctx.fillStyle = wall;
  ctx.fillRect(cx - BORE / 2, DECK_Y, BORE, 178);
  ctx.strokeStyle = '#4a5566';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - BORE / 2, DECK_Y);
  ctx.lineTo(cx - BORE / 2, -6);
  ctx.moveTo(cx + BORE / 2, DECK_Y);
  ctx.lineTo(cx + BORE / 2, -6);
  ctx.stroke();
};
