"use strict";
/**
 * The only DOM helper this demo needs. No framework: the page is a fixed set of
 * panels whose text nodes are rewritten every frame.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.el = void 0;
const el = (tag, options = {}) => {
    const node = document.createElement(tag);
    if (options.class !== undefined)
        node.className = options.class;
    if (options.text !== undefined)
        node.textContent = options.text;
    if (options.title !== undefined)
        node.title = options.title;
    for (const [name, value] of Object.entries(options.attrs ?? {})) {
        node.setAttribute(name, value);
    }
    for (const [name, handler] of Object.entries(options.on ?? {})) {
        node.addEventListener(name, handler);
    }
    for (const child of options.children ?? []) {
        node.append(child);
    }
    return node;
};
exports.el = el;
