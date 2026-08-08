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

    MAX_BRICKS = 40u,
    NUM_LIVES = 3u,
    RAINBOW_COUNT = 7u
};

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

typedef struct {
    uint8_t x;
    uint8_t y;
    uint8_t color;
} brick_t;

static brick_t bricks[MAX_BRICKS];
static uint8_t slot_x[MAX_BRICKS];
static uint8_t slot_y[MAX_BRICKS];
static uint8_t num_slots;
static uint8_t lives;
static uint8_t rng;

/* Palette 0 = background; 1-7 = rainbow brick colours (CGB). */
static const palette_color_t brick_palettes[] = {
    RGB(31, 31, 31), RGB(21, 21, 21), RGB(10, 10, 10), RGB(0, 0, 0),
    RGB(31, 31, 31), RGB(31, 4, 4),   RGB(20, 2, 2),   RGB(0, 0, 0),
    RGB(31, 31, 31), RGB(31, 16, 0),  RGB(20, 10, 0),  RGB(0, 0, 0),
    RGB(31, 31, 31), RGB(31, 31, 0),  RGB(18, 18, 0),  RGB(0, 0, 0),
    RGB(31, 31, 31), RGB(4, 28, 4),   RGB(2, 16, 2),   RGB(0, 0, 0),
    RGB(31, 31, 31), RGB(0, 28, 28),  RGB(0, 16, 16),  RGB(0, 0, 0),
    RGB(31, 31, 31), RGB(4, 8, 31),   RGB(2, 4, 18),   RGB(0, 0, 0),
    RGB(31, 31, 31), RGB(26, 0, 31),  RGB(14, 0, 18),  RGB(0, 0, 0)
};

static uint8_t urand(void) {
    rng = (uint8_t)((rng * 37u) + 17u + DIV_REG);
    return rng;
}

static void draw_brick_at(uint8_t x, uint8_t y, uint8_t color) {
    set_bkg_tile_xy(x, y, TILE_BRICK_LEFT);
    set_bkg_tile_xy((uint8_t)(x + 1u), y, TILE_BRICK_RIGHT);

    if (_cpu == CGB_TYPE) {
        VBK_REG = 1u;
        set_bkg_tile_xy(x, y, color);
        set_bkg_tile_xy((uint8_t)(x + 1u), y, color);
        VBK_REG = 0u;
    }
}

static void clear_brick_at(uint8_t x, uint8_t y) {
    set_bkg_tile_xy(x, y, TILE_EMPTY);
    set_bkg_tile_xy((uint8_t)(x + 1u), y, TILE_EMPTY);

    if (_cpu == CGB_TYPE) {
        VBK_REG = 1u;
        set_bkg_tile_xy(x, y, 0u);
        set_bkg_tile_xy((uint8_t)(x + 1u), y, 0u);
        VBK_REG = 0u;
    }
}

static void clear_all_brick_slots(void) {
    uint8_t i;

    for (i = 0u; i < num_slots; i++) {
        clear_brick_at(slot_x[i], slot_y[i]);
    }
}

static void draw_all_bricks(void) {
    uint8_t i;

    for (i = 0u; i < bricks_remaining; i++) {
        draw_brick_at(bricks[i].x, bricks[i].y, bricks[i].color);
    }
}

static void scan_bricks(void) {
    uint8_t x;
    uint8_t y;
    uint8_t tile;

    bricks_remaining = 0u;
    num_slots = 0u;

    for (y = 0u; y < BREAKOUT_MAP_HEIGHT; y++) {
        for (x = 0u; x < BREAKOUT_MAP_WIDTH; x++) {
            tile = get_bkg_tile_xy(x, y);
            if (tile == TILE_BRICK_LEFT) {
                slot_x[num_slots] = x;
                slot_y[num_slots] = y;
                bricks[bricks_remaining].x = x;
                bricks[bricks_remaining].y = y;
                bricks[bricks_remaining].color =
                    (uint8_t)((num_slots % RAINBOW_COUNT) + 1u);
                num_slots++;
                bricks_remaining++;
            }
        }
    }
}

static void apply_rainbow_colors(void) {
    uint8_t i;

    for (i = 0u; i < bricks_remaining; i++) {
        bricks[i].color = (uint8_t)((i % RAINBOW_COUNT) + 1u);
        draw_brick_at(bricks[i].x, bricks[i].y, bricks[i].color);
    }
}

static void shuffle_bricks(void) {
    uint8_t available[MAX_BRICKS];
    uint8_t n;
    uint8_t i;
    uint8_t r;
    uint8_t idx;

    if (bricks_remaining == 0u || num_slots == 0u) {
        return;
    }

    n = num_slots;
    for (i = 0u; i < num_slots; i++) {
        available[i] = i;
    }

    for (i = 0u; i < bricks_remaining; i++) {
        r = (uint8_t)(urand() % n);
        idx = available[r];
        available[r] = available[--n];
        bricks[i].x = slot_x[idx];
        bricks[i].y = slot_y[idx];
        bricks[i].color = (uint8_t)((urand() % RAINBOW_COUNT) + 1u);
    }

    clear_all_brick_slots();
    draw_all_bricks();
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
    uint8_t i;

    clear_brick_at(tile_x, tile_y);

    for (i = 0u; i < bricks_remaining; i++) {
        if ((bricks[i].x == tile_x) && (bricks[i].y == tile_y)) {
            bricks[i] = bricks[bricks_remaining - 1u];
            break;
        }
    }

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
        set_bkg_palette(0u, 8u, brick_palettes);
        set_sprite_palette(0u, 1u, brick_palettes);
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
    lives = NUM_LIVES;
    rng = (uint8_t)(DIV_REG ^ 0xA5u);

    scan_bricks();
    if (bricks_remaining == 0u) {
        bricks_remaining = INITIAL_BRICK_COUNT;
    }
    apply_rainbow_colors();

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

    while (bricks_remaining != 0u) {
        keys = joypad();

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
    while (true) {
        wait_vbl_done();
    }
}
