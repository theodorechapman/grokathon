#ifndef STARSHIP_BREAKOUT_ASSETS_H
#define STARSHIP_BREAKOUT_ASSETS_H

#include <stdint.h>

#define STARSHIP_BREAKOUT_TILE_COUNT 18u
#define STARSHIP_BREAKOUT_MAP_WIDTH 20u
#define STARSHIP_BREAKOUT_MAP_HEIGHT 18u

extern const uint8_t starship_breakout_tile_data[STARSHIP_BREAKOUT_TILE_COUNT * 16u];
extern const uint8_t starship_breakout_background_map[
    STARSHIP_BREAKOUT_MAP_WIDTH * STARSHIP_BREAKOUT_MAP_HEIGHT
];

#endif
