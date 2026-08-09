// TITLE: Postie
// DESC: Three-room wall-jump mail run with throwable balls on a red field.
// CONTROLS: D-pad move, A jump/wall-jump, Down pick up/throw ball
#include <gb/gb.h>
#include <gb/cgb.h>
#include <stdbool.h>
#include <stdint.h>
#include <rand.h>

#include "assets.h"

#define NOVA_STATE (*(volatile uint8_t *)0xCF00)

/* ---- tile indices (loaded at 0x80) ---- */
enum {
    T_EMPTY = 0u,
    T_SOLID = 1u,
    T_SPIKE = 2u,
    T_GOAL = 3u,
    T_PLAT = 4u,
    T_POST = 5u,
    T_BALL = 6u,
    T_PLAYER = 7u,
    T_COUNT = 8u
};

enum {
    SPR_PLAYER = 0u,
    SPR_BALL = 1u,
    MAX_LIVES = 5u,
    NUM_ROOMS = 3u,
    /* pixel sizes */
    PW = 8,
    PH = 8,
    BW = 6,
    BH = 6,
    /* physics (fixed-ish: position in pixels, velocity in 1/2 px units stored as int8) */
    GRAVITY = 1,
    MAX_FALL = 6,
    MOVE_SPEED = 2,
    JUMP_V = -6,
    WALL_JUMP_V = -5,
    WALL_JUMP_X = 3,
    THROW_SPEED = 4,
    BALL_GRAV = 1,
    BALL_MAX_FALL = 5
};

/* Custom 2bpp tiles — red-friendly solids and simple sprites */
static const uint8_t tile_data[T_COUNT * 16u] = {
    /* 0 empty */
    0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
    /* 1 solid brick */
    0xFF,0xFF,0x81,0x7E,0xBD,0x42,0xA5,0x5A,0xA5,0x5A,0xBD,0x42,0x81,0x7E,0xFF,0xFF,
    /* 2 spike */
    0x00,0x00,0x18,0x18,0x3C,0x24,0x7E,0x42,0xFF,0x81,0xFF,0x81,0xFF,0xFF,0x00,0x00,
    /* 3 goal flag / mailbox */
    0x18,0x18,0x18,0x18,0x7E,0x7E,0xFF,0x81,0xFF,0x81,0xFF,0xFF,0x18,0x18,0x3C,0x3C,
    /* 4 platform top */
    0xFF,0xFF,0xFF,0x00,0xFF,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
    /* 5 post pillar */
    0x3C,0x3C,0x3C,0x24,0x3C,0x24,0x3C,0x24,0x3C,0x24,0x3C,0x24,0x3C,0x24,0x3C,0x3C,
    /* 6 ball */
    0x00,0x00,0x3C,0x3C,0x7E,0x42,0x7E,0x5A,0x7E,0x5A,0x7E,0x42,0x3C,0x3C,0x00,0x00,
    /* 7 player */
    0x3C,0x3C,0x7E,0x5A,0x7E,0x7E,0x3C,0x3C,0x18,0x18,0x3C,0x24,0x24,0x24,0x66,0x66
};

/* Red CGB background palette (light → dark red) */
static const UWORD red_bgp[4] = {
    RGB(31, 10, 10),
    RGB(28, 4, 4),
    RGB(18, 0, 0),
    RGB(8, 0, 0)
};
static const UWORD spr_obp[4] = {
    RGB(31, 31, 31),
    RGB(20, 20, 24),
    RGB(8, 8, 12),
    RGB(0, 0, 0)
};

/*
 * Three 20x18 rooms. Values are T_* indices; drawn as 0x80+id.
 * Legend: . empty  # solid  ^ spike  G goal  = plat  | post
 */
