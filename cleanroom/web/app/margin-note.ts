/**
 * The margin note: point at any value and this line says what it rests on.
 *
 * Values are marked in the page by grade, and an ungrounded value is focusable
 * so the basis is reachable from the keyboard, not just the mouse.
 */

import { el } from './dom.ts';
import type { Grade } from './readouts.ts';

export interface MarginNote {
  node: HTMLElement;
  /** Mark `target` with its grade and make its basis reachable. */
  attach(target: HTMLElement, grade: Grade, basis: string): void;
}

export const createMarginNote = (fallback: string): MarginNote => {
  const node = el('p', { class: 'margin-note', text: fallback });

  const show = (grade: Grade, basis: string) => (): void => {
    node.textContent = basis;
    node.dataset.grade = grade;
  };
  const clear = (): void => {
    node.textContent = fallback;
    delete node.dataset.grade;
  };

  return {
    node,
    attach: (target, grade, basis) => {
      target.dataset.grade = grade;
      target.title = basis;
      if (grade !== 'proven') target.tabIndex = 0;
      target.addEventListener('pointerenter', show(grade, basis));
      target.addEventListener('focus', show(grade, basis));
      target.addEventListener('pointerleave', clear);
      target.addEventListener('blur', clear);
    },
  };
};
