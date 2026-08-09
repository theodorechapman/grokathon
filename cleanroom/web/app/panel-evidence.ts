import { DEFAULT_ASSUMPTIONS, type Assumptions } from '../../src/assumptions.ts';
import type { DisclosureEntry } from '../../src/disclosure.ts';
import type { Bench } from './bench.ts';
import { el } from './dom.ts';
import type { Panel } from './panel.ts';

const formatValue = (value: number | string): string => {
  if (typeof value === 'string') return value;
  if (!Number.isInteger(value) || value < 16) return String(value);
  return `${value} · 0x${value.toString(16)}`;
};

const provenRow = (entry: DisclosureEntry): HTMLElement =>
  el('div', {
    class: 'evidence-row',
    children: [
      el('span', { class: 'evidence-field', text: entry.field }),
      el('span', { class: 'evidence-value', text: formatValue(entry.value) }),
      el('span', { class: 'evidence-basis', text: entry.basis }),
    ],
  });

const assumedRow = (entry: DisclosureEntry, bench: Bench, readOnly: boolean): HTMLElement => {
  const field = entry.field as keyof Assumptions;
  const input = el('input', {
    class: 'evidence-input',
    attrs: {
      type: 'number',
      step: 'any',
      value: String(entry.value),
      'aria-label': field,
    },
  });
  input.disabled = readOnly;
  const node = el('label', {
    class: 'evidence-row evidence-row-assumed',
    children: [
      el('span', { class: 'evidence-field', text: field }),
      input,
      el('span', { class: 'evidence-basis', text: entry.basis }),
    ],
  });
  node.classList.toggle(
    'is-changed',
    typeof entry.value === 'number' && entry.value !== DEFAULT_ASSUMPTIONS[field],
  );
  input.addEventListener('change', () => {
    if (readOnly) return;
    const value = Number(input.value);
    if (Number.isFinite(value)) bench.setAssumption(field, value);
  });
  return node;
};

export const createEvidencePanel = (bench: Bench): Panel => {
  const provenColumn = el('div', { class: 'evidence-column' });
  const assumedColumn = el('div', { class: 'evidence-column evidence-column-assumed' });
  const openQuestions = el('div', { class: 'open-questions' });
  const note = el('p', { class: 'panel-note' });
  const reset = el('button', {
    class: 'reset-assumptions',
    text: 'restore defaults',
    on: { click: () => bench.resetAssumptions() },
  });

  const render = (): void => {
    const provenance = bench.provenance();
    const proven = provenance.entries.filter((entry) => entry.kind === 'proven');
    const assumed = provenance.entries.filter((entry) => entry.kind === 'assumed');
    const readOnly =
      provenance.mode === 'evidence' || provenance.assumptions !== 'editable';
    reset.disabled = readOnly;
    note.textContent = `${provenance.qualification}. ${provenance.summary}`;
    provenColumn.replaceChildren(
      el('h3', {
        children: [
          el('span', { class: 'column-kind', text: 'proven' }),
          el('span', {
            class: 'column-caption',
            text: `${proven.length} backend-supplied fixed facts`,
          }),
        ],
      }),
      ...proven.map(provenRow),
    );
    assumedColumn.replaceChildren(
      el('h3', {
        children: [
          el('span', { class: 'column-kind', text: 'assumed' }),
          el('span', {
            class: 'column-caption',
            text: `${assumed.length} disclosed values · ${readOnly ? 'read-only' : 'editable'}`,
          }),
          reset,
        ],
      }),
      ...assumed.map((entry) => assumedRow(entry, bench, readOnly)),
    );
    openQuestions.replaceChildren(
      el('h3', {
        children: [
          el('span', { class: 'column-kind', text: 'unknown' }),
          el('span', {
            class: 'column-caption',
            text: `${provenance.openQuestions.length} unresolved questions`,
          }),
        ],
      }),
      el('ul', {
        children: provenance.openQuestions.map((question) => el('li', { text: question })),
      }),
    );
  };

  const node = el('section', {
    class: 'panel panel-evidence',
    children: [
      el('header', {
        class: 'panel-head',
        children: [
          el('span', { class: 'tab', text: 'evidence' }),
          el('h2', { text: 'What this rests on' }),
          note,
        ],
      }),
      el('div', { class: 'evidence-body', children: [provenColumn, assumedColumn] }),
      openQuestions,
    ],
  });
  bench.onRebuild(render);
  render();
  return { node, update: () => {} };
};
