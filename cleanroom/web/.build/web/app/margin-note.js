"use strict";
/**
 * The margin note: point at any value and this line says what it rests on.
 *
 * Values are marked in the page by grade, and an ungrounded value is focusable
 * so the basis is reachable from the keyboard, not just the mouse.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMarginNote = void 0;
const dom_ts_1 = require("./dom.js");
const createMarginNote = (fallback) => {
    const node = (0, dom_ts_1.el)('p', { class: 'margin-note', text: fallback });
    const show = (grade, basis) => () => {
        node.textContent = basis;
        node.dataset.grade = grade;
    };
    const clear = () => {
        node.textContent = fallback;
        delete node.dataset.grade;
    };
    return {
        node,
        attach: (target, grade, basis) => {
            target.dataset.grade = grade;
            target.title = basis;
            if (grade !== 'proven')
                target.tabIndex = 0;
            target.addEventListener('pointerenter', show(grade, basis));
            target.addEventListener('focus', show(grade, basis));
            target.addEventListener('pointerleave', clear);
            target.addEventListener('blur', clear);
        },
    };
};
exports.createMarginNote = createMarginNote;
