import { spawn } from 'node:child_process';

export const headlessMameArguments = [
  '-sound',
  'none',
  '-video',
  'none',
  '-window',
  '-nomaximize',
  '-keyboardprovider',
  'none',
  '-mouseprovider',
  'none',
  '-joystickprovider',
  'none',
  '-lightgunprovider',
  'none',
  '-midiprovider',
  'none',
  '-networkprovider',
  'none',
  '-paddle_device',
  'none',
  '-adstick_device',
  'none',
  '-pedal_device',
  'none',
  '-dial_device',
  'none',
  '-trackball_device',
  'none',
  '-lightgun_device',
  'none',
  '-positional_device',
  'none',
  '-mouse_device',
  'none',
  '-noui_active',
  '-noui_mouse',
  '-nomouse',
  '-nojoystick',
  '-nolightgun',
] as const;

export const headlessMameEnvironment = {
  SDL_VIDEODRIVER: 'dummy',
  SDL_AUDIODRIVER: 'dummy',
  SDL_MAC_BACKGROUND_APP: '1',
} as const;

const requiredSettings = {
  video: 'none',
  window: '1',
  maximize: '0',
  sound: 'none',
  ui_active: '0',
  ui_mouse: '0',
  keyboardprovider: 'none',
  mouseprovider: 'none',
  joystickprovider: 'none',
  lightgunprovider: 'none',
  midiprovider: 'none',
  networkprovider: 'none',
  paddle_device: 'none',
  adstick_device: 'none',
  pedal_device: 'none',
  dial_device: 'none',
  trackball_device: 'none',
  lightgun_device: 'none',
  positional_device: 'none',
  mouse_device: 'none',
} as const;

export const validateHeadlessMameConfig = (output: string): void => {
  const settings = new Map<string, string>();
  for (const source of output.split('\n')) {
    const line = source.trim();
    const separator = line.search(/\s/);
    if (separator <= 0) continue;
    settings.set(line.slice(0, separator), line.slice(separator).trim());
  }
  for (const [name, expected] of Object.entries(requiredSettings)) {
    const actual = settings.get(name);
    if (actual !== expected) {
      throw new Error(
        `refusing to launch MAME: ${name} must be ${expected}, got ${actual ?? 'missing'}`,
      );
    }
  }
};

const verifiedExecutables = new Set<string>();

export const verifyHeadlessMame = async (executable: string): Promise<void> => {
  if (verifiedExecutables.has(executable)) return;
  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn(executable, ['-showconfig', ...headlessMameArguments], {
      env: { ...process.env, ...headlessMameEnvironment },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let text = '';
    let settled = false;
    const finish = (error: Error | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error === null) resolve(text);
      else reject(error);
    };
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (data) => {
      text += data;
    });
    child.stderr.on('data', (data) => {
      text += data;
    });
    child.on('error', (error) => finish(error));
    child.on('exit', (code, signal) => {
      finish(
        code === 0
          ? null
          : new Error(
              `headless MAME preflight exited code=${String(code)} signal=${String(signal)}`,
            ),
      );
    });
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      finish(new Error('headless MAME preflight timed out'));
    }, 5_000);
  });
  validateHeadlessMameConfig(output);
  verifiedExecutables.add(executable);
};
