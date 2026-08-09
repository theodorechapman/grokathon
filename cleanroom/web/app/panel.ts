/** What every panel on the page is: a node, and a way to refresh it. */

import type { Snapshot } from './bench.ts';

export interface Panel {
  node: HTMLElement;
  update(snapshot: Snapshot): void;
}
