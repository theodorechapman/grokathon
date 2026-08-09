#pragma once
#include "defs.h"
#include <stdint.h>

void GB_cpu_disassemble(GB_gameboy_t *gb, uint16_t pc, uint16_t count);
