"use strict";
/**
 * The bench panel: controls on the left, graded readouts on the right.
 *
 * Every control writes into the real controller — the throttle moves the AFM
 * channel, the button runs `powerOn()`. Nothing is faked forward.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBenchPanel = void 0;
const dom_ts_1 = require("./dom.js");
const margin_note_ts_1 = require("./margin-note.js");
const readouts_ts_1 = require("./readouts.js");
const SCENARIOS = [
    {
        name: 'idle',
        throttle: 0,
        brake: 0,
        hint: 'Foot off the pedal. The controller holds the engine at its idle target on its own.',
    },
    {
        name: 'part load',
        throttle: 0.3,
        brake: 0.25,
        hint: 'Light throttle against the brake — cruising. Watch the load byte settle in the middle.',
    },
    {
        name: 'wide open',
        throttle: 1,
        brake: 0.12,
        hint: 'Full throttle with enough load to stay just under the limit. The richest mixture it commands.',
    },
    {
        name: 'over-rev',
        throttle: 1,
        brake: 0,
        hint: 'Full throttle, nothing holding it back. It hits the limiter and bounces: fuel off, speed falls, fuel on.',
    },
];
const slider = (label, initial, onInput) => {
    const input = (0, dom_ts_1.el)('input', {
        class: 'slider',
        attrs: { type: 'range', min: '0', max: '100', value: String(Math.round(initial * 100)) },
    });
    const readout = (0, dom_ts_1.el)('span', { class: 'slider-value', text: `${Math.round(initial * 100)}%` });
    input.addEventListener('input', () => {
        const value = Number(input.value) / 100;
        readout.textContent = `${input.value}%`;
        onInput(value);
    });
    const node = (0, dom_ts_1.el)('label', {
        class: 'slider-row',
        children: [
            (0, dom_ts_1.el)('span', { class: 'slider-label', text: label }),
            input,
            readout,
        ],
    });
    return { node, input, readout };
};
const readoutCell = (readout, attach) => {
    const value = (0, dom_ts_1.el)('span', { class: 'value', text: '—' });
    attach(value, readout.grade, readout.basis);
    const label = (0, dom_ts_1.el)('span', { class: 'readout-label', text: readout.label });
    const caption = readout.caption === undefined
        ? []
        : [(0, dom_ts_1.el)('span', { class: 'readout-caption', text: readout.caption })];
    const node = (0, dom_ts_1.el)('div', {
        class: `readout readout-${readout.group}`,
        children: [label, ...caption, value],
    });
    return { node, value };
};
const createBenchPanel = (bench) => {
    const canControl = () => {
        const provenance = bench.provenance();
        return provenance.mode !== 'evidence' && provenance.controls === 'read-write';
    };
    const note = (0, margin_note_ts_1.createMarginNote)('Point at any value to see what it rests on. Red means the number is not proven by the binary.');
    const power = (0, dom_ts_1.el)('button', { class: 'power', text: 'start engine' });
    const throttle = slider('throttle', bench.throttle(), (value) => bench.setThrottle(value));
    const brake = slider('dyno load', bench.brake(), (value) => bench.setBrake(value));
    const setScenario = (scenario) => {
        if (!canControl())
            return;
        bench.setThrottle(scenario.throttle);
        bench.setBrake(scenario.brake);
        throttle.input.value = String(Math.round(scenario.throttle * 100));
        throttle.readout.textContent = `${throttle.input.value}%`;
        brake.input.value = String(Math.round(scenario.brake * 100));
        brake.readout.textContent = `${brake.input.value}%`;
        if (!bench.isRunning())
            bench.start();
    };
    const hint = (0, dom_ts_1.el)('p', {
        class: 'scenario-hint',
        text: 'Pick a condition, or drive the sliders yourself.',
    });
    const scenarioButtons = SCENARIOS.map((scenario) => {
        const button = (0, dom_ts_1.el)('button', {
            class: 'scenario',
            text: scenario.name,
            title: scenario.hint,
            on: {
                click: () => {
                    setScenario(scenario);
                    for (const other of scenarioButtons)
                        other.classList.remove('is-active');
                    button.classList.add('is-active');
                    hint.textContent = scenario.hint;
                },
            },
        });
        return button;
    });
    power.addEventListener('click', () => {
        if (!canControl())
            return;
        if (bench.isRunning()) {
            bench.stop();
            for (const other of scenarioButtons)
                other.classList.remove('is-active');
        }
        else {
            bench.start();
        }
    });
    const cells = readouts_ts_1.BENCH_READOUTS.map((readout) => ({
        readout,
        ...readoutCell(readout, note.attach),
    }));
    const inGroup = (group) => cells.filter((cell) => cell.readout.group === group).map((cell) => cell.node);
    const controlInputs = [power, throttle.input, brake.input, ...scenarioButtons];
    const node = (0, dom_ts_1.el)('section', {
        class: 'panel panel-bench',
        children: [
            (0, dom_ts_1.el)('header', {
                class: 'panel-head',
                children: [
                    (0, dom_ts_1.el)('span', { class: 'tab', text: 'bench' }),
                    (0, dom_ts_1.el)('h2', { text: 'The selected controller backend' }),
                    (0, dom_ts_1.el)('p', {
                        class: 'panel-note',
                        text: 'The controls go to the selected backend; values on the right only appear when that backend reports them. Evidence mode is intentionally read-only.',
                    }),
                ],
            }),
            (0, dom_ts_1.el)('div', {
                class: 'bench-body',
                children: [
                    (0, dom_ts_1.el)('div', {
                        class: 'controls',
                        children: [
                            power,
                            (0, dom_ts_1.el)('div', { class: 'scenarios', children: scenarioButtons }),
                            hint,
                            throttle.node,
                            brake.node,
                            (0, dom_ts_1.el)('p', {
                                class: 'controls-note',
                                text: 'In the local demo, these controls drive the disclosed toy plant. A MAME gateway may accept them only when its supervisor declares a writable demo mode.',
                            }),
                        ],
                    }),
                    (0, dom_ts_1.el)('div', {
                        class: 'readouts',
                        children: [
                            (0, dom_ts_1.el)('div', { class: 'primary', children: inGroup('primary') }),
                            (0, dom_ts_1.el)('div', { class: 'grid', children: inGroup('secondary') }),
                            (0, dom_ts_1.el)('div', {
                                class: 'limiter',
                                children: [
                                    (0, dom_ts_1.el)('h3', {
                                        children: [
                                            (0, dom_ts_1.el)('span', { text: 'The rev limiter' }),
                                            (0, dom_ts_1.el)('span', {
                                                class: 'limiter-caption',
                                                text: 'one byte in the ROM, three inferences, and a bit that flips',
                                            }),
                                        ],
                                    }),
                                    (0, dom_ts_1.el)('div', { class: 'grid', children: inGroup('limiter') }),
                                ],
                            }),
                            note.node,
                        ],
                    }),
                ],
            }),
        ],
    });
    return {
        node,
        update: (snapshot) => {
            const readOnly = !canControl();
            for (const control of controlInputs)
                control.disabled = readOnly;
            power.textContent = bench.isRunning() ? 'stop' : 'start engine';
            power.classList.toggle('is-running', bench.isRunning());
            node.classList.toggle('is-cutting', snapshot.availability.readouts && snapshot.limiter.cutStageActive);
            for (const cell of cells) {
                const text = snapshot.availability.readouts
                    ? cell.readout.read(snapshot)
                    : 'unavailable';
                if (cell.value.textContent !== text)
                    cell.value.textContent = text;
            }
        },
    };
};
exports.createBenchPanel = createBenchPanel;
