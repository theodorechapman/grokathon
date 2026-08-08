"use client";

import { useEffect, useRef, useState } from "react";
import type { Gameboy } from "gameboy-emulator";
import styles from "./game-boy-player.module.css";

type InputControl = "up" | "down" | "left" | "right" | "a" | "b" | "start" | "select";
type PlayerStatus = "loading" | "running" | "error";

function installSilentAudioFallback() {
  if (typeof SharedArrayBuffer !== "undefined") return;
  Object.defineProperty(globalThis, "SharedArrayBuffer", {
    configurable: true,
    value: ArrayBuffer,
  });
}

export function GameBoyPlayer({
  romUrl,
  title,
  onRestart,
}: {
  romUrl: string;
  title: string;
  onRestart: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameboyRef = useRef<Gameboy | null>(null);
  const [status, setStatus] = useState<PlayerStatus>("loading");

  useEffect(() => {
    let cancelled = false;

    async function start() {
      const canvas = canvasRef.current;
      if (!canvas) throw new Error("Game canvas is unavailable");

      installSilentAudioFallback();
      const [{ Gameboy }, response] = await Promise.all([
        import("gameboy-emulator"),
        fetch(romUrl),
      ]);
      if (!response.ok) throw new Error(`ROM request failed with status ${response.status}`);
      if (cancelled) return;

      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Canvas rendering is unavailable");

      const gameboy = new Gameboy();
      let drewFirstFrame = false;
      gameboyRef.current = gameboy;
      gameboy.onFrameFinished((imageData: ImageData) => {
        if (cancelled) return;
        context.putImageData(imageData, 0, 0);
        if (!drewFirstFrame) {
          drewFirstFrame = true;
          setStatus("running");
        }
      });
      gameboy.loadGame(await response.arrayBuffer());
      gameboy.run();
    }

    function preventArrowScroll(event: KeyboardEvent) {
      if (event.code.startsWith("Arrow")) event.preventDefault();
    }

    document.addEventListener("keydown", preventArrowScroll);
    start().catch((error: unknown) => {
      if (!cancelled) {
        console.error(error);
        setStatus("error");
      }
    });

    return () => {
      cancelled = true;
      gameboyRef.current = null;
      document.removeEventListener("keydown", preventArrowScroll);
    };
  }, [romUrl]);

  function setControl(control: InputControl, pressed: boolean) {
    const input = gameboyRef.current?.input;
    if (!input) return;
    if (control === "up") input.isPressingUp = pressed;
    if (control === "down") input.isPressingDown = pressed;
    if (control === "left") input.isPressingLeft = pressed;
    if (control === "right") input.isPressingRight = pressed;
    if (control === "a") input.isPressingA = pressed;
    if (control === "b") input.isPressingB = pressed;
    if (control === "start") input.isPressingStart = pressed;
    if (control === "select") input.isPressingSelect = pressed;
  }

  function touchProps(control: InputControl) {
    return {
      disabled: status !== "running",
      onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        setControl(control, true);
      },
      onPointerUp: () => setControl(control, false),
      onPointerCancel: () => setControl(control, false),
      onLostPointerCapture: () => setControl(control, false),
    };
  }

  return (
    <div className={styles.stage}>
      <div className={styles.shell}>
        <canvas ref={canvasRef} width={160} height={144} aria-label={`${title} game screen`}>
          Canvas is required to run this game.
        </canvas>
      </div>
      <p className={`${styles.status} ${styles[status]}`} role="status">
        {status === "loading" && "Loading ROM…"}
        {status === "running" && "Running"}
        {status === "error" && "Unable to start the game"}
      </p>
      <div className={styles.touch} aria-label="Touch controls">
        <div className={styles.dpad} aria-label="Direction pad">
          <button type="button" className={styles.up} aria-label="Up" {...touchProps("up")}>▲</button>
          <button type="button" className={styles.left} aria-label="Left" {...touchProps("left")}>◀</button>
          <span className={styles.dpadCenter} aria-hidden="true" />
          <button type="button" className={styles.right} aria-label="Right" {...touchProps("right")}>▶</button>
          <button type="button" className={styles.down} aria-label="Down" {...touchProps("down")}>▼</button>
        </div>
        <div className={styles.system} aria-label="System controls">
          <button type="button" aria-label="Select" {...touchProps("select")}>Select</button>
          <button type="button" aria-label="Start" {...touchProps("start")}>Start</button>
          <button type="button" onClick={onRestart}>Restart</button>
        </div>
        <div className={styles.actions} aria-label="Action buttons">
          <button type="button" className={styles.b} aria-label="B button" {...touchProps("b")}>B</button>
          <button type="button" className={styles.a} aria-label="A button" {...touchProps("a")}>A</button>
        </div>
      </div>
    </div>
  );
}
