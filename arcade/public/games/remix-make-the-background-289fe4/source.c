// TITLE: Blue Breakout
// DESC: Break all the bricks with a blue playfield backdrop.
// CONTROLS: D-Pad left/right move paddle; A serves the ball
#include <gb/gb.h>
#include <gb/cgb.h>
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
    PADDLE_LEFT_SPRITE = 1u,
    PADDLE_MIDDLE_SPRITE = 2u,
    PADDLE_RIGHT_SPRITE = 3u,

    PADDLE_Y = 0x98u,
    PADDLE_MIN_X = 0x08u,
    PADDLE_MAX_X = 0x90u,
    PADDLE_INITIAL_X = 0x4Cu,
    BALL_INITIAL_X = 0x50u,
    BALL_INITIAL_Y = 0x88u,
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

/* CGB background palette: color 0 is sky blue for empty playfield tiles. */
static const palette_color_t blue_bkg_pal[] = {
    RGB(8, 16, 31),  /* empty / lightest — blue */
    RGB(4, 8, 24),   /* wall mid */
    RGB(31, 22, 6),  /* brick warm contrast */
    RGB(0, 0, 4)     /* darkest outline */
};

static const palette_color_t sprite_pal[] = {
    RGB(31, 31, 31),
    RGB(20, 20, 20),
    RGB(10, 10, 10),
    RGB(0, 0, 0)
};

static uint8_t paddle_x;
static uint8_t ball_x;
static uint8_t ball_y;
static int8_t ball_vx;
static int8_t ball_vy;
static uint8_t bricks_remaining;
static bool ball_in_play;
static bool rng_seeded;

static void sound_init(void) {
    NR52_REG = 0x80u;
    NR50_REG = 0x77u;
    NR51_REG = 0xFFu;
}

static void sfx_beep(void) {
    NR10_REG = 0x00u;
    NR11_REG = 0x80u;
    NR12_REG = 0xF1u;
    NR13_REG = 0x90u;
    NR14_REG = 0x86u;
}

static void sfx_boom(void) {
    NR41_REG = 0x03u;
    NR42_REG = 0xF2u;
    NR43_REG = 0x5Fu;
    NR44_REG = 0x80u;
}

static void sfx_jingle(void) {
    NR10_REG = 0x00u;
    NR11_REG = 0x80u;
    NR12_REG = 0xF3u;
    NR13_REG = 0xC1u;
    NR14_REG = 0x87u;
}

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
    sfx_beep();
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

    return ((ball_left >= paddle_left) && (ball_left <= paddle_right)) ||
           ((ball_right >= paddle_left) && (ball_right < paddle_right));
}

static bool collides(int8_t delta_x, int8_t delta_y) {
    uint8_t candidate_x;
    uint8_t candidate_y;
    int16_t sample_x;
    int16_t sample_y;
    uint8_t tile_x;
    uint8_t tile_y;
    uint8_t tile;

    candidate_x = (uint8_t)(ball_x + delta_x);
    candidate_y = (uint8_t)(ball_y + delta_y);

    if (overlaps_paddle(candidate_x, candidate_y)) {
        sfx_beep();
        return true;
    }

    sample_x = candidate_x;
    sample_y = candidate_y;

    if (ball_vx > 0) {
        sample_x += 5;
    }
    if (ball_vy > 0) {
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

/* Apply DIV_REG entropy so launch angle/offset differs each run. */
static void seed_from_div(void) {
    uint8_t seed;
    int8_t offset;

    if (rng_seeded) {
        return;
    }
    rng_seeded = true;

    seed = DIV_REG;
    ball_vx = ((seed & 1u) != 0u) ? (int8_t)1 : (int8_t)-1;
    ball_vy = -1;

    offset = (int8_t)((seed >> 1) & 0x0Fu) - 8;
    ball_x = (uint8_t)((int16_t)BALL_INITIAL_X + offset);
    if (ball_x < 0x10u) {
        ball_x = 0x10u;
    } else if (ball_x > 0x98u) {
        ball_x = 0x98u;
    }
}

static void serve_ball(void) {
    seed_from_div();
    ball_in_play = true;
    move_sprite(BALL_SPRITE, ball_x, ball_y);
    sfx_beep();
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

    /* Blue background on Game Boy Color / Super Game Boy-capable hosts. */
    set_bkg_palette(0, 1, blue_bkg_pal);
    set_sprite_palette(0, 1, sprite_pal);

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
    ball_x = BALL_INITIAL_X;
    ball_y = BALL_INITIAL_Y;
    ball_vx = 1;
    ball_vy = -1;
    bricks_remaining = INITIAL_BRICK_COUNT;
    ball_in_play = false;
    rng_seeded = false;

    move_paddle(0);
    move_sprite(BALL_SPRITE, ball_x, ball_y);
}

void main(void) {
    uint8_t keys;

    wait_vbl_done();

    sound_init();
    initialize_video();
    initialize_game();
    NOVA_STATE = 1u;

    while (bricks_remaining != 0u) {
        keys = joypad();

        if ((keys & J_LEFT) != 0u) {
            move_paddle(-2);
            if (!rng_seeded) {
                seed_from_div();
            }
        } else if ((keys & J_RIGHT) != 0u) {
            move_paddle(2);
            if (!rng_seeded) {
                seed_from_div();
            }
        }

        if (!ball_in_play) {
            /* Ball rests on the paddle until A (or any seed input + A). */
            ball_x = (uint8_t)(paddle_x + 8u);
            ball_y = BALL_INITIAL_Y;
            move_sprite(BALL_SPRITE, ball_x, ball_y);

            if ((keys & J_A) != 0u) {
                serve_ball();
            }
            wait_vbl_done();
            continue;
        }

        if (ball_y >= BALL_LOSS_Y) {
            break;
        }

        if (collides(ball_vx, 0)) {
            ball_vx = (int8_t)-ball_vx;
        }

        if (collides(0, ball_vy)) {
            ball_vy = (int8_t)-ball_vy;
        }

        ball_x = (uint8_t)(ball_x + ball_vx);
        ball_y = (uint8_t)(ball_y + ball_vy);
        move_sprite(BALL_SPRITE, ball_x, ball_y);
        wait_vbl_done();
    }

    if (bricks_remaining == 0u) {
        NOVA_STATE = 2u;
        sfx_jingle();
    } else {
        NOVA_STATE = 3u;
        sfx_boom();
    }

    while (true) {
        wait_vbl_done();
    }
}
