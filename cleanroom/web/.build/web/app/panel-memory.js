"use strict";
/**
 * The memory panel: the specification's named locations, live.
 *
 * This is the grounding claim made visible. Each tile is an address SPECS.md
 * recovered, holding whatever the running controller has put there this
 * millisecond — read back through `idata.read`, `idata.getBit` and
 * `xram.read`, not from any bookkeeping the page keeps of its own.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMemoryPanel = void 0;
const dom_ts_1 = require("./dom.js");
const memory_cells_ts_1 = require("./memory-cells.js");
const SPACES = [
    { space: 'INTMEM', caption: 'the 256 bytes on the processor itself' },
    { space: 'BITS', caption: 'single bits, each with its own address' },
    { space: 'XRAM', caption: 'the memory chip alongside it' },
];
/** Milliseconds a changed byte stays highlighted. */
const FLASH_MS = 500;
const hex = (value, width) => value.toString(16).padStart(width, '0');
const createMemoryPanel = () => {
    const tiles = memory_cells_ts_1.MEMORY_CELLS.map((cell) => {
        const value = (0, dom_ts_1.el)('span', { class: 'cell-value', text: '··' });
        const node = (0, dom_ts_1.el)('div', {
            class: `cell cell-${cell.space.toLowerCase()}`,
            title: cell.note ?? `${cell.space}:${hex(cell.address, cell.space === 'XRAM' ? 4 : 2)}`,
            children: [
                (0, dom_ts_1.el)('span', {
                    class: 'cell-address',
                    text: hex(cell.address, cell.space === 'XRAM' ? 4 : 2),
                }),
                (0, dom_ts_1.el)('span', { class: 'cell-name', text: cell.name }),
                value,
            ],
        });
        return { cell, node, value, last: -1, changedAt: -Infinity, flash: 0 };
    });
    const columns = SPACES.map(({ space, caption }) => (0, dom_ts_1.el)('div', {
        class: 'cell-column',
        children: [
            (0, dom_ts_1.el)('h3', {
                children: [
                    (0, dom_ts_1.el)('span', { class: 'space-name', text: space }),
                    (0, dom_ts_1.el)('span', { class: 'space-caption', text: caption }),
                ],
            }),
            (0, dom_ts_1.el)('div', {
                class: `cell-grid cell-grid-${space.toLowerCase()}`,
                children: tiles.filter((tile) => tile.cell.space === space).map((tile) => tile.node),
            }),
        ],
    }));
    const node = (0, dom_ts_1.el)('section', {
        class: 'panel panel-memory',
        children: [
            (0, dom_ts_1.el)('header', {
                class: 'panel-head',
                children: [
                    (0, dom_ts_1.el)('span', { class: 'tab', text: 'memory' }),
                    (0, dom_ts_1.el)('h2', { text: 'Inside the chip, right now' }),
                    (0, dom_ts_1.el)('p', {
                        class: 'panel-note',
                        text: 'A processor this old has a few hundred bytes of memory, and taking the ROM apart revealed what some of them are for. Each tile is one of those bytes at its real address, holding whatever the running controller has put there. Yellow means it changed in the last moment. Engine speed sits at 003b and load at 0040 — those two move constantly. The single bit at BITS:0038 turns black when the rev limiter fires.',
                    }),
                ],
            }),
            (0, dom_ts_1.el)('div', { class: 'cell-columns', children: columns }),
        ],
    });
    return {
        node,
        update: (snapshot) => {
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
exports.createMemoryPanel = createMemoryPanel;
