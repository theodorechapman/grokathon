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

    /* Fireboy sprites (OBP0 — warm) */
    FIRE_BALL_SPRITE = 0u,
    FIRE_PADDLE_LEFT_SPRITE = 1u,
    FIRE_PADDLE_MIDDLE_SPRITE = 2u,
    FIRE_PADDLE_RIGHT_SPRITE = 3u,

    /* Watergirl sprites (OBP1 — cool) */
    WATER_BALL_SPRITE = 4u,
    WATER_PADDLE_LEFT_SPRITE = 5u,
    WATER_PADDLE_MIDDLE_SPRITE = 6u,
    WATER_PADDLE_RIGHT_SPRITE = 7u,

    PADDLE_Y = 0x98u,
    PADDLE_MIN_X = 0x08u,
    PADDLE_MAX_X = 0x90u,
    FIRE_PADDLE_INITIAL_X = 0x2Cu,
    WATER_PADDLE_INITIAL_X = 0x6Cu,
    FIRE_BALL_INITIAL_X = 0x28u,
    FIRE_BALL_INITIAL_Y = 0x78u,
    WATER_BALL_INITIAL_X = 0x68u,
    WATER_BALL_INITIAL_Y = 0x70u,
    BALL_LOSS_Y = 0x9Au,
    INITIAL_BRICK_COUNT = 39u,

    /* Element tags: even BG rows are fire bricks, odd rows are water bricks */
    ELEMENT_FIRE = 0u,
    ELEMENT_WATER = 1u
};

/*
 * Nova arcade protocol: one byte at a fixed WRAM address the arcade polls to
 * detect run state. The linker can't move it because it's an absolute pointer,
 * not a variable. 1 = run started, 2 = won, 3 = lost. Every game the pipeline
 * ships MUST keep these three writes intact.
 */
#define NOVA_STATE (*(volatile uint8_t *)0xCF00)

static uint8_t fire_paddle_x;
static uint8_t water_paddle_x;

static uint8_t fire_ball_x;
static uint8_t fire_ball_y;
static int8_t fire_ball_vx;
static int8_t fire_ball_vy;

static uint8_t water_ball_x;
static uint8_t water_ball_y;
static int8_t water_ball_vx;
static int8_t water_ball_vy;

static uint8_t bricks_remaining;

static void draw_fire_paddle(void) {
    move_sprite(FIRE_PADDLE_LEFT_SPRITE, fire_paddle_x, PADDLE_Y);
    move_sprite(FIRE_PADDLE_MIDDLE_SPRITE, (uint8_t)(fire_paddle_x + 8u), PADDLE_Y);
    move_sprite(FIRE_PADDLE_RIGHT_SPRITE, (uint8_t)(fire_paddle_x + 16u), PADDLE_Y);
}

static void draw_water_paddle(void) {
    move_sprite(WATER_PADDLE_LEFT_SPRITE, water_paddle_x, PADDLE_Y);
    move_sprite(WATER_PADDLE_MIDDLE_SPRITE, (uint8_t)(water_paddle_x + 8u), PADDLE_Y);
    move_sprite(WATER_PADDLE_RIGHT_SPRITE, (uint8_t)(water_paddle_x + 16u), PADDLE_Y);
}

static uint8_t clamp_paddle_x(int16_t next_x) {
    if (next_x < PADDLE_MIN_X) {
        next_x = PADDLE_MIN_X;
    } else if (next_x > PADDLE_MAX_X) {
        next_x = PADDLE_MAX_X;
    }
    return (uint8_t)next_x;
}

/* Fireboy: D-pad left/right */
static void move_fire_paddle(int8_t delta) {
    if (delta == 0) {
        fire_paddle_x = FIRE_PADDLE_INITIAL_X;
    } else {
        fire_paddle_x = clamp_paddle_x((int16_t)fire_paddle_x + delta);
    }
    draw_fire_paddle();
}

