#include <gb/gb.h>
#include <stdbool.h>
#include <stdint.h>

#include "assets.h"

enum {
    TILE_EMPTY = 0x80u,
    TILE_BLOCK = 0x88u,
    TILE_PADDLE_LEFT = 0x8Cu,
    TILE_PADDLE_MIDDLE = 0x8Du,
    TILE_PADDLE_RIGHT = 0x8Eu,
    TILE_STARSHIP = 0x8Fu,

    STARSHIP_SPRITE = 0u,
    PADDLE_LEFT_SPRITE = 1u,
    PADDLE_MIDDLE_SPRITE = 2u,
    PADDLE_RIGHT_SPRITE = 3u,

    PADDLE_Y = 0x98u,
    PADDLE_MIN_X = 0x08u,
    PADDLE_MAX_X = 0x90u,
    PADDLE_INITIAL_X = 0x4Cu,
    STARSHIP_INITIAL_X = 0x32u,
    STARSHIP_INITIAL_Y = 0x78u,
    STARSHIP_LOSS_Y = 0x9Au,
    INITIAL_BRICK_COUNT = 43u
};

static uint8_t paddle_x;
static uint8_t starship_x;
static uint8_t starship_y;
static int8_t starship_vx;
static int8_t starship_vy;
static uint8_t bricks_remaining;

static void draw_paddle(void) {
    move_sprite(PADDLE_LEFT_SPRITE, paddle_x, PADDLE_Y);
    move_sprite(PADDLE_MIDDLE_SPRITE, (uint8_t)(paddle_x + 8u), PADDLE_Y);
    move_sprite(PADDLE_RIGHT_SPRITE, (uint8_t)(paddle_x + 16u), PADDLE_Y);
}

static void move_paddle(int8_t delta) {
    int16_t next_x;

    if (delta == 0) {
        paddle_x = PADDLE_INITIAL_X;
    } else {
        next_x = (int16_t)paddle_x + delta;

        if (next_x < PADDLE_MIN_X) {
            next_x = PADDLE_MIN_X;
        } else if (next_x > PADDLE_MAX_X) {
            next_x = PADDLE_MAX_X;
        }

        paddle_x = (uint8_t)next_x;
    }

    draw_paddle();
}

static void remove_brick(uint8_t tile_x, uint8_t tile_y) {
    set_bkg_tile_xy(tile_x, tile_y, TILE_EMPTY);
    --bricks_remaining;
}

static bool overlaps_paddle(uint8_t candidate_x, uint8_t candidate_y) {
    int16_t starship_left;
    int16_t starship_right;
    int16_t paddle_left;
    int16_t paddle_right;

    if ((uint16_t)candidate_y + 5u < PADDLE_Y) {
        return false;
    }

    starship_left = candidate_x;
    starship_right = starship_left + 5;
    paddle_left = paddle_x;
    paddle_right = paddle_left + 24;

    return ((starship_left >= paddle_left) && (starship_left <= paddle_right)) ||
           ((starship_right >= paddle_left) && (starship_right < paddle_right));
}

static bool collides(int8_t delta_x, int8_t delta_y) {
    uint8_t candidate_x;
    uint8_t candidate_y;
    int16_t sample_x;
    int16_t sample_y;
    uint8_t tile_x;
    uint8_t tile_y;
    uint8_t tile;

    candidate_x = (uint8_t)(starship_x + delta_x);
    candidate_y = (uint8_t)(starship_y + delta_y);

    if (overlaps_paddle(candidate_x, candidate_y)) {
        return true;
    }

    sample_x = candidate_x;
    sample_y = candidate_y;

    if (starship_vx > 0) {
        sample_x += 5;
    }
    if (starship_vy > 0) {
        sample_y += 5;
    }

    tile_x = (uint8_t)((sample_x - 8) >> 3);
    tile_y = (uint8_t)((sample_y - 16) >> 3);
    tile = get_bkg_tile_xy(tile_x, tile_y);

    if (tile == TILE_BLOCK) {
        remove_brick(tile_x, tile_y);
    }

    return tile != TILE_EMPTY;
}

static void initialize_video(void) {
    DISPLAY_OFF;

    SCX_REG = 0u;
    SCY_REG = 0u;
    WY_REG = 0u;
    WX_REG = 7u;
    STAT_REG = 0u;

    BGP_REG = 0xE4u;
    OBP0_REG = 0xE4u;
    OBP1_REG = 0x1Bu;
    NR52_REG = 0u;

    LCDC_REG = 0x40u;

    set_bkg_data(0x80u, STARSHIP_BREAKOUT_TILE_COUNT, starship_breakout_tile_data);
    set_bkg_tiles(
        0u,
        0u,
        STARSHIP_BREAKOUT_MAP_WIDTH,
        STARSHIP_BREAKOUT_MAP_HEIGHT,
        starship_breakout_background_map
    );

    set_sprite_tile(STARSHIP_SPRITE, TILE_STARSHIP);
    set_sprite_tile(PADDLE_LEFT_SPRITE, TILE_PADDLE_LEFT);
    set_sprite_tile(PADDLE_MIDDLE_SPRITE, TILE_PADDLE_MIDDLE);
    set_sprite_tile(PADDLE_RIGHT_SPRITE, TILE_PADDLE_RIGHT);

    SPRITES_8x8;
    SHOW_BKG;
    SHOW_SPRITES;
    DISPLAY_ON;
}

static void initialize_game(void) {
    paddle_x = PADDLE_INITIAL_X;
    starship_x = STARSHIP_INITIAL_X;
    starship_y = STARSHIP_INITIAL_Y;
    starship_vx = 1;
    starship_vy = -1;
    bricks_remaining = INITIAL_BRICK_COUNT;

    move_paddle(0);
    move_sprite(STARSHIP_SPRITE, starship_x, starship_y);
}

void main(void) {
    uint8_t keys;

    wait_vbl_done();

    initialize_video();
    initialize_game();

    while (bricks_remaining != 0u) {
        keys = joypad();

        if ((keys & J_LEFT) != 0u) {
            move_paddle(-2);
        } else if ((keys & J_RIGHT) != 0u) {
            move_paddle(2);
        }

        if (starship_y >= STARSHIP_LOSS_Y) {
            break;
        }

        if (collides(starship_vx, 0)) {
            starship_vx = (int8_t)-starship_vx;
        }

        if (collides(0, starship_vy)) {
            starship_vy = (int8_t)-starship_vy;
        }

        starship_x = (uint8_t)(starship_x + starship_vx);
        starship_y = (uint8_t)(starship_y + starship_vy);
        move_sprite(STARSHIP_SPRITE, starship_x, starship_y);
        wait_vbl_done();
    }

    while (true) {
        wait_vbl_done();
    }
}
