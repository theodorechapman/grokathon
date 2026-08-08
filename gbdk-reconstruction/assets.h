#ifndef BREAKOUT_ASSETS_H
#define BREAKOUT_ASSETS_H

#include <stdint.h>

#define BREAKOUT_TILE_COUNT 18u
#define BREAKOUT_MAP_WIDTH 20u
#define BREAKOUT_MAP_HEIGHT 18u

extern const uint8_t breakout_tile_data[BREAKOUT_TILE_COUNT * 16u];
extern const uint8_t breakout_background_map[BREAKOUT_MAP_WIDTH * BREAKOUT_MAP_HEIGHT];

#endif
