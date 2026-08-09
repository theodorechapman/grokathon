// TITLE: Spark Brick Breakout
// DESC: Bricks explode into flying sparks when the ball smashes them.
#include <gb/gb.h>
#include <stdbool.h>
#include <stdint.h>
#include <rand.h>

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
    SPARK_SPRITE_BASE = 4u,
    MAX_SPARKS = 8u,

    PADDLE_Y = 0x98u,
    PADDLE_MIN_X = 0x08u,
    PADDLE_MAX_X = 0x90u,
    PADDLE_INITIAL_X = 0x4Cu,
    BALL_INITIAL_X = 0x32u,
    BALL_INITIAL_Y = 0x78u,
    BALL_LOSS_Y = 0x9Au,
    INITIAL_BRICK_COUNT = 39u,

    SPARK_LIFE = 12u
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
static bool rng_seeded;

typedef struct {
    uint8_t x;
    uint8_t y;
    int8_t vx;
    int8_t vy;
    uint8_t life;
} spark_t;

static spark_t sparks[MAX_SPARKS];

static void sound_init(void) {
    NR52_REG = 0x80u;
    NR50_REG = 0x77u;
    NR51_REG = 0xFFu;
    NR10_REG = 0x00u;
}

static void sfx_beep(void) {
    NR21_REG = 0x80u;
    NR22_REG = 0xF1u;
    NR23_REG = 0x9Cu;
    NR24_REG = 0x86u;
}

static void sfx_boom(void) {
    NR41_REG = 0x01u;
    NR42_REG = 0xF2u;
    NR43_REG = 0x55u;
    NR44_REG = 0x80u;
}

static void sfx_jingle(void) {
    NR21_REG = 0x80u;
    NR22_REG = 0xF3u;
    NR23_REG = 0x73u;
    NR24_REG = 0x87u;
}

static void hide_spark_sprites(void) {
    uint8_t i;

    for (i = 0u; i < MAX_SPARKS; i++) {
        sparks[i].life = 0u;
        move_sprite((uint8_t)(SPARK_SPRITE_BASE + i), 0u, 0u);
    }
}

static void spawn_sparks(uint8_t origin_x, uint8_t origin_y) {
    static const int8_t dirs_x[8] = { -2, -1, 1, 2, -2, 2, -1, 1 };
    static const int8_t dirs_y[8] = { -2, -2, -2, -1, 1, 1, 2, 2 };
    uint8_t i;
    uint8_t slot;
    uint8_t base;

    base = (uint8_t)(rand() & 7u);

    for (i = 0u; i < MAX_SPARKS; i++) {
        slot = i;
        sparks[slot].x = origin_x;
        sparks[slot].y = origin_y;
        sparks[slot].vx = dirs_x[(base + i) & 7u];
        sparks[slot].vy = dirs_y[(base + i) & 7u];
        /* Slight life jitter so the burst feels less uniform */
        sparks[slot].life = (uint8_t)(SPARK_LIFE - (rand() & 3u));
        move_sprite((uint8_t)(SPARK_SPRITE_BASE + slot), origin_x, origin_y);
    }
}

static void update_sparks(void) {
    uint8_t i;

    for (i = 0u; i < MAX_SPARKS; i++) {
        if (sparks[i].life == 0u) {
            move_sprite((uint8_t)(SPARK_SPRITE_BASE + i), 0u, 0u);
            continue;
        }

        sparks[i].x = (uint8_t)((int16_t)sparks[i].x + sparks[i].vx);
        sparks[i].y = (uint8_t)((int16_t)sparks[i].y + sparks[i].vy);
        /* Gravity tug on sparks */
        if ((sparks[i].life & 1u) == 0u) {
            sparks[i].vy += 1;
        }
        sparks[i].life--;
        move_sprite(
            (uint8_t)(SPARK_SPRITE_BASE + i),
            sparks[i].x,
            sparks[i].y
        );
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
    uint8_t spark_x;
    uint8_t spark_y;

    set_bkg_tile_xy(tile_x, tile_y, TILE_EMPTY);
    set_bkg_tile_xy((uint8_t)(tile_x + 1u), tile_y, TILE_EMPTY);
    --bricks_remaining;

    /* Convert brick tile coords to approximate OAM center for the burst */
    spark_x = (uint8_t)((tile_x << 3) + 16u);
    spark_y = (uint8_t)((tile_y << 3) + 24u);
    spawn_sparks(spark_x, spark_y);
    sfx_boom();
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
        sfx_beep();
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

static void seed_rng_from_div(void) {
    uint16_t seed;

    seed = (uint16_t)DIV_REG;
    seed |= (uint16_t)((uint16_t)DIV_REG << 8);
    if (seed == 0u) {
        seed = 1u;
    }
    initrand(seed);
    rng_seeded = true;

    /* Nudge initial ball angle from the seed so runs diverge */
    if ((rand() & 1u) != 0u) {
        ball_vx = (int8_t)-ball_vx;
    }
}

static void initialize_video(void) {
    uint8_t i;

    DISPLAY_OFF;

    SCX_REG = 0u;
    SCY_REG = 0u;
    WY_REG = 0u;
    WX_REG = 7u;
    STAT_REG = 0u;

    BGP_REG = 0xE4u;
    OBP0_REG = 0xE4u;
    OBP1_REG = 0x1Bu;

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
    set_sprite_tile(PADDLE_LEFT_SPRITE, TILE_PADDLE_LEFT);
    set_sprite_tile(PADDLE_MIDDLE_SPRITE, TILE_PADDLE_MIDDLE);
    set_sprite_tile(PADDLE_RIGHT_SPRITE, TILE_PADDLE_RIGHT);

    for (i = 0u; i < MAX_SPARKS; i++) {
        set_sprite_tile((uint8_t)(SPARK_SPRITE_BASE + i), TILE_BALL);
        set_sprite_prop((uint8_t)(SPARK_SPRITE_BASE + i), 0x10u);
    }

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
    rng_seeded = false;

    hide_spark_sprites();
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
    sound_init();
    initialize_game();
    NOVA_STATE = 1u;

    while (bricks_remaining != 0u) {
        keys = joypad();

        if ((keys & J_LEFT) != 0u) {
            if (!rng_seeded) {
                seed_rng_from_div();
            }
            move_paddle(-2);
        } else if ((keys & J_RIGHT) != 0u) {
            if (!rng_seeded) {
                seed_rng_from_div();
            }
            move_paddle(2);
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
        update_sparks();
        wait_vbl_done();
    }

    if (bricks_remaining == 0u) {
        sfx_jingle();
        NOVA_STATE = 2u;
    } else {
        sfx_boom();
        NOVA_STATE = 3u;
    }

    /* Drain remaining spark animation briefly, then idle forever. */
    {
        uint8_t drain;

        for (drain = 0u; drain < SPARK_LIFE; drain++) {
            update_sparks();
            wait_vbl_done();
        }
    }

    while (true) {
        wait_vbl_done();
    }
}
