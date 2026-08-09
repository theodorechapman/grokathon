import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  headlessMameArguments,
  headlessMameEnvironment,
  validateHeadlessMameConfig,
} from '../src/mame-headless-config.ts';

const validConfig = `
video none
window 1
maximize 0
sound none
ui_active 0
ui_mouse 0
keyboardprovider none
mouseprovider none
joystickprovider none
lightgunprovider none
midiprovider none
networkprovider none
paddle_device none
adstick_device none
pedal_device none
dial_device none
trackball_device none
lightgun_device none
positional_device none
mouse_device none
`;

describe('headless MAME launch guard', () => {
  it('requires the dummy SDL driver and explicit window fallback', () => {
    assert.equal(headlessMameEnvironment.SDL_VIDEODRIVER, 'dummy');
    assert.equal(headlessMameEnvironment.SDL_AUDIODRIVER, 'dummy');
    assert.ok(headlessMameArguments.includes('-window'));
    assert.ok(headlessMameArguments.includes('-nomaximize'));
    validateHeadlessMameConfig(validConfig);
  });

  it('refuses fullscreen or host input configurations', () => {
    assert.throws(
      () => validateHeadlessMameConfig(validConfig.replace('window 1', 'window 0')),
      /window must be 1/,
    );
    assert.throws(
      () =>
        validateHeadlessMameConfig(
          validConfig.replace('keyboardprovider none', 'keyboardprovider sdl'),
        ),
      /keyboardprovider must be none/,
    );
  });
});