static const uint8_t room_maps[NUM_ROOMS][20 * 18] = {
    { /* Room 0 — tutorial wall-jumps, ball on ledge */
        1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
        1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
        1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
        1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
        1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
        1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
        1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,
        1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
        1,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,1,
        1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
        1,0,0,0,0,0,0,0,1,1,4,4,0,0,0,0,0,0,0,1,
        1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
        1,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,1,
        1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
        1,4,4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
        1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,1,
        1,1,1,1,1,1,0,0,1,1,1,1,1,1,1,1,1,1,1,1,
        1,1,1,1,1,1,2,2,1,1,1,1,1,1,1,1,1,1,1,1
    },
    { /* Room 1 — vertical climb, throw ball at post-switch feel via spikes gap */
        1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
        1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
        1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
        1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
        1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,
        1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
        1,0,0,0,1,1,0,0,0,0,0,0,0,1,1,0,0,0,0,1,
        1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
        1,1,0,0,0,0,0,0,1,1,4,0,0,0,0,0,0,0,0,1,
        1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,
        1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
        1,0,0,1,1,0,0,0,0,0,0,0,0,0,1,1,0,0,0,1,
        1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
        1,0,0,0,0,0,0,4,4,0,0,0,0,0,0,0,0,0,0,1,
        1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
        1,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,1,
        1,1,1,1,0,0,1,1,1,1,1,1,1,0,0,1,1,1,1,1,
        1,1,1,1,2,2,1,1,1,1,1,1,1,2,2,1,1,1,1,1
    },
    { /* Room 2 — final gauntlet, goal top-right */
        1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
        1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3,1,
        1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,5,1,
        1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,
        1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
        1,1,1,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,1,
        1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
        1,0,0,0,0,1,1,0,0,0,0,0,0,0,0,1,1,0,0,1,
        1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
        1,0,0,0,0,0,0,0,1,1,4,4,0,0,0,0,0,0,0,1,
        1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
        1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,
        1,0,0,0,0,0,4,4,0,0,0,0,0,4,4,0,0,0,0,1,
        1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
        1,0,0,1,1,0,0,0,0,0,0,0,0,0,0,1,1,0,0,1,
        1,0,0,0,0,0,0,0,0,2,2,0,0,0,0,0,0,0,0,1,
        1,1,1,0,0,1,1,1,1,1,1,1,1,1,1,0,0,1,1,1,
        1,1,1,2,2,1,1,1,1,1,1,1,1,1,1,2,2,1,1,1
    }
};

/* Per-room spawn (tile coords) and ball spawn; exit is right edge except room 2 uses goal tile */
static const uint8_t room_spawn_tx[NUM_ROOMS] = { 2u, 2u, 2u };
static const uint8_t room_spawn_ty[NUM_ROOMS] = { 14u, 14u, 14u };
static const uint8_t room_ball_tx[NUM_ROOMS] = { 10u, 9u, 7u };
static const uint8_t room_ball_ty[NUM_ROOMS] = { 9u, 7u, 11u };

static uint8_t room;
static uint8_t lives;
static uint8_t won;
static uint8_t lost;
static uint8_t seeded;
static uint8_t rng_pool;

/* Player: OAM pixel position (top-left of sprite uses standard GB offset) */
static int16_t px, py;
static int8_t pvx, pvy;
static int8_t facing; /* 1 right, -1 left */
static uint8_t on_ground;
static uint8_t on_wall; /* 0 none, 1 left wall, 2 right wall */
static uint8_t holding_ball;
static uint8_t jump_held;
static uint8_t down_held;

/* Ball world position; active when not held */
static int16_t bx, by;
static int8_t bvx, bvy;
static uint8_t ball_alive; /* in world (not held, not destroyed) */
static uint8_t ball_held;

/* Current collision map mirror */
static uint8_t cmap[20 * 18];

/*
 * APU helpers. Reusable one-call sound effects on the Game Boy's channels.
 */
static void sound_init(void) {
    NR52_REG = 0x80u;
    NR51_REG = 0xFFu;
    NR50_REG = 0x77u;
}

static void sfx_beep(void) {
    NR10_REG = 0x00u;
    NR11_REG = 0x80u;
    NR12_REG = 0xF1u;
    NR13_REG = 0x83u;
    NR14_REG = 0x87u;
}

static void sfx_boom(void) {
    NR41_REG = 0x00u;
    NR42_REG = 0xF3u;
    NR43_REG = 0x54u;
    NR44_REG = 0x80u;
}

static void sfx_jingle(void) {
    static const uint16_t notes[4] = {1797u, 1849u, 1881u, 1923u};
    uint8_t i;
    uint8_t frame;

    for (i = 0u; i < 4u; ++i) {
        NR21_REG = 0x80u;
        NR22_REG = 0xF2u;
        NR23_REG = (uint8_t)notes[i];
        NR24_REG = (uint8_t)(0x80u | (notes[i] >> 8));
        for (frame = 0u; frame < 8u; ++frame) {
            wait_vbl_done();
        }
    }
}

static void sfx_jump(void) {
    NR10_REG = 0x15u;
    NR11_REG = 0x80u;
    NR12_REG = 0xF2u;
    NR13_REG = 0xD0u;
    NR14_REG = 0x86u;
}

static void sfx_throw(void) {
    NR10_REG = 0x00u;
    NR11_REG = 0x40u;
    NR12_REG = 0xD1u;
    NR13_REG = 0x20u;
    NR14_REG = 0x87u;
}

