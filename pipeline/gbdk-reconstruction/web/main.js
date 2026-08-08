import { Gameboy } from "gameboy-emulator";
import "./styles.css";

const canvas = document.querySelector("canvas");
const status = document.querySelector("#status");
const context = canvas.getContext("2d", { alpha: false });

async function start() {
  try {
    const romUrl = new URL("./breakout-reconstructed.gb", import.meta.url);
    const response = await fetch(romUrl);

    if (!response.ok) {
      throw new Error(`ROM request failed with status ${response.status}`);
    }

    const gameboy = new Gameboy();
    let drewFirstFrame = false;

    gameboy.onFrameFinished((imageData) => {
      context.putImageData(imageData, 0, 0);

      if (!drewFirstFrame) {
        drewFirstFrame = true;
        status.textContent = "Running";
      }
    });

    gameboy.loadGame(await response.arrayBuffer());
    gameboy.run();
  } catch (error) {
    console.error(error);
    status.textContent = `Unable to start: ${error.message}`;
  }
}

start();
