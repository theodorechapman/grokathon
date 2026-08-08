# Starship Breakout

A Game Boy Breakout variant based on the behaviorally faithful GBDK
reconstruction in `../gbdk-reconstruction/breakout`.

The original ball is replaced by a pointed 8x8 rocket with a window, fins, and
exhaust. The paddle is reskinned as a 24x8 launch pad, and 43 individual blocks
form the word `GROK`. Gameplay and controls remain unchanged.

## Build

Install [GBDK 2020](https://github.com/gbdk-2020/gbdk-2020/releases), then run:

```sh
make GBDK_HOME=/path/to/gbdk
```

Or provide the compiler directly:

```sh
make LCC=/path/to/gbdk/bin/lcc
```

The output is `starship-breakout.gb`.

## Controls

- D-pad Left: move paddle left
- D-pad Right: move paddle right
