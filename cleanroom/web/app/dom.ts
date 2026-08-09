/**
 * The only DOM helper this demo needs. No framework: the page is a fixed set of
 * panels whose text nodes are rewritten every frame.
 */

export interface ElementOptions {
  class?: string;
  text?: string;
  title?: string;
  attrs?: Record<string, string>;
  on?: Record<string, (event: Event) => void>;
  children?: Array<Node | string>;
}

export const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: ElementOptions = {},
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (options.class !== undefined) node.className = options.class;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.title !== undefined) node.title = options.title;
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
