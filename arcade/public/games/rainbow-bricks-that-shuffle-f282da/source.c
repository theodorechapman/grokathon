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
    BALL_INITIAL_X = 0x32u,
    BALL_INITIAL_Y = 0x78u,
    BALL_LOSS_Y = 0x9Au,
    INITIAL_BRICK_COUNT = 39u,

    MAX_BRICK_SLOTS = 40u,
    STARTING_LIVES = 3u,
    RAINBOW_PAL_COUNT = 6u
};

/*
 * Nova arcade protocol: one byte at a fixed WRAM address the arcade polls to
 * detect run state. The linker can't move it because it's an absolute pointer,
 * not a variable. 1 = run started, 2 = won, 3 = lost. Every game the pipeline
 * ships MUST keep these three writes intact.
 */
#define NOVA_STATE (*(volatile uint8_t *)0xCF00)

/*
 * These six values correspond to the original ROM's globals at $C0A0-$C0A5.
 * Positions use Game Boy OAM coordinates: visible X is X - 8 and visible Y
 * is Y - 16.
 */
static uint8_t paddle_x;
static uint8_t ball_x;
static uint8_t ball_y;
static int8_t ball_vx;
static int8_t ball_vy;
static uint8_t bricks_remaining;
static uint8_t lives;
static uint8_t rng_state;

/* Original brick slot positions (left tile of each 2-wide brick). */
static uint8_t brick_slot_x[MAX_BRICK_SLOTS];
static uint8_t brick_slot_y[MAX_BRICK_SLOTS];
static uint8_t brick_slot_count;

/*
 * Palette 0 = default greys; palettes 1-6 = rainbow brick colours (CGB).
 * Each entry is four RGB555 colours: light -> dark.
 */
static const uint16_t bkg_palettes[] = {
    /* 0: default */
    RGB(31, 31, 31), RGB(21, 21, 21), RGB(10, 10, 10), RGB(0, 0, 0),
    /* 1: red */
    RGB(31, 28, 28), RGB(31, 8, 8), RGB(18, 0, 0), RGB(0, 0, 0),
    /* 2: orange */
    RGB(31, 28, 24), RGB(31, 18, 4), RGB(20, 8, 0), RGB(0, 0, 0),
    /* 3: yellow */
    RGB(31, 31, 24), RGB(31, 28, 4), RGB(18, 16, 0), RGB(0, 0, 0),
    /* 4: green */
    RGB(28, 31, 28), RGB(6, 28, 8), RGB(0, 14, 0), RGB(0, 0, 0),
    /* 5: blue */
    RGB(28, 28, 31), RGB(6, 12, 31), RGB(0, 0, 18), RGB(0, 0, 0),
    /* 6: violet */
    RGB(31, 28, 31), RGB(24, 6, 28), RGB(12, 0, 16), RGB(0, 0, 0)
};

static const uint16_t sprite_palettes[] = {
    RGB(31, 31, 31), RGB(21, 21, 21), RGB(10, 10, 10), RGB(0, 0, 0),
    RGB(31, 31, 31), RGB(31, 31, 0), RGB(20, 10, 0), RGB(0, 0, 0)
};

static uint8_t rand8(void) {
    /* xorshift PRNG — cheap entropy for shuffle order */
    rng_state ^= (uint8_t)(rng_state << 3);
    rng_state ^= (uint8_t)(rng_state >> 5);
    rng_state ^= (uint8_t)(rng_state << 1);
    if (rng_state == 0u) {
        rng_state = 1u;
    }
    return rng_state;
}

static void apply_brick_attr(uint8_t tile_x, uint8_t tile_y, uint8_t pal) {
    if (_cpu == CGB_TYPE) {
        VBK_REG = 1u;
        set_bkg_tile_xy(tile_x, tile_y, pal);
        set_bkg_tile_xy((uint8_t)(tile_x + 1u), tile_y, pal);
        VBK_REG = 0u;
    }
}

static void place_brick(uint8_t tile_x, uint8_t tile_y, uint8_t color_idx) {
    uint8_t pal;

    pal = (uint8_t)((color_idx % RAINBOW_PAL_COUNT) + 1u);
    set_bkg_tile_xy(tile_x, tile_y, TILE_BRICK_LEFT);
    set_bkg_tile_xy((uint8_t)(tile_x + 1u), tile_y, TILE_BRICK_RIGHT);
    apply_brick_attr(tile_x, tile_y, pal);
}

