#pragma once

#include "defs.h"
#include <stdint.h>
#include <stdbool.h>

typedef struct GB_sgb_s GB_sgb_t;
typedef struct {
    uint8_t tiles[0x100 * 8 * 4];
    uint16_t raw_data[0x440];
} GB_sgb_border_t;

unsigned GB_get_player_count(GB_gameboy_t *gb);
