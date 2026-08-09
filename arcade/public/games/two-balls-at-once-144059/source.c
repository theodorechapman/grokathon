#include <gb/gb.h>
#include <stdbool.h>
#include <stdint.h>

#include "assets.h"

enum {
    TILE_EMPTY = 0x80u,
    TILE_BRICK_LEFT = 0x88u,
    TILE_BRICK_RIGHT = 0x89u,
    TILE_PADDLE_LEFT = 0x8Cu,
    TILE_PADDLE_MIDDLE = 0x8Du,
    TILE_PADDLE_RIGHT = 0x8Eu,
    TILE_BALL = 0x8Fu,

    BALL_SPRITE = 0u,
    BALL2_SPRITE = 4u,
    PADDLE_LEFT_SPRITE = 1u,
    PADDLE_MIDDLE_SPRITE = 2u,
    PADDLE_RIGHT_SPRITE = 3u,

    PADDLE_Y = 0x98u,
    PADDLE_MIN_X = 0x08u,
    PADDLE_MAX_X = 0x90u,
    PADDLE_INITIAL_X = 0x4Cu,
    BALL_INITIAL_X = 0x32u,
    BALL_INITIAL_Y = 0x78u,
    BALL2_INITIAL_X = 0x5Au,
    BALL2_INITIAL_Y = 0x78u,
    BALL_LOSS_Y = 0x9Au,
    INITIAL_BRICK_COUNT = 39u
};

/*
 * Nova arcade protocol: one byte at a fixed WRAM address the arcade polls to
 * detect run state. The linker can't move it because it's an absolute pointer,
 * not a variable. 1 = run started, 2 = won, 3 = lost. Every game the pipeline
 * ships MUST keep these three writes intact.
 */
#define NOVA_STATE (*(volatile uint8_t *)0xCF00)

/*
 * These values correspond to the original ROM's globals at $C0A0-$C0A5, extended
 * for a second simultaneous ball. Positions use Game Boy OAM coordinates:
 * visible X is X - 8 and visible Y is Y - 16.
 */
static uint8_t paddle_x;
static uint8_t ball_x[2];
static uint8_t ball_y[2];
static int8_t ball_vx[2];
static int8_t ball_vy[2];
static bool ball_alive[2];
static uint8_t bricks_remaining;

static const uint8_t ball_sprites[2] = { BALL_SPRITE, BALL2_SPRITE };

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
    set_bkg_tile_xy((uint8_t)(tile_x + 1u), tile_y, TILE_EMPTY);
    --bricks_remaining;
}

static bool overlaps_paddle(uint8_t candidate_x, uint8_t candidate_y) {
    int16_t ball_left;
    int16_t ball_right;
    int16_t paddle_left;
    int16_t paddle_right;

    if ((uint16_t)candidate_y + 5u < PADDLE_Y) {
        return false;
    }

    ball_left = candidate_x;
    ball_right = ball_left + 5;
    paddle_left = paddle_x;
    paddle_right = paddle_left + 24;

    /*
     * This intentionally preserves the ROM's slightly asymmetric right edge:
     * the ball's left sample is inclusive, while its right sample is strict.
     */
    return ((ball_left >= paddle_left) && (ball_left <= paddle_right)) ||
           ((ball_right >= paddle_left) && (ball_right < paddle_right));
}