static void clear_brick_graphics(uint8_t tile_x, uint8_t tile_y) {
    set_bkg_tile_xy(tile_x, tile_y, TILE_EMPTY);
    set_bkg_tile_xy((uint8_t)(tile_x + 1u), tile_y, TILE_EMPTY);
    apply_brick_attr(tile_x, tile_y, 0u);
}

static void discover_brick_slots(void) {
    uint8_t x;
    uint8_t y;
    uint8_t tile;

    brick_slot_count = 0u;

    for (y = 0u; y < BREAKOUT_MAP_HEIGHT; y++) {
        for (x = 0u; x < BREAKOUT_MAP_WIDTH; x++) {
            tile = get_bkg_tile_xy(x, y);
            if (tile == TILE_BRICK_LEFT) {
                if (brick_slot_count < MAX_BRICK_SLOTS) {
                    brick_slot_x[brick_slot_count] = x;
                    brick_slot_y[brick_slot_count] = y;
                    brick_slot_count++;
                }
            }
        }
    }
}

static void rainbow_existing_bricks(void) {
    uint8_t i;

    for (i = 0u; i < brick_slot_count; i++) {
        apply_brick_attr(
            brick_slot_x[i],
            brick_slot_y[i],
            (uint8_t)((i % RAINBOW_PAL_COUNT) + 1u)
        );
    }
}

static void shuffle_bricks(void) {
    uint8_t i;
    uint8_t j;
    uint8_t tmp;
    uint8_t place;

    if (brick_slot_count == 0u) {
        return;
    }

    /* Fisher–Yates shuffle of the slot table. */
    for (i = (uint8_t)(brick_slot_count - 1u); i > 0u; i--) {
        j = (uint8_t)(rand8() % (uint8_t)(i + 1u));

        tmp = brick_slot_x[i];
        brick_slot_x[i] = brick_slot_x[j];
        brick_slot_x[j] = tmp;

        tmp = brick_slot_y[i];
        brick_slot_y[i] = brick_slot_y[j];
        brick_slot_y[j] = tmp;
    }

    /* Clear every known slot, then repaint the remaining bricks. */
    for (i = 0u; i < brick_slot_count; i++) {
        clear_brick_graphics(brick_slot_x[i], brick_slot_y[i]);
    }

    place = bricks_remaining;
    if (place > brick_slot_count) {
        place = brick_slot_count;
    }

    for (i = 0u; i < place; i++) {
        place_brick(brick_slot_x[i], brick_slot_y[i], i);
    }
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
    clear_brick_graphics(tile_x, tile_y);
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
        return true;
    }

    /*
     * The original uses a six-pixel collision span and chooses the leading
     * edge from the current global velocity. The X velocity may already have
     * been reversed by the horizontal probe earlier in this frame.
     */
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

static void reset_ball(void) {
    ball_x = BALL_INITIAL_X;
    ball_y = BALL_INITIAL_Y;
    ball_vx = 1;
    ball_vy = -1;
    move_sprite(BALL_SPRITE, ball_x, ball_y);
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

    if (_cpu == CGB_TYPE) {
        set_bkg_palette(0u, 7u, bkg_palettes);
        set_sprite_palette(0u, 2u, sprite_palettes);
    }

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
    lives = STARTING_LIVES;
    rng_state = 0xA5u;

    discover_brick_slots();
    if (brick_slot_count != 0u) {
        bricks_remaining = brick_slot_count;
    }
    rainbow_existing_bricks();

    move_paddle(0);
    move_sprite(BALL_SPRITE, ball_x, ball_y);
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
        rng_state ^= keys;
        rng_state ^= ball_x;
        rng_state ^= ball_y;

        if ((keys & J_LEFT) != 0u) {
            move_paddle(-2);
        } else if ((keys & J_RIGHT) != 0u) {
            move_paddle(2);
        }

        if (ball_y >= BALL_LOSS_Y) {
            --lives;
            if (lives == 0u) {
                break;
            }
            /* Lose a ball: reshuffle remaining rainbow bricks and serve again. */
            shuffle_bricks();
            reset_ball();
            move_paddle(0);
            wait_vbl_done();
            continue;
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

    /* The original silently idles forever after both a win and a loss. */
    NOVA_STATE = bricks_remaining == 0u ? 2u : 3u;
    while (true) {
        wait_vbl_done();
    }
}
