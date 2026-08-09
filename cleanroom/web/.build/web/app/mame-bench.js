"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMameBench = void 0;
const REQUEST_TIMEOUT_MS = 3_000;
const unavailableSnapshot = () => ({
    availability: { runtime: false, readouts: false, memory: false, trace: false },
    machineMs: 0,
    mode: 'unavailable',
    syncState: 0,
    syncLocked: false,
    capturePeriodTicks: null,
    captureCorrections: 0,
    rpm: 0,
    encodedSpeed: 0,
    normalizedLoad: 0,
    airMassFiltered: 0,
    fuel: null,
    ignition: null,
    idle: null,
    limiter: {
        cutStageActive: false,
        cutStageComplement: false,
        countdown: 0,
        limitRpm: 0,
        resumeRpm: 0,
    },
    limitByte: 0,
    bufferByte: 0,
    overrunActive: false,
    foregroundCycles: 0,
    captureInterrupts: 0,
    faultCount: 0,
    cells: [],
});
const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const parseJson = (text) => {
    try {
        return JSON.parse(text);
    }
    catch {
        throw new Error('MAME gateway returned invalid JSON');
    }
};
const readMode = (value) => {
    if (!isRecord(value) ||
        value.schema !== 'motronic.gateway.mode/v1' ||
        value.backend !== 'mame' ||
        (value.mode !== 'demo' && value.mode !== 'evidence') ||
        (value.controls !== 'read-write' && value.controls !== 'read-only')) {
        throw new Error('MAME gateway mode response does not match v1');
    }
    return value;
};
const readProvenance = (value) => {
    if (!isRecord(value) ||
        value.schema !== 'motronic.gateway.provenance/v1' ||
        !isRecord(value.identity) ||
        value.identity.backend !== 'mame' ||
        !isRecord(value.provenance)) {
        throw new Error('MAME gateway provenance response does not match v1');
    }
    return value;
};
const readState = (value) => {
    if (!isRecord(value) ||
        value.schema !== 'motronic.gateway.state/v1' ||
        typeof value.sequence !== 'number' ||
        typeof value.running !== 'boolean' ||
        !isRecord(value.controls) ||
        !isRecord(value.snapshot) ||
        !Array.isArray(value.trace)) {
        throw new Error('MAME gateway state event does not match v1');
    }
    return value;
};
const fetchJson = async (url) => {
    const response = await fetch(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok)
        throw new Error(`${url.pathname} returned HTTP ${response.status}`);
    return parseJson(await response.text());
};
const createMameBench = (baseUrl) => {
    let identity = {
        backend: 'mame',
        controller: 'MAME gateway',
        processor: 'SAB80C515',
        bosch: null,
        software: null,
        checksum: null,
        resetTrace: null,
    };
    let provenance = {
        mode: 'evidence',
        controls: 'read-only',
        assumptions: 'unavailable',
        qualification: 'waiting for MAME gateway provenance',
        summary: 'No MAME claim is displayed until the gateway supplies it.',
        values: null,
        entries: [],
        openQuestions: [],
    };
    let state = {
        schema: 'motronic.gateway.state/v1',
        sequence: -1,
        running: false,
        controls: { throttle: 0, brake: 0 },
        snapshot: unavailableSnapshot(),
        trace: [],
    };
    let failure = null;
    const listeners = [];
    const endpoint = (path) => new URL(path, baseUrl);
    const reportFailure = (error) => {
        failure = error instanceof Error ? error : new Error(String(error));
    };
    const notify = () => {
        for (const listener of listeners)
            listener();
    };
    const canControl = () => provenance.mode === 'demo' && provenance.controls === 'read-write';
    const loadMetadata = async () => {
        const [modePayload, provenancePayload] = await Promise.all([
            fetchJson(endpoint('/api/mode')),
            fetchJson(endpoint('/api/provenance')),
        ]);
        const mode = readMode(modePayload);
        const supplied = readProvenance(provenancePayload);
        identity = supplied.identity;
        provenance = {
            ...supplied.provenance,
            mode: mode.mode,
            controls: mode.mode === 'evidence' ? 'read-only' : mode.controls,
            assumptions: mode.mode === 'evidence' ? 'read-only' : supplied.provenance.assumptions,
        };
        notify();
    };
    const postControl = (control) => {
        if (!canControl())
            return;
        void fetch(endpoint('/api/controls'), {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify(control),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })
            .then((response) => {
            if (!response.ok) {
                throw new Error(`/api/controls returned HTTP ${response.status}`);
            }
        })
            .catch(reportFailure);
    };
    void loadMetadata().catch(reportFailure);
    const events = new EventSource(endpoint('/api/events'));
    events.addEventListener('state', (event) => {
        if (!(event instanceof MessageEvent) || typeof event.data !== 'string') {
            reportFailure(new Error('MAME gateway emitted a non-message state event'));
            return;
        }
        try {
            const next = readState(parseJson(event.data));
            if (next.sequence >= state.sequence)
                state = next;
        }
        catch (error) {
            reportFailure(error);
        }
    });
    return {
        identity: () => identity,
        provenance: () => provenance,
        isRunning: () => state.running,
        start: () => postControl({ control: 'running', value: true }),
        stop: () => postControl({ control: 'running', value: false }),
        throttle: () => state.controls.throttle,
        setThrottle: (value) => postControl({ control: 'throttle', value: Math.min(1, Math.max(0, value)) }),
        brake: () => state.controls.brake,
        setBrake: (value) => postControl({ control: 'brake', value: Math.min(1, Math.max(0, value)) }),
        rpm: () => (state.snapshot.availability.readouts ? state.snapshot.rpm : 0),
        tick: () => {
            if (failure !== null)
                throw failure;
        },
        snapshot: () => state.snapshot,
        trace: () => state.trace,
        setAssumption: (_field, _value) => {
            throw new Error('MAME gateway assumptions are read-only');
        },
        resetAssumptions: () => {
            throw new Error('MAME gateway assumptions are read-only');
        },
        onRebuild: (listener) => listeners.push(listener),
    };
};
exports.createMameBench = createMameBench;
