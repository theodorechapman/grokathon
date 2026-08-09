#pragma once

#include <stdbool.h>
#include "defs.h"

bool GB_rewind_pop(GB_gameboy_t *gb);
void GB_set_rewind_length(GB_gameboy_t *gb, double seconds);
void GB_rewind_reset(GB_gameboy_t *gb);
