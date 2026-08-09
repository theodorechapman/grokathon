"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEvidencePanel = void 0;
const assumptions_ts_1 = require("../../src/assumptions.js");
const dom_ts_1 = require("./dom.js");
const formatValue = (value) => {
    if (typeof value === 'string')
        return value;
    if (!Number.isInteger(value) || value < 16)
        return String(value);
    return `${value} · 0x${value.toString(16)}`;
};
const provenRow = (entry) => (0, dom_ts_1.el)('div', {
    class: 'evidence-row',
    children: [
        (0, dom_ts_1.el)('span', { class: 'evidence-field', text: entry.field }),
        (0, dom_ts_1.el)('span', { class: 'evidence-value', text: formatValue(entry.value) }),
        (0, dom_ts_1.el)('span', { class: 'evidence-basis', text: entry.basis }),
    ],
});
const assumedRow = (entry, bench, readOnly) => {
    const field = entry.field;
    const input = (0, dom_ts_1.el)('input', {
        class: 'evidence-input',
        attrs: {
            type: 'number',
            step: 'any',
            value: String(entry.value),
            'aria-label': field,
        },
    });
    input.disabled = readOnly;
    const node = (0, dom_ts_1.el)('label', {
        class: 'evidence-row evidence-row-assumed',
        children: [
            (0, dom_ts_1.el)('span', { class: 'evidence-field', text: field }),
            input,
            (0, dom_ts_1.el)('span', { class: 'evidence-basis', text: entry.basis }),
        ],
    });
    node.classList.toggle('is-changed', typeof entry.value === 'number' && entry.value !== assumptions_ts_1.DEFAULT_ASSUMPTIONS[field]);
    input.addEventListener('change', () => {
        if (readOnly)
            return;
        const value = Number(input.value);
        if (Number.isFinite(value))
            bench.setAssumption(field, value);
    });
    return node;
};
const createEvidencePanel = (bench) => {
    const provenColumn = (0, dom_ts_1.el)('div', { class: 'evidence-column' });
    const assumedColumn = (0, dom_ts_1.el)('div', { class: 'evidence-column evidence-column-assumed' });
    const openQuestions = (0, dom_ts_1.el)('div', { class: 'open-questions' });
    const note = (0, dom_ts_1.el)('p', { class: 'panel-note' });
    const reset = (0, dom_ts_1.el)('button', {
        class: 'reset-assumptions',
        text: 'restore defaults',
        on: { click: () => bench.resetAssumptions() },
    });
    const render = () => {
        const provenance = bench.provenance();
        const proven = provenance.entries.filter((entry) => entry.kind === 'proven');
        const assumed = provenance.entries.filter((entry) => entry.kind === 'assumed');
        const readOnly = provenance.mode === 'evidence' || provenance.assumptions !== 'editable';
        reset.disabled = readOnly;
        note.textContent = `${provenance.qualification}. ${provenance.summary}`;
        provenColumn.replaceChildren((0, dom_ts_1.el)('h3', {
            children: [
                (0, dom_ts_1.el)('span', { class: 'column-kind', text: 'proven' }),
                (0, dom_ts_1.el)('span', {
                    class: 'column-caption',
                    text: `${proven.length} backend-supplied fixed facts`,
                }),
            ],
        }), ...proven.map(provenRow));
        assumedColumn.replaceChildren((0, dom_ts_1.el)('h3', {
            children: [
                (0, dom_ts_1.el)('span', { class: 'column-kind', text: 'assumed' }),
                (0, dom_ts_1.el)('span', {
                    class: 'column-caption',
                    text: `${assumed.length} disclosed values · ${readOnly ? 'read-only' : 'editable'}`,
                }),
                reset,
            ],
        }), ...assumed.map((entry) => assumedRow(entry, bench, readOnly)));
        openQuestions.replaceChildren((0, dom_ts_1.el)('h3', {
            children: [
                (0, dom_ts_1.el)('span', { class: 'column-kind', text: 'unknown' }),
                (0, dom_ts_1.el)('span', {
                    class: 'column-caption',
                    text: `${provenance.openQuestions.length} unresolved questions`,
                }),
            ],
        }), (0, dom_ts_1.el)('ul', {
            children: provenance.openQuestions.map((question) => (0, dom_ts_1.el)('li', { text: question })),
        }));
    };
    const node = (0, dom_ts_1.el)('section', {
        class: 'panel panel-evidence',
        children: [
            (0, dom_ts_1.el)('header', {
                class: 'panel-head',
                children: [
                    (0, dom_ts_1.el)('span', { class: 'tab', text: 'evidence' }),
                    (0, dom_ts_1.el)('h2', { text: 'What this rests on' }),
                    note,
                ],
            }),
            (0, dom_ts_1.el)('div', { class: 'evidence-body', children: [provenColumn, assumedColumn] }),
            openQuestions,
        ],
    });
    bench.onRebuild(render);
    render();
    return { node, update: () => { } };
};
exports.createEvidencePanel = createEvidencePanel;