static uint8_t tile_at(int16_t x, int16_t y) {
    int16_t tx, ty;

    /* Convert OAM coords to background pixel then tile */
    tx = (x - 8) >> 3;
    ty = (y - 16) >> 3;
    if (tx < 0 || ty < 0 || tx >= 20 || ty >= 18) {
        return T_SOLID;
    }
    return cmap[(uint8_t)ty * 20u + (uint8_t)tx];
}

static bool solid_tile(uint8_t t) {
    return t == T_SOLID || t == T_PLAT || t == T_POST;
}

static bool hazard_tile(uint8_t t) {
    return t == T_SPIKE;
}

static bool goal_tile(uint8_t t) {
    return t == T_GOAL;
}

/* Sample body corners for player (6x7 hitbox inside 8x8) */
static uint8_t collide_solid_box(int16_t x, int16_t y, uint8_t w, uint8_t h) {
    if (solid_tile(tile_at(x, y))) return 1u;
    if (solid_tile(tile_at((int16_t)(x + w - 1), y))) return 1u;
    if (solid_tile(tile_at(x, (int16_t)(y + h - 1)))) return 1u;
    if (solid_tile(tile_at((int16_t)(x + w - 1), (int16_t)(y + h - 1)))) return 1u;
    /* mid samples for thin platforms */
    if (solid_tile(tile_at((int16_t)(x + (w >> 1)), y))) return 1u;
    if (solid_tile(tile_at((int16_t)(x + (w >> 1)), (int16_t)(y + h - 1)))) return 1u;
    return 0u;
}

static uint8_t touch_hazard(int16_t x, int16_t y, uint8_t w, uint8_t h) {
    if (hazard_tile(tile_at(x, y))) return 1u;
    if (hazard_tile(tile_at((int16_t)(x + w - 1), y))) return 1u;
    if (hazard_tile(tile_at(x, (int16_t)(y + h - 1)))) return 1u;
    if (hazard_tile(tile_at((int16_t)(x + w - 1), (int16_t)(y + h - 1)))) return 1u;
    return 0u;
}

static uint8_t touch_goal(int16_t x, int16_t y, uint8_t w, uint8_t h) {
    if (goal_tile(tile_at(x, y))) return 1u;
    if (goal_tile(tile_at((int16_t)(x + w - 1), y))) return 1u;
    if (goal_tile(tile_at(x, (int16_t)(y + h - 1)))) return 1u;
    if (goal_tile(tile_at((int16_t)(x + w - 1), (int16_t)(y + h - 1)))) return 1u;
    return 0u;
}

static void draw_room(void) {
    uint16_t i;
    uint8_t buf[20 * 18];

    for (i = 0u; i < (uint16_t)(20u * 18u); ++i) {
        cmap[i] = room_maps[room][i];
        buf[i] = (uint8_t)(0x80u + cmap[i]);
    }
    set_bkg_tiles(0u, 0u, 20u, 18u, buf);
}

static void place_ball_spawn(void) {
    /* After first input, seed shifts ball X so runs differ */
    uint8_t ox = 0u;
    uint8_t tx = room_ball_tx[room];
    uint8_t ty = room_ball_ty[room];

    if (seeded) {
        ox = (uint8_t)(rand() & 3u);
        if ((uint8_t)(tx + ox) < 18u) {
            tx = (uint8_t)(tx + ox);
        }
    }
    bx = (int16_t)(tx * 8 + 8);
    by = (int16_t)(ty * 8 + 16);
    bvx = 0;
    bvy = 0;
    ball_alive = 1u;
    ball_held = 0u;
    holding_ball = 0u;
}

static void spawn_player(void) {
    px = (int16_t)(room_spawn_tx[room] * 8 + 8);
    py = (int16_t)(room_spawn_ty[room] * 8 + 16);
    pvx = 0;
    pvy = 0;
    facing = 1;
    on_ground = 0u;
    on_wall = 0u;
    jump_held = 0u;
    down_held = 0u;
}

static void load_room(void) {
    draw_room();
    spawn_player();
    place_ball_spawn();
    move_sprite(SPR_PLAYER, (uint8_t)px, (uint8_t)py);
    move_sprite(SPR_BALL, (uint8_t)bx, (uint8_t)by);
}

static void ensure_seed(void) {
    uint16_t s;
    if (seeded) {
        return;
    }
    seeded = 1u;
    s = (uint16_t)DIV_REG;
    s |= (uint16_t)(DIV_REG << 8);
    if (s == 0u) {
        s = 1u;
    }
    initrand(s);
    rng_pool = (uint8_t)rand();
    /* Re-roll ball offset now that RNG is live */
    place_ball_spawn();
}