static bool collides(uint8_t idx, int8_t delta_x, int8_t delta_y) {
    uint8_t candidate_x;
    uint8_t candidate_y;
    int16_t sample_x;
    int16_t sample_y;
    uint8_t tile_x;
    uint8_t tile_y;
    uint8_t tile;

    candidate_x = (uint8_t)(ball_x[idx] + delta_x);
    candidate_y = (uint8_t)(ball_y[idx] + delta_y);

    if (overlaps_paddle(candidate_x, candidate_y)) {
        return true;
    }

    /*
     * The original uses a six-pixel collision span and chooses the leading
     * edge from the current global velocity. The X velocity may already have
     * been reversed by the horizontal probe earlier in this frame.
     */
    sample_x = candidate_x;
    sample_y = candidate_y;

    if (ball_vx[idx] > 0) {
        sample_x += 5;
    }
    if (ball_vy[idx] > 0) {
        sample_y += 5;
    }

    tile_x = (uint8_t)((sample_x - 8) >> 3);
    tile_y = (uint8_t)((sample_y - 16) >> 3);
    tile = get_bkg_tile_xy(tile_x, tile_y);

    if (tile == TILE_BRICK_LEFT) {
        remove_brick(tile_x, tile_y);
    } else if (tile == TILE_BRICK_RIGHT) {
        remove_brick((uint8_t)(tile_x - 1u), tile_y);
    }

    return tile != TILE_EMPTY;
}

static void update_ball(uint8_t idx) {
    if (!ball_alive[idx]) {
        return;
    }

    if (ball_y[idx] >= BALL_LOSS_Y) {
        ball_alive[idx] = false;
        hide_sprite(ball_sprites[idx]);
        return;
    }

    if (collides(idx, ball_vx[idx], 0)) {
        ball_vx[idx] = (int8_t)-ball_vx[idx];
    }

    if (collides(idx, 0, ball_vy[idx])) {
        ball_vy[idx] = (int8_t)-ball_vy[idx];
    }

    ball_x[idx] = (uint8_t)(ball_x[idx] + ball_vx[idx]);
    ball_y[idx] = (uint8_t)(ball_y[idx] + ball_vy[idx]);
    move_sprite(ball_sprites[idx], ball_x[idx], ball_y[idx]);
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

    /*
     * Bit 4 remains clear so background tile IDs $80-$FF use the signed
     * $8800 tile-data region. SHOW_BKG, SHOW_SPRITES, and DISPLAY_ON below
     * turn this into the original final LCDC value, $C3.
     */
    LCDC_REG = 0x40u;

    set_bkg_data(0x80u, BREAKOUT_TILE_COUNT, breakout_tile_data);
    set_bkg_tiles(
        0u,
        0u,
        BREAKOUT_MAP_WIDTH,
        BREAKOUT_MAP_HEIGHT,
        breakout_background_map
    );

    set_sprite_tile(BALL_SPRITE, TILE_BALL);
    set_sprite_tile(BALL2_SPRITE, TILE_BALL);
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

    ball_x[0] = BALL_INITIAL_X;
    ball_y[0] = BALL_INITIAL_Y;
    ball_vx[0] = 1;
    ball_vy[0] = -1;
    ball_alive[0] = true;

    ball_x[1] = BALL2_INITIAL_X;
    ball_y[1] = BALL2_INITIAL_Y;
    ball_vx[1] = -1;
    ball_vy[1] = -1;
    ball_alive[1] = true;

    bricks_remaining = INITIAL_BRICK_COUNT;

    move_paddle(0);
    move_sprite(BALL_SPRITE, ball_x[0], ball_y[0]);
    move_sprite(BALL2_SPRITE, ball_x[1], ball_y[1]);
}

void main(void) {
    uint8_t keys;

    /*
     * The recovered CRT clears a larger runtime area than modern GBDK does.
     * Waiting one VBlank here aligns the first active gameplay frame with the
     * original ROM (frame 90 after reset in the deterministic SameBoy boot).
     */
    wait_vbl_done();

    initialize_video();
    initialize_game();
    NOVA_STATE = 1u;

    while (bricks_remaining != 0u) {
        keys = joypad();

        if ((keys & J_LEFT) != 0u) {
            move_paddle(-2);
        } else if ((keys & J_RIGHT) != 0u) {
            move_paddle(2);
        }

        update_ball(0);
        update_ball(1);

        if (!ball_alive[0] && !ball_alive[1]) {
            break;
        }

        wait_vbl_done();
    }

    /* The original silently idles forever after both a win and a loss. */
    NOVA_STATE = bricks_remaining == 0u ? 2u : 3u;
    while (true) {
        wait_vbl_done();
    }
}
