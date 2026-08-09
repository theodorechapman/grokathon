/**
 * The memory panel: the specification's named locations, live.
 *
 * This is the grounding claim made visible. Each tile is an address SPECS.md
 * recovered, holding whatever the running controller has put there this
 * millisecond — read back through `idata.read`, `idata.getBit` and
 * `xram.read`, not from any bookkeeping the page keeps of its own.
 */

import { el } from './dom.ts';
import type { Snapshot } from './bench.ts';
import { MEMORY_CELLS, type MemorySpace } from './memory-cells.ts';
import type { Panel } from './panel.ts';

const SPACES: ReadonlyArray<{ space: MemorySpace; caption: string }> = [
  { space: 'INTMEM', caption: 'the 256 bytes on the processor itself' },
  { space: 'BITS', caption: 'single bits, each with its own address' },
  { space: 'XRAM', caption: 'the memory chip alongside it' },
];

/** Milliseconds a changed byte stays highlighted. */
const FLASH_MS = 500;

const hex = (value: number, width: number): string => value.toString(16).padStart(width, '0');

export const createMemoryPanel = (): Panel => {
  const tiles = MEMORY_CELLS.map((cell) => {
    const value = el('span', { class: 'cell-value', text: '··' });
    const node = el('div', {
      class: `cell cell-${cell.space.toLowerCase()}`,
      title: cell.note ?? `${cell.space}:${hex(cell.address, cell.space === 'XRAM' ? 4 : 2)}`,
      children: [
        el('span', {
          class: 'cell-address',
          text: hex(cell.address, cell.space === 'XRAM' ? 4 : 2),
        }),
        el('span', { class: 'cell-name', text: cell.name }),
        value,
      ],
    });
    return { cell, node, value, last: -1, changedAt: -Infinity, flash: 0 };
  });

  const columns = SPACES.map(({ space, caption }) =>
    el('div', {
      class: 'cell-column',
      children: [
        el('h3', {
          children: [
            el('span', { class: 'space-name', text: space }),
            el('span', { class: 'space-caption', text: caption }),
          ],
        }),
        el('div', {
          class: `cell-grid cell-grid-${space.toLowerCase()}`,
          children: tiles.filter((tile) => tile.cell.space === space).map((tile) => tile.node),
        }),
      ],
    }),
  );

  const node = el('section', {
    class: 'panel panel-memory',
    children: [
      el('header', {
        class: 'panel-head',
        children: [
          el('span', { class: 'tab', text: 'memory' }),
          el('h2', { text: 'Inside the chip, right now' }),
          el('p', {
            class: 'panel-note',
            text: 'A processor this old has a few hundred bytes of memory, and taking the ROM apart revealed what some of them are for. Each tile is one of those bytes at its real address, holding whatever the running controller has put there. Yellow means it changed in the last moment. Engine speed sits at 003b and load at 0040 — those two move constantly. The single bit at BITS:0038 turns black when the rev limiter fires.',
          }),
        ],
      }),
      el('div', { class: 'cell-columns', children: columns }),
    ],
  });

  return {
    node,
    update: (snapshot: Snapshot) => {
      if (!snapshot.availability.memory) {
        for (const tile of tiles) {
          tile.value.textContent = 'unavailable';
          tile.node.classList.remove('is-set');
          tile.node.style.setProperty('--flash', '0');
        }
        return;
      }
      const now = snapshot.machineMs;
      for (let index = 0; index < tiles.length; index += 1) {
        const tile = tiles[index];
        const raw = snapshot.cells[index];
        if (raw !== tile.last) {
          tile.last = raw;
          tile.changedAt = now;
          tile.value.textContent =
            tile.cell.space === 'BITS' ? (raw === 1 ? '1' : '0') : hex(raw, 2);
          tile.node.classList.toggle('is-set', tile.cell.space === 'BITS' && raw === 1);
        }
        const flash = Math.max(0, 1 - (now - tile.changedAt) / FLASH_MS);
        if (flash !== tile.flash) {
          tile.flash = flash;
          tile.node.style.setProperty('--flash', flash.toFixed(2));
        }
      }
    },
  };
};
