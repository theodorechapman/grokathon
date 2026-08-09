"use strict";
/**
 * The timing scope: `machine.events` on a time axis.
 *
 * The capture lane is the stimulus this page feeds into external-3/CC0. Every
 * other lane is an output the model actually emitted — a compare channel
 * crossing, or an injector pulse dispatched by the fuel path. Channels are
 * named the way the model names them, because SPECS does not recover which
 * compare channel or port bit reaches which coil or injector bank.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createScopePanel = void 0;
const dom_ts_1 = require("./dom.js");
const margin_note_ts_1 = require("./margin-note.js");
const scope_trace_ts_1 = require("./scope-trace.js");
const WINDOW_MS = 30;
const DIVISIONS = 10;
const LANES = [
    {
        lane: 'capture',
        label: 'a crank tooth passes',
        grade: 'model',
        basis: 'The input, not an output. Production tooth geometry is unknown: the local clean-room backend assumes 60 uniform events, while the current MAME demo discloses a synthetic 12-position/one-gap fixture.',
    },
    {
        lane: 'ignition-charge',
        label: 'coil-charge model event',
        grade: 'model',
        basis: 'A local clean-room scheduling event. It is not MAME pin telemetry and must not be read as a recovered compare-channel assignment.',
    },
    {
        lane: 'p15-ignition',
        label: 'P1.5 logical ignition',
        grade: 'proven',
        basis: 'Canonical firmware evidence identifies Timer 0 / P1.5 as logical ignition. A trace is shown only when the selected backend reports an event; physical coil and cylinder routing remain unresolved.',
    },
    {
        lane: 'cc2-cc3-schedule',
        label: 'CC2 / CC3 injector schedules',
        grade: 'proven',
        basis: 'Canonical firmware evidence identifies CC2/P1.2 and CC3/P1.3 as logical injector schedules. Exact compare-pin waveforms and physical bank routing are not yet established.',
    },
    {
        lane: 'idle-actuator',
        label: 'idle valve adjusted',
        grade: 'model',
        basis: 'The controller nudging the air valve that holds idle speed. Only active when it thinks it is idling. Which pin carries this signal is unresolved, so none is claimed.',
    },
];
const readColour = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const createScopePanel = (bench) => {
    const note = (0, margin_note_ts_1.createMarginNote)('What the controller is doing to its outputs, as a bench scope would show it: time runs left to right, and a line steps up while that output is on. Point at a channel name for what it is.');
    const canvas = (0, dom_ts_1.el)('canvas', { class: 'scope-canvas' });
    const timebase = (0, dom_ts_1.el)('span', {
        class: 'timebase',
        text: `${WINDOW_MS / DIVISIONS} ms / div · ${WINDOW_MS} ms window`,
    });
    const labels = LANES.map((lane) => {
        const count = (0, dom_ts_1.el)('span', { class: 'lane-count', text: '0' });
        const label = (0, dom_ts_1.el)('span', { class: 'lane-label', text: lane.label });
        note.attach(label, lane.grade, lane.basis);
        return { lane, count, node: (0, dom_ts_1.el)('div', { class: 'lane-row', children: [label, count] }) };
    });
    const node = (0, dom_ts_1.el)('section', {
        class: 'panel panel-scope',
        children: [
            (0, dom_ts_1.el)('header', {
                class: 'panel-head',
                children: [
                    (0, dom_ts_1.el)('span', { class: 'tab', text: 'scope' }),
                    (0, dom_ts_1.el)('h2', { text: 'Sparks and squirts, as they happen' }),
                    timebase,
                ],
            }),
            (0, dom_ts_1.el)('div', {
                class: 'scope-body',
                children: [
                    (0, dom_ts_1.el)('div', { class: 'lane-legend', children: labels.map((entry) => entry.node) }),
                    (0, dom_ts_1.el)('div', { class: 'scope-screen', children: [canvas] }),
                ],
            }),
            note.node,
        ],
    });
    const draw = (now) => {
        const counts = (0, scope_trace_ts_1.drawScope)({
            canvas,
            channels: LANES.map((lane) => ({ key: lane.lane, stimulus: lane.lane === 'capture' })),
            pulses: bench
                .trace()
                .map((point) => ({ key: point.lane, at: point.at, durationMs: point.durationMs })),
            now,
            windowMs: WINDOW_MS,
            divisions: DIVISIONS,
            colours: {
                screen: readColour('--screen'),
                graticule: readColour('--graticule'),
                trace: readColour('--trace'),
                stimulus: readColour('--pen-bright'),
            },
        });
        for (const entry of labels) {
            const value = String(counts.get(entry.lane.lane) ?? 0);
            if (entry.count.textContent !== value)
                entry.count.textContent = value;
        }
    };
    return {
        node,
        update: (snapshot) => {
            if (!snapshot.availability.trace) {
                timebase.textContent = 'trace unavailable';
                for (const entry of labels)
                    entry.count.textContent = 'unavailable';
                return;
            }
            timebase.textContent = `${WINDOW_MS / DIVISIONS} ms / div · ${WINDOW_MS} ms window`;
            draw(snapshot.machineMs);
        },
    };
};
exports.createScopePanel = createScopePanel;
