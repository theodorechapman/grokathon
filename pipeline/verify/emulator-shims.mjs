// Browser globals the arcade's gameboy-emulator UMD bundle expects, stubbed
// just enough to run headless in Node. Import for side effects before the
// emulator module.
globalThis.self = globalThis;
globalThis.window = globalThis;
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
globalThis.performance = globalThis.performance ?? { now: () => Date.now() };
globalThis.addEventListener = globalThis.addEventListener ?? (() => {});
// The emulator alert()s on unsupported cartridges; surface that as a failure.
globalThis.alert = (msg) => { throw new Error(`emulator rejected rom: ${msg}`); };

globalThis.ImageData = class ImageData {
  constructor(w, h) {
    this.width = w;
    this.height = h;
    this.data = new Uint8ClampedArray(w * h * 4);
  }
};

globalThis.AudioContext = class AudioContext {
  constructor() {
    this.destination = {};
    this.audioWorklet = { addModule: async () => {} };
    this.currentTime = 0;
  }
  createGain() {
    return { connect() {}, disconnect() {}, gain: { value: 0, setValueAtTime() {} } };
  }
  createBuffer(_channels, length) {
    return { getChannelData: () => new Float32Array(Math.max(1, length | 0)) };
  }
  createBufferSource() {
    return { connect() {}, start() {}, stop() {}, buffer: null };
  }
  resume() { return Promise.resolve(); }
  suspend() { return Promise.resolve(); }
  close() { return Promise.resolve(); }
};

globalThis.document = {
  createElement: () => ({
    getContext: () => ({
      putImageData() {},
      drawImage() {},
      getImageData: () => new globalThis.ImageData(160, 144),
    }),
    width: 0,
    height: 0,
    style: {},
  }),
  addEventListener() {},
  removeEventListener() {},
};

if (!globalThis.navigator.getGamepads) {
  Object.defineProperty(globalThis.navigator, "getGamepads", {
    value: () => [],
    configurable: true,
  });
}