static void try_move_player(int8_t dx, int8_t dy) {
    int16_t nx = px;
    int16_t ny = py;

    if (dx != 0) {
        nx = (int16_t)(px + dx);
        if (!collide_solid_box(nx, py, PW - 2, PH - 1)) {
            px = nx;
        } else {
            /* snap against wall */
            if (dx > 0) {
                while (!collide_solid_box((int16_t)(px + 1), py, PW - 2, PH - 1)) {
                    px++;
                }
                on_wall = 2u;
            } else {
                while (!collide_solid_box((int16_t)(px - 1), py, PW - 2, PH - 1)) {
                    px--;
                }
                on_wall = 1u;
            }
            pvx = 0;
        }
    }
    if (dy != 0) {
        ny = (int16_t)(py + dy);
        if (!collide_solid_box(px, ny, PW - 2, PH - 1)) {
            py = ny;
            if (dy > 0) {
                on_ground = 0u;
            }
        } else {
            if (dy > 0) {
                while (!collide_solid_box(px, (int16_t)(py + 1), PW - 2, PH - 1)) {
                    py++;
                }
                on_ground = 1u;
                pvy = 0;
            } else {
                while (!collide_solid_box(px, (int16_t)(py - 1), PW - 2, PH - 1)) {
                    py--;
                }
                pvy = 0;
            }
        }
    }
}

static void update_ground_wall(void) {
    on_ground = collide_solid_box(px, (int16_t)(py + 1), PW - 2, PH - 1) ? 1u : 0u;
    on_wall = 0u;
    if (!on_ground) {
        if (collide_solid_box((int16_t)(px - 1), py, PW - 2, PH - 1)) {
            on_wall = 1u;
        } else if (collide_solid_box((int16_t)(px + 1), py, PW - 2, PH - 1)) {
            on_wall = 2u;
        }
    }
}

static void kill_player(void) {
    sfx_boom();
    if (lives > 0u) {
        --lives;
    }
    if (lives == 0u) {
        lost = 1u;
        return;
    }
    /* Instant restart of current room */
    spawn_player();
    place_ball_spawn();
}

static void try_move_ball(void) {
    int16_t nx, ny;
    uint8_t i;

    if (!ball_alive || ball_held) {
        return;
    }

    /* horizontal */
    if (bvx != 0) {
        nx = (int16_t)(bx + bvx);
        if (!collide_solid_box(nx, by, BW, BH)) {
            bx = nx;
        } else {
            /* bounce damp */
            bvx = (int8_t)(-bvx / 2);
            if (bvx == 0) {
                /* settle */
            }
        }
    }
    /* gravity */
    bvy = (int8_t)(bvy + BALL_GRAV);
    if (bvy > BALL_MAX_FALL) {
        bvy = BALL_MAX_FALL;
    }
    if (bvy != 0) {
        ny = (int16_t)(by + bvy);
        if (!collide_solid_box(bx, ny, BW, BH)) {
            by = ny;
        } else {
            if (bvy > 0) {
                for (i = 0u; i < 8u; ++i) {
                    if (!collide_solid_box(bx, (int16_t)(by + 1), BW, BH)) {
                        by++;
                    } else {
                        break;
                    }
                }
            }
            bvy = (int8_t)(-bvy / 2);
            if (bvy > -1 && bvy < 2) {
                bvy = 0;
                bvx = (int8_t)(bvx / 2);
            }
        }
    }

    /* Ball falls out of room */
    if (by > 160) {
        place_ball_spawn();
    }
    /* Ball can clear spikes by covering? unused — ball hits goal posts no-op */
}

static bool overlaps_ball(void) {
    int16_t dx, dy;
    if (!ball_alive || ball_held) {
        return false;
    }
    dx = px - bx;
    dy = py - by;
    if (dx < 0) dx = (int16_t)-dx;
    if (dy < 0) dy = (int16_t)-dy;
    return (dx < 10 && dy < 10);
}

static void pick_up_ball(void) {
    ball_held = 1u;
    holding_ball = 1u;
    ball_alive = 1u;
    bvx = 0;
    bvy = 0;
    sfx_beep();
}

static void throw_ball(void) {
    ball_held = 0u;
    holding_ball = 0u;
    ball_alive = 1u;
    bx = (int16_t)(px + (facing > 0 ? 8 : -6));
    by = py;
    bvx = (int8_t)(facing * THROW_SPEED);
    bvy = -2;
    sfx_throw();
}

