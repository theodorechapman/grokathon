"use strict";
/**
 * Draw the event log the way you would look at it on a bench scope: one digital
 * channel per output, graticule behind, time running left to right.
 *
 * A channel sits low until something happened. Compare crossings and captures
 * are instants, so they get a minimum visible width; an injector pulse is drawn
 * at its real commanded length.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.drawScope = void 0;
/** Instants still need to be visible: about a tenth of a division. */
const MINIMUM_PULSE_MS = 0.12;
const graticule = (context, width, height, options, ratio) => {
    context.strokeStyle = options.colours.graticule;
    context.lineWidth = Math.max(1, ratio * 0.5);
    context.setLineDash([ratio, ratio * 3]);
    for (let division = 1; division < options.divisions; division += 1) {
        const x = Math.round((division / options.divisions) * width) + 0.5;
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, height);
        context.stroke();
    }
    context.setLineDash([]);
    const lane = height / options.channels.length;
    for (let index = 1; index < options.channels.length; index += 1) {
        const y = Math.round(index * lane) + 0.5;
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(width, y);
        context.stroke();
    }
};
/** Draw one channel as a square wave and return how many pulses it showed. */
const channelTrace = (context, spans, geometry) => {
    context.beginPath();
    context.moveTo(0, geometry.low);
    for (const [from, to] of spans) {
        const left = Math.max(0, geometry.x(from));
        const right = Math.min(geometry.width, Math.max(geometry.x(to), left + 1));
        context.lineTo(left, geometry.low);
        context.lineTo(left, geometry.high);
        context.lineTo(right, geometry.high);
        context.lineTo(right, geometry.low);
    }
    context.lineTo(geometry.width, geometry.low);
    context.stroke();
};
const drawScope = (options) => {
    const { canvas, channels, now, windowMs } = options;
    const context = canvas.getContext('2d');
    if (context === null)
        throw new Error('2d canvas context unavailable');
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
    const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
    }
    const start = now - windowMs;
    const x = (ms) => ((ms - start) / windowMs) * width;
    context.fillStyle = options.colours.screen;
    context.fillRect(0, 0, width, height);
    graticule(context, width, height, options, ratio);
    const spans = new Map();
    const counts = new Map();
    for (const channel of channels)
        spans.set(channel.key, []);
    for (const pulse of options.pulses) {
        if (pulse.at < start)
            continue;
        const lane = spans.get(pulse.key);
        if (lane === undefined)
            continue;
        lane.push([pulse.at, pulse.at + Math.max(MINIMUM_PULSE_MS, pulse.durationMs)]);
        counts.set(pulse.key, (counts.get(pulse.key) ?? 0) + 1);
    }
    const lane = height / channels.length;
    context.lineWidth = Math.max(1.2, ratio * 0.9);
    context.lineJoin = 'miter';
    context.shadowBlur = ratio * 4;
    channels.forEach((channel, index) => {
        const colour = channel.stimulus ? options.colours.stimulus : options.colours.trace;
        context.strokeStyle = colour;
        context.shadowColor = colour;
        channelTrace(context, spans.get(channel.key) ?? [], {
            width,
            low: index * lane + lane * 0.76,
            high: index * lane + lane * 0.26,
            x,
        });
    });
    context.shadowBlur = 0;
    return counts;
};
exports.drawScope = drawScope;
