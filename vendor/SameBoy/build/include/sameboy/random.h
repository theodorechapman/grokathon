#pragma once

#include <stdint.h>
#include <stdbool.h>
#include "defs.h"

void GB_random_seed(uint64_t seed);
void GB_random_set_enabled(bool enable);
