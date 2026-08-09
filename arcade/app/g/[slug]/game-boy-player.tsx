"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserGameBoy, type GameBoyControl } from "./binjgb-core";
import styles from "./game-boy-player.module.css";

// WRAM addresses from docs/breakout-reverse-engineering.md. Breakout-specific:
// when the pipeline ships more ROM games it should provide these per game
// (manifest field) instead of hardcoding.
const BRICKS_ADDR = 0xc0a5;
const BALL_Y_ADDR = 0xc0a2;
const BALL_Y_DEAD = 0x9a;
const BRICKS_START = 0x27;

function watchRun(
  gameboy: BrowserGameBoy,
  onRunEnd: (end: { outcome: "win" | "loss"; elapsedMs: number }) => void,
  isCancelled: () => boolean
) {
  let startedAt = 0;
  const timer = setInterval(() => {
    if (isCancelled()) {
      clearInterval(timer);
      return;
    }
    const bricks = gameboy.readByte(BRICKS_ADDR);
    const ballY = gameboy.readByte(BALL_Y_ADDR);
    if (startedAt === 0) {
      if (bricks === BRICKS_START) startedAt = performance.now();
      return;
    }
    if (bricks === 0) {
      clearInterval(timer);
      onRunEnd({ outcome: "win", elapsedMs: Math.round(performance.now() - startedAt) });
    } else if (ballY >= BALL_Y_DEAD) {
      clearInterval(timer);
      onRunEnd({ outcome: "loss", elapsedMs: Math.round(performance.now() - startedAt) });
    }
  }, 200);
}
type PlayerStatus = "loading" | "running" | "error";

const KEYBOARD_CONTROLS: Partial<Record<string, GameBoyControl>> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  KeyA: "a",
  KeyX: "a",
  KeyB: "b",
  KeyZ: "b",
  Enter: "start",
  ShiftRight: "select",
};

export function GameBoyPlayer({
  romUrl,
  title,
  onRestart,
  timeScored = false,
  onRunEnd,
}: {
  romUrl: string;
  title: string;
  onRestart: () => void;
  timeScored?: boolean;
  onRunEnd?: (end: { outcome: "win" | "loss"; elapsedMs: number }) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameboyRef = useRef<BrowserGameBoy | null>(null);
  const [status, setStatus] = useState<PlayerStatus>("loading");

  useEffect(() => {
    let cancelled = false;

    async function start() {
      const canvas = canvasRef.current;
      if (!canvas) throw new Error("Game canvas is unavailable");

      const response = await fetch(romUrl);
      if (!response.ok) throw new Error(`ROM request failed with status ${response.status}`);
      if (cancelled) return;

      const gameboy = await BrowserGameBoy.create(await response.arrayBuffer(), canvas, () => {
        if (!cancelled) setStatus("running");
      });
      if (cancelled) {
        gameboy.destroy();
        return;
      }
      gameboyRef.current = gameboy;
      gameboy.start();

      if (timeScored && onRunEnd) watchRun(gameboy, onRunEnd, () => cancelled);
    }

    function handleKey(event: KeyboardEvent, pressed: boolean) {
      const control = KEYBOARD_CONTROLS[event.code];
      if (!control) return;
      event.preventDefault();
      gameboyRef.current?.setControl(control, pressed);
    }
    const keyDown = (event: KeyboardEvent) => handleKey(event, true);
    const keyUp = (event: KeyboardEvent) => handleKey(event, false);
    const releaseKeys = () => gameboyRef.current?.releaseAllControls();

    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", releaseKeys);
    start().catch((error: unknown) => {
      if (!cancelled) {
        console.error(error);
        setStatus("error");
      }
    });

    return () => {
      cancelled = true;
      gameboyRef.current?.destroy();
      gameboyRef.current = null;
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", releaseKeys);
    };
  }, [romUrl, timeScored, onRunEnd]);

  function setControl(control: GameBoyControl, pressed: boolean) {
    gameboyRef.current?.setControl(control, pressed);
  }

  function touchProps(control: GameBoyControl) {
    const release = (event: React.PointerEvent<HTMLButtonElement>) => {
      event.currentTarget.classList.remove(styles.pressed);
      setControl(control, false);
    };
    return {
      disabled: status !== "running",
      onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        event.currentTarget.classList.add(styles.pressed);
        setControl(control, true);
      },
      onPointerUp: release,
      onPointerCancel: release,
      onLostPointerCapture: release,
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
          <button type="button" aria-label="Restart game" onClick={onRestart}>Restart</button>
        </div>
        <div className={styles.actions} aria-label="Action buttons">
          <button type="button" className={styles.b} aria-label="B button" {...touchProps("b")}>B</button>
          <button type="button" className={styles.a} aria-label="A button" {...touchProps("a")}>A</button>
        </div>
      </div>
    </div>
  );
}
