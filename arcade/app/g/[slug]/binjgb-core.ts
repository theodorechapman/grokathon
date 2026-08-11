export type GameBoyControl = "up" | "down" | "left" | "right" | "a" | "b" | "start" | "select";

type BinjgbModule = {
  HEAP8: Int8Array;
  _malloc(size: number): number;
  _free(pointer: number): void;
  _emulator_new_simple(
    romPointer: number,
    romSize: number,
    sampleRate: number,
    audioFrames: number,
    colorCurve: number
  ): number;
  _emulator_delete(emulator: number): void;
  _emulator_get_ticks_f64(emulator: number): number;
  _emulator_run_until_f64(emulator: number, ticks: number): number;
  _emulator_read_mem(emulator: number, address: number): number;
  _get_frame_buffer_ptr(emulator: number): number;
  _get_frame_buffer_size(emulator: number): number;
  _get_audio_buffer_ptr(emulator: number): number;
  _get_audio_buffer_capacity(emulator: number): number;
  _joypad_new(): number;
  _joypad_delete(joypad: number): void;
  _emulator_set_default_joypad_callback(emulator: number, joypad: number): void;
  _set_joyp_up(emulator: number, pressed: boolean): void;
  _set_joyp_down(emulator: number, pressed: boolean): void;
  _set_joyp_left(emulator: number, pressed: boolean): void;
  _set_joyp_right(emulator: number, pressed: boolean): void;
  _set_joyp_A(emulator: number, pressed: boolean): void;
  _set_joyp_B(emulator: number, pressed: boolean): void;
  _set_joyp_start(emulator: number, pressed: boolean): void;
  _set_joyp_select(emulator: number, pressed: boolean): void;
};

declare global {
  interface Window {
    Binjgb?: (options?: { locateFile?: (path: string) => string }) => Promise<BinjgbModule>;
    __novaBinjgbScript?: Promise<void>;
  }
}
const CPU_TICKS_PER_SECOND = 4_194_304;
const AUDIO_FRAMES = 4096;
const AUDIO_LATENCY_SECONDS = 0.1;
const MAX_UPDATE_SECONDS = 5 / 60;
const EVENT_NEW_FRAME = 1;
const EVENT_AUDIO_BUFFER_FULL = 2;
const EVENT_UNTIL_TICKS = 4;
const SCRIPT_ID = "nova-binjgb-core";

function loadBinjgb(): Promise<BinjgbModule> {
  if (!window.__novaBinjgbScript) window.__novaBinjgbScript = new Promise<void>((resolve, reject) => {
    if (window.Binjgb) {
      resolve();
      return;
    }

    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    const script = existing ?? document.createElement("script");
    const loaded = () => resolve();
    const failed = () => reject(new Error("Unable to load the Game Boy emulator"));
    script.addEventListener("load", loaded, { once: true });
    script.addEventListener("error", failed, { once: true });
    if (!existing) {
      script.id = SCRIPT_ID;
      script.src = "/emulator/binjgb.js";
      script.async = true;
      document.head.appendChild(script);
    }
  });

  return window.__novaBinjgbScript.then(() => {
    if (!window.Binjgb) throw new Error("Game Boy emulator did not initialize");
    /* binjgb keeps some hardware state at module scope, so each mounted game
     * receives a fresh tiny WASM instance. This makes client-side navigation
     * between DMG and CGB cartridges deterministic. */
    return window.Binjgb({ locateFile: (file) => `/emulator/${file}` });
  });
}

export class BrowserGameBoy {
  private animationFrame = 0;
  private audioBuffer: Uint8Array;
  private audioContext: AudioContext;
  private audioStarted = false;
  private destroyed = false;
  private emulator: number;
  private frameBuffer: Uint8Array;
  private imageData: ImageData;
  private joypad: number;
  private lastAnimationSeconds = 0;
  private leftoverTicks = 0;
  private nextAudioSeconds = 0;
  private renderedFirstFrame = false;
  private romPointer: number;

  private constructor(
    private module: BinjgbModule,
    rom: ArrayBuffer,
    private context: CanvasRenderingContext2D,
    private onFirstFrame: () => void
  ) {
    this.audioContext = new AudioContext({ latencyHint: "interactive" });
    const paddedSize = (rom.byteLength + 0x7fff) & ~0x7fff;
    this.romPointer = module._malloc(paddedSize);
    new Uint8Array(module.HEAP8.buffer, this.romPointer, paddedSize)
      .fill(0)
      .set(new Uint8Array(rom));

    this.emulator = module._emulator_new_simple(
      this.romPointer,
      paddedSize,
      this.audioContext.sampleRate,
      AUDIO_FRAMES,
      1
    );
    if (!this.emulator) {
      module._free(this.romPointer);
      void this.audioContext.close();
      throw new Error("The ROM is invalid or unsupported");
    }

    this.joypad = module._joypad_new();
    module._emulator_set_default_joypad_callback(this.emulator, this.joypad);

    this.frameBuffer = new Uint8Array(
      module.HEAP8.buffer,
      module._get_frame_buffer_ptr(this.emulator),
      module._get_frame_buffer_size(this.emulator)
    );
    this.audioBuffer = new Uint8Array(
      module.HEAP8.buffer,
      module._get_audio_buffer_ptr(this.emulator),
      module._get_audio_buffer_capacity(this.emulator)
    );
    this.imageData = context.createImageData(160, 144);
  }