/* Watergirl: B = left, A = right (co-op on one pad) */
static void move_water_paddle(int8_t delta) {
    if (delta == 0) {
        water_paddle_x = WATER_PADDLE_INITIAL_X;
    } else {
        water_paddle_x = clamp_paddle_x((int16_t)water_paddle_x + delta);
    }
    draw_water_paddle();
}

static void remove_brick(uint8_t tile_x, uint8_t tile_y) {
    set_bkg_tile_xy(tile_x, tile_y, TILE_EMPTY);
    set_bkg_tile_xy((uint8_t)(tile_x + 1u), tile_y, TILE_EMPTY);
    --bricks_remaining;
}

static bool overlaps_paddle_at(
    uint8_t candidate_x,
    uint8_t candidate_y,
    uint8_t paddle_x
) {
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

/*
 * Each hero only bounces their matching elemental ball — Fireboy handles fire,
 * Watergirl handles water — just like the temple doors in the original duo.
 */
static bool overlaps_own_paddle(
    uint8_t candidate_x,
    uint8_t candidate_y,
    uint8_t element
) {
    if (element == ELEMENT_FIRE) {
        return overlaps_paddle_at(candidate_x, candidate_y, fire_paddle_x);
    }
    return overlaps_paddle_at(candidate_x, candidate_y, water_paddle_x);
}

static bool collides_ball(
    uint8_t *ball_x,
    uint8_t *ball_y,
    int8_t ball_vx,
    int8_t ball_vy,
    int8_t delta_x,
    int8_t delta_y,
    uint8_t element
) {
    uint8_t candidate_x;
    uint8_t candidate_y;
    int16_t sample_x;
    int16_t sample_y;
    uint8_t tile_x;
    uint8_t tile_y;
    uint8_t tile;
    uint8_t brick_element;

    (void)ball_x;
    (void)ball_y;

    candidate_x = (uint8_t)(*ball_x + delta_x);
    candidate_y = (uint8_t)(*ball_y + delta_y);

    if (overlaps_own_paddle(candidate_x, candidate_y, element)) {
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

    if (tile == TILE_BRICK_LEFT || tile == TILE_BRICK_RIGHT) {
        /* Even rows = fire temple bricks; odd rows = water temple bricks */
        brick_element = (uint8_t)(tile_y & 1u);

        if (brick_element == element) {
            if (tile == TILE_BRICK_LEFT) {
                remove_brick(tile_x, tile_y);
            } else {
                remove_brick((uint8_t)(tile_x - 1u), tile_y);
            }
        }
        /* Matching or not, solid bricks still reverse the ball */
        return true;
    }

    return tile != TILE_EMPTY;
}

static void update_ball(
    uint8_t *ball_x,
    uint8_t *ball_y,
    int8_t *ball_vx,
    int8_t *ball_vy,
    uint8_t element,
    uint8_t sprite
) {
    if (collides_ball(ball_x, ball_y, *ball_vx, *ball_vy, *ball_vx, 0, element)) {
        *ball_vx = (int8_t)-(*ball_vx);
    }

    if (collides_ball(ball_x, ball_y, *ball_vx, *ball_vy, 0, *ball_vy, element)) {
        *ball_vy = (int8_t)-(*ball_vy);
    }

    *ball_x = (uint8_t)(*ball_x + *ball_vx);
    *ball_y = (uint8_t)(*ball_y + *ball_vy);
    move_sprite(sprite, *ball_x, *ball_y);
}

static void initialize_video(void) {
    DISPLAY_OFF;

    SCX_REG = 0u;
    SCY_REG = 0u;
    WY_REG = 0u;
    WX_REG = 7u;
    STAT_REG = 0u;

    BGP_REG = 0xE4u;
    OBP0_REG = 0xE4u;  /* Fireboy */
    OBP1_REG = 0x1Bu;  /* Watergirl — cooler shade */
    NR52_REG = 0u;

    LCDC_REG = 0x40u;

    set_bkg_data(0x80u, BREAKOUT_TILE_COUNT, breakout_tile_data);
    set_bkg_tiles(
        0u,
        0u,
        BREAKOUT_MAP_WIDTH,
        BREAKOUT_MAP_HEIGHT,
        breakout_background_map
    );

    set_sprite_tile(FIRE_BALL_SPRITE, TILE_BALL);
    set_sprite_tile(FIRE_PADDLE_LEFT_SPRITE, TILE_PADDLE_LEFT);
    set_sprite_tile(FIRE_PADDLE_MIDDLE_SPRITE, TILE_PADDLE_MIDDLE);
    set_sprite_tile(FIRE_PADDLE_RIGHT_SPRITE, TILE_PADDLE_RIGHT);

    set_sprite_tile(WATER_BALL_SPRITE, TILE_BALL);
    set_sprite_tile(WATER_PADDLE_LEFT_SPRITE, TILE_PADDLE_LEFT);
    set_sprite_tile(WATER_PADDLE_MIDDLE_SPRITE, TILE_PADDLE_MIDDLE);
    set_sprite_tile(WATER_PADDLE_RIGHT_SPRITE, TILE_PADDLE_RIGHT);

    /* Watergirl family uses OBP1 */
    set_sprite_prop(WATER_BALL_SPRITE, S_PALETTE);
    set_sprite_prop(WATER_PADDLE_LEFT_SPRITE, S_PALETTE);
    set_sprite_prop(WATER_PADDLE_MIDDLE_SPRITE, S_PALETTE);
    set_sprite_prop(WATER_PADDLE_RIGHT_SPRITE, S_PALETTE);

    SPRITES_8x8;
    SHOW_BKG;
    SHOW_SPRITES;
    DISPLAY_ON;
}

static void initialize_game(void) {
    fire_paddle_x = FIRE_PADDLE_INITIAL_X;
    water_paddle_x = WATER_PADDLE_INITIAL_X;

    fire_ball_x = FIRE_BALL_INITIAL_X;
    fire_ball_y = FIRE_BALL_INITIAL_Y;
    fire_ball_vx = 1;
    fire_ball_vy = -1;

    water_ball_x = WATER_BALL_INITIAL_X;
    water_ball_y = WATER_BALL_INITIAL_Y;
    water_ball_vx = -1;
    water_ball_vy = -1;

    bricks_remaining = INITIAL_BRICK_COUNT;

    move_fire_paddle(0);
    move_water_paddle(0);
    move_sprite(FIRE_BALL_SPRITE, fire_ball_x, fire_ball_y);
    move_sprite(WATER_BALL_SPRITE, water_ball_x, water_ball_y);
}

void main(void) {
    uint8_t keys;
    bool lost;

    wait_vbl_done();

    initialize_video();
    initialize_game();
    NOVA_STATE = 1u;

    lost = false;

    while (bricks_remaining != 0u) {
        keys = joypad();

        /* Fireboy — D-pad */
        if ((keys & J_LEFT) != 0u) {
            move_fire_paddle(-2);
        } else if ((keys & J_RIGHT) != 0u) {
            move_fire_paddle(2);
        }

        /* Watergirl — B left, A right */
        if ((keys & J_B) != 0u) {
            move_water_paddle(-2);
        } else if ((keys & J_A) != 0u) {
            move_water_paddle(2);
        }

        /* Either hero falling into the pit ends the run for both */
        if (fire_ball_y >= BALL_LOSS_Y || water_ball_y >= BALL_LOSS_Y) {
            lost = true;
            break;
        }

        update_ball(
            &fire_ball_x,
            &fire_ball_y,
            &fire_ball_vx,
            &fire_ball_vy,
            ELEMENT_FIRE,
            FIRE_BALL_SPRITE
        );
        update_ball(
            &water_ball_x,
            &water_ball_y,
            &water_ball_vx,
            &water_ball_vy,
            ELEMENT_WATER,
            WATER_BALL_SPRITE
        );

        wait_vbl_done();
    }

    NOVA_STATE = (!lost && bricks_remaining == 0u) ? 2u : 3u;
    while (true) {
        wait_vbl_done();
    }
}
