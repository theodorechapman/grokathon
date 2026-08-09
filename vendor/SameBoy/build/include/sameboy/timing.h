#pragma once

#include "defs.h"

typedef enum {
    GB_RTC_MODE_SYNC_TO_HOST,
    GB_RTC_MODE_ACCURATE,
} GB_rtc_mode_t;

/* RTC emulation mode */
void GB_set_rtc_mode(GB_gameboy_t *gb, GB_rtc_mode_t mode);

/* Speed multiplier for the RTC, mostly for TAS syncing */
void GB_set_rtc_multiplier(GB_gameboy_t *gb, double multiplier);


#define GB_UNIT(unit) int32_t unit##_cycles, unit##_state
