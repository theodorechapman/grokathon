// TITLE: Postie Breakout
// DESC: Classic brick-breaker with a green playfield for Postie.
// CONTROLS: D-Pad left/right moves paddle; clear all bricks to win
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
static bool run_seeded;

/*
 * Solid light-green empty tile (2bpp color index 1). On DMG LCD this reads as
 * a soft green field behind the bricks instead of blank white.
 * Each row: low plane 0xFF, high plane 0x00 => color 1.
 */
static const uint8_t green_empty_tile[16] = {
    0xFFu, 0x00u, 0xFFu, 0x00u, 0xFFu, 0x00u, 0xFFu, 0x00u,
    0xFFu, 0x00u, 0xFFu, 0x00u, 0xFFu, 0x00u, 0xFFu, 0x00u
};

/*
 * APU helpers. Reusable one-call sound effects on the Game Boy's channels.
 * Remixes should call these (retuning register values if a different pitch
 * or feel is wanted) instead of writing raw NRxx sequences at every new
 * sound moment. sound_init() must run once, after initialize_video(), which
 * powers the APU down like the original ROM did.
 */
static void sound_init(void) {
    NR52_REG = 0x80u; /* APU on; must be set before any other register */
    NR51_REG = 0xFFu; /* every channel to both output terminals */
    NR50_REG = 0x77u; /* max master volume, VIN off */
}

/* Short square blip on channel 1: paddle and brick hits. Non-blocking. */
static void sfx_beep(void) {
    NR10_REG = 0x00u; /* no sweep */
    NR11_REG = 0x80u; /* 50% duty */
    NR12_REG = 0xF1u; /* full volume, fast envelope decay */
    NR13_REG = 0x83u;
    NR14_REG = 0x87u; /* trigger, period 0x783 (~1050 Hz) */
}

/* Noise burst on channel 4: the loss thud. Non-blocking. */
static void sfx_boom(void) {
    NR41_REG = 0x00u;
    NR42_REG = 0xF3u; /* full volume, medium envelope decay */
    NR43_REG = 0x54u; /* mid-pitch noise */
    NR44_REG = 0x80u; /* trigger */
}

/* Rising four-note win arpeggio on channel 2. Blocks about half a second. */
static void sfx_jingle(void) {
    static const uint16_t notes[4] = {1797u, 1849u, 1881u, 1923u}; /* C5 E5 G5 C6 */
    uint8_t i;
    uint8_t frame;

    for (i = 0u; i < 4u; ++i) {
        NR21_REG = 0x80u; /* 50% duty */
        NR22_REG = 0xF2u; /* full volume, gentle decay */
        NR23_REG = (uint8_t)notes[i];
        NR24_REG = (uint8_t)(0x80u | (notes[i] >> 8)); /* trigger */
        for (frame = 0u; frame < 8u; ++frame) {
            wait_vbl_done();
        }
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

/* Seed ball angle/position from DIV so runs differ; call on first input. */
static void seed_run_from_div(void) {
    uint8_t seed;

    seed = DIV_REG;
    /* Horizontal launch direction and a small X jitter from the timer. */
    if ((seed & 1u) != 0u) {
        ball_vx = -1;
    } else {
        ball_vx = 1;
    }
    ball_x = (uint8_t)(BALL_INITIAL_X + (seed & 0x1Fu));
    if (ball_x < 0x10u) {
        ball_x = 0x10u;
    } else if (ball_x > 0x98u) {
        ball_x = 0x98u;
    }
    move_sprite(BALL_SPRITE, ball_x, ball_y);
    run_seeded = true;
}

static void initialize_video(void) {
    DISPLAY_OFF;

    SCX_REG = 0u;
    SCY_REG = 0u;
    WY_REG = 0u;
    WX_REG = 7u;
    STAT_REG = 0u;

    /*
     * BGP maps color indices 0-3 to LCD shades. 0xE4 is the classic ramp;
     * empty playfield tiles use index 1 so the field reads as soft green on
     * DMG (and a mid shade on gray emulators).
     */
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
    /* Replace blank empty tile with solid green field for Postie. */
    set_bkg_data(TILE_EMPTY, 1u, green_empty_tile);
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
    run_seeded = false;

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
    NOVA_STATE = 1;

    while (bricks_remaining != 0u) {
        keys = joypad();

        if (!run_seeded && (keys != 0u)) {
            seed_run_from_div();
        }

        if ((keys & J_LEFT) != 0u) {
            move_paddle(-2);
        } else if ((keys & J_RIGHT) != 0u) {
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
        wait_vbl_done();
    }

    /* The original silently idles forever after both a win and a loss. */
    if (bricks_remaining == 0u) {
        NOVA_STATE = 2;
        sfx_jingle();
    } else {
        NOVA_STATE = 3;
        sfx_boom();
    }
    while (true) {
        wait_vbl_done();
    }
}
