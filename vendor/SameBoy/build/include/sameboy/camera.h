#pragma once
#include <stdint.h>
#include "defs.h"

typedef uint8_t (*GB_camera_get_pixel_callback_t)(GB_gameboy_t *gb, uint8_t x, uint8_t y);
typedef void (*GB_camera_update_request_callback_t)(GB_gameboy_t *gb);

void GB_set_camera_get_pixel_callback(GB_gameboy_t *gb, GB_camera_get_pixel_callback_t callback);
void GB_set_camera_update_request_callback(GB_gameboy_t *gb, GB_camera_update_request_callback_t callback);
void GB_camera_updated(GB_gameboy_t *gb);