static void update_player(uint8_t keys) {
    int8_t dx = 0;

    if ((keys & J_LEFT) != 0u) {
        dx = (int8_t)-MOVE_SPEED;
        facing = -1;
    } else if ((keys & J_RIGHT) != 0u) {
        dx = MOVE_SPEED;
        facing = 1;
    }

    /* horizontal */
    if (dx != 0) {
        try_move_player(dx, 0);
    }

    update_ground_wall();

    /* jump / wall-jump on A edge */
    if ((keys & J_A) != 0u) {
        if (!jump_held) {
            jump_held = 1u;
            if (on_ground) {
                pvy = JUMP_V;
                on_ground = 0u;
                sfx_jump();
            } else if (on_wall == 1u) {
                pvy = WALL_JUMP_V;
                pvx = WALL_JUMP_X;
                facing = 1;
                sfx_jump();
            } else if (on_wall == 2u) {
                pvy = WALL_JUMP_V;
                pvx = (int8_t)-WALL_JUMP_X;
                facing = -1;
                sfx_jump();
            }
        }
    } else {
        jump_held = 0u;
        /* variable jump cut */
        if (pvy < -2) {
            pvy = (int8_t)(pvy + 1);
        }
    }

    /* wall slide */
    if (!on_ground && on_wall != 0u && pvy > 1) {
        pvy = 1;
    }

    /* apply stored wall-jump x momentum briefly */
    if (pvx != 0) {
        try_move_player(pvx, 0);
        if (pvx > 0) {
            pvx--;
        } else if (pvx < 0) {
            pvx++;
        }
    }

    /* gravity */
    if (!on_ground) {
        pvy = (int8_t)(pvy + GRAVITY);
        if (pvy > MAX_FALL) {
            pvy = MAX_FALL;
        }
    } else if (pvy > 0) {
        pvy = 0;
    }

    if (pvy != 0) {
        try_move_player(0, pvy);
    }

    update_ground_wall();

    /* pick up / throw with Down edge */
    if ((keys & J_DOWN) != 0u) {
        if (!down_held) {
            down_held = 1u;
            if (holding_ball) {
                throw_ball();
            } else if (overlaps_ball()) {
                pick_up_ball();
            }
        }
    } else {
        down_held = 0u;
    }

    if (holding_ball) {
        bx = (int16_t)(px + (facing > 0 ? 6 : -4));
        by = (int16_t)(py - 2);
    }

    /* hazards / fall death */
    if (touch_hazard(px, py, PW - 2, PH - 1) || py > 160) {
        kill_player();
        return;
    }

    /* goal in final room */
    if (room == (NUM_ROOMS - 1u) && touch_goal(px, py, PW - 2, PH - 1)) {
        won = 1u;
        return;
    }

    /* room exit via right edge (rooms 0 and 1) */
    if (room < (NUM_ROOMS - 1u) && px >= 152) {
        room++;
        sfx_beep();
        load_room();
        return;
    }
    /* left edge soft clamp */
    if (px < 8) {
        px = 8;
    }
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

    /* Still load stock tiles so assets.o links; our tiles overwrite VRAM */
    set_bkg_data(0x80u, BREAKOUT_TILE_COUNT, breakout_tile_data);
    set_bkg_data(0x80u, T_COUNT, tile_data);

    if (_cpu == CGB_TYPE) {
        set_bkg_palette(0, 1, red_bgp);
        set_sprite_palette(0, 1, spr_obp);
    }

    set_sprite_tile(SPR_PLAYER, (uint8_t)(0x80u + T_PLAYER));
    set_sprite_tile(SPR_BALL, (uint8_t)(0x80u + T_BALL));
    set_sprite_prop(SPR_PLAYER, 0u);
    set_sprite_prop(SPR_BALL, 0u);

    SPRITES_8x8;
    SHOW_BKG;
    SHOW_SPRITES;
    DISPLAY_ON;
}

static void initialize_game(void) {
    room = 0u;
    lives = MAX_LIVES;
    won = 0u;
    lost = 0u;
    seeded = 0u;
    rng_pool = 0u;
    load_room();
}

void main(void) {
    uint8_t keys;

    wait_vbl_done();

    initialize_video();
    sound_init();
    initialize_game();
    NOVA_STATE = 1;

    while (!won && !lost) {
        keys = joypad();

        if (!seeded && keys != 0u) {
            ensure_seed();
        }

        update_player(keys);
        if (won || lost) {
            break;
        }
        try_move_ball();

        move_sprite(SPR_PLAYER, (uint8_t)px, (uint8_t)py);
        if (ball_alive) {
            move_sprite(SPR_BALL, (uint8_t)bx, (uint8_t)by);
        } else {
            move_sprite(SPR_BALL, 0u, 0u);
        }

        wait_vbl_done();
    }

    if (won) {
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