  static async create(
    rom: ArrayBuffer,
    canvas: HTMLCanvasElement,
    onFirstFrame: () => void
  ) {
    const module = await loadBinjgb();
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Canvas rendering is unavailable");
    return new BrowserGameBoy(module, rom, context, onFirstFrame);
  }

  start() {
    this.animationFrame = requestAnimationFrame(this.update);
  }

  destroy() {
    if (this.destroyed) return;
    cancelAnimationFrame(this.animationFrame);
    this.releaseAllControls();
    this.destroyed = true;
    this.module._joypad_delete(this.joypad);
    this.module._emulator_delete(this.emulator);
    this.module._free(this.romPointer);
    void this.audioContext.close();
  }

  readByte(address: number) {
    return this.module._emulator_read_mem(this.emulator, address) & 0xff;
  }

  startAudio() {
    // Audio stays off: game sound bleeds into screen recordings. The context
    // is never resumed, so pushAudio's running-state guard keeps it silent.
  }

  setControl(control: GameBoyControl, pressed: boolean) {
    if (this.destroyed) return;
    if (pressed) this.startAudio();
    if (control === "up") this.module._set_joyp_up(this.emulator, pressed);
    if (control === "down") this.module._set_joyp_down(this.emulator, pressed);
    if (control === "left") this.module._set_joyp_left(this.emulator, pressed);
    if (control === "right") this.module._set_joyp_right(this.emulator, pressed);
    if (control === "a") this.module._set_joyp_A(this.emulator, pressed);
    if (control === "b") this.module._set_joyp_B(this.emulator, pressed);
    if (control === "start") this.module._set_joyp_start(this.emulator, pressed);
    if (control === "select") this.module._set_joyp_select(this.emulator, pressed);
  }

  releaseAllControls() {
    const controls: GameBoyControl[] = ["up", "down", "left", "right", "a", "b", "start", "select"];
    for (const control of controls) this.setControl(control, false);
  }

  private update = (animationMilliseconds: number) => {
    if (this.destroyed) return;
    this.animationFrame = requestAnimationFrame(this.update);

    const animationSeconds = animationMilliseconds / 1000;
    const deltaSeconds = Math.max(
      animationSeconds - (this.lastAnimationSeconds || animationSeconds),
      0
    );
    const deltaTicks = Math.min(deltaSeconds, MAX_UPDATE_SECONDS) * CPU_TICKS_PER_SECOND;
    const runUntilTicks =
      this.module._emulator_get_ticks_f64(this.emulator) + deltaTicks - this.leftoverTicks;

    while (true) {
      const event = this.module._emulator_run_until_f64(this.emulator, runUntilTicks);
      if (event & EVENT_NEW_FRAME) this.drawFrame();
      if (event & EVENT_AUDIO_BUFFER_FULL) this.pushAudio();
      if (event & EVENT_UNTIL_TICKS) break;
    }

    this.leftoverTicks =
      (this.module._emulator_get_ticks_f64(this.emulator) - runUntilTicks) | 0;
    this.lastAnimationSeconds = animationSeconds;
  };

  private drawFrame() {
    this.imageData.data.set(this.frameBuffer);
    this.context.putImageData(this.imageData, 0, 0);
    if (!this.renderedFirstFrame) {
      this.renderedFirstFrame = true;
      this.onFirstFrame();
    }
  }

  private pushAudio() {
    if (!this.audioStarted || this.audioContext.state !== "running") return;
    const now = this.audioContext.currentTime;
    const earliestStart = now + AUDIO_LATENCY_SECONDS;
    this.nextAudioSeconds = this.nextAudioSeconds || earliestStart;
    if (this.nextAudioSeconds < now) {
      this.nextAudioSeconds = earliestStart;
      return;
    }

    const buffer = this.audioContext.createBuffer(2, AUDIO_FRAMES, this.audioContext.sampleRate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    for (let i = 0; i < AUDIO_FRAMES; i++) {
      left[i] = (this.audioBuffer[i * 2] - 128) / 320;
      right[i] = (this.audioBuffer[i * 2 + 1] - 128) / 320;
    }
    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioContext.destination);
    source.start(this.nextAudioSeconds);
    this.nextAudioSeconds += AUDIO_FRAMES / this.audioContext.sampleRate;
  }
}
