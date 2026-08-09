"use strict";
/**
 * Entry point: build the bench, mount the panels, run the frame loop.
 *
 * One `Ecu` is stepped in real time and read back once per frame. If anything
 * throws, the loop stops and says so rather than quietly drawing stale numbers.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const bench_runner_ts_1 = require("./bench-runner.js");
const dom_ts_1 = require("./dom.js");
const mame_bench_ts_1 = require("./mame-bench.js");
const panel_bench_ts_1 = require("./panel-bench.js");
const panel_evidence_ts_1 = require("./panel-evidence.js");
const panel_header_ts_1 = require("./panel-header.js");
const panel_memory_ts_1 = require("./panel-memory.js");
const panel_scope_ts_1 = require("./panel-scope.js");
const AUTOSTART_DELAY_MS = 1400;
const selectBench = () => {
    const backend = new URL(window.location.href).searchParams.get('backend') ?? 'cleanroom';
    if (backend === 'cleanroom' || backend === 'local')
        return (0, bench_runner_ts_1.createBench)();
    if (backend === 'mame')
        return (0, mame_bench_ts_1.createMameBench)(window.location.href);
    throw new Error(`unknown bench backend "${backend}"`);
};
const mount = () => {
    const root = document.querySelector('#app');
    if (root === null)
        throw new Error('#app is missing from the page shell');
    const bench = selectBench();
    const panels = [
        (0, panel_header_ts_1.createHeaderPanel)(bench),
        (0, panel_bench_ts_1.createBenchPanel)(bench),
        (0, panel_memory_ts_1.createMemoryPanel)(),
        (0, panel_scope_ts_1.createScopePanel)(bench),
        (0, panel_evidence_ts_1.createEvidencePanel)(bench),
    ];
    for (const panel of panels)
        root.append(panel.node);
    const fail = (error) => {
        const message = error instanceof Error ? error.message : String(error);
        root.prepend((0, dom_ts_1.el)('p', { class: 'failure', text: `the bench stopped: ${message}` }));
        throw error;
    };
    let previous = performance.now();
    const frame = (now) => {
        const seconds = (now - previous) / 1000;
        previous = now;
        try {
            bench.tick(seconds);
            const snapshot = bench.snapshot();
            for (const panel of panels)
                panel.update(snapshot);
        }
        catch (error) {
            fail(error);
            return;
        }
        requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.setTimeout(() => {
        const provenance = bench.provenance();
        if (provenance.mode === 'demo' && provenance.controls === 'read-write')
            bench.start();
    }, reduced ? 0 : AUTOSTART_DELAY_MS);
    // The selected bench is also available for inspection and manual ticking.
    window.motronic = bench;
};
mount();
