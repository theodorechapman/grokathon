#pragma once
#include "defs.h"
#include <stdbool.h>

typedef struct {
    enum {
        GB_NO_MBC,
        GB_MBC1,
        GB_MBC2,
        GB_MBC3,
        GB_MBC5,
        GB_MBC7,
        GB_MMM01,
        GB_HUC1,
        GB_HUC3,
        GB_TPP1,
        GB_CAMERA,
    } mbc_type;
    bool has_ram;
    bool has_battery;
    bool has_rtc;
    bool has_rumble;
} GB_cartridge_t;

