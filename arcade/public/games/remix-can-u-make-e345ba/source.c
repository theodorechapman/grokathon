// TITLE: Postie
// DESC: Three-room wall-jump platformer with throwable balls; green backdrop remix.
// CONTROLS: D-pad move/climb, A jump/wall-jump, Down throw ball
#include <gb/gb.h>
#include <gb/cgb.h>
#include <stdbool.h>
#include <stdint.h>
#include <rand.h>

#include "assets.h"

/* Nova arcade protocol: arcade polls this WRAM byte for run timing/end screen. */
#define NOVA_STATE (*(volatile uint8_t *)0xCF00)

enum {
    /* Custom tile IDs in signed region $8800 (LCDC bit4 clear) */
    T_EMPTY = 0x80u,
    T_SOLID = 0x81u,
    T_SPIKE = 0x82u,
    T_PLAT = 0x83u,
    T_DOOR = 0x84u,
    T_BALL = 0x85u,
    T_POST = 0x86u, /* mailbox / goal post */
    T_GRASS = 0x87u,
    T_BRICK = 0x88u,
    T_LEAF = 0x89u,

    SPR_PLAYER = 0u,
    SPR_BALL = 1u,
    SPR_ENEMY0 = 2u,
    SPR_ENEMY1 = 3u,

    /* Pixel sizes (OAM coords: visible = x-8, y-16) */
    PW = 8,
    PH = 8,
    ROOM_W = 20,
    ROOM_H = 18,

    /* World bounds in OAM coordinates */
    WORLD_LEFT = 8,
    WORLD_RIGHT = 160,  /* exclusive max for left edge + width checks */
    WORLD_TOP = 16,
    WORLD_BOTTOM = 144 + 16,

    MAX_ENEMIES = 2,
    MAX_PICKUPS = 2
};

/* Green CGB background + object palettes */
static const UWORD bkg_palettes[] = {
    RGB(0, 24, 8),   /* light green empty */
    RGB(0, 18, 4),   /* mid */
    RGB(0, 10, 2),   /* dark */
    RGB(0, 4, 0)     /* deepest */
};

static const UWORD obj_palettes[] = {
    RGB(31, 31, 31),
    RGB(0, 20, 6),
    RGB(31, 20, 0),
    RGB(0, 0, 0),
    /* palette 1: ball */
    RGB(31, 31, 31),
    RGB(31, 28, 10),
    RGB(20, 12, 0),
    RGB(0, 0, 0),
    /* palette 2: enemy */
    RGB(31, 31, 31),
    RGB(31, 8, 8),
    RGB(16, 0, 0),
    RGB(0, 0, 0)
};

/*
 * 2bpp tiles (16 bytes each). Designed for green BGP/CGB look.
 * Bit pairs: 00 empty light, 01 mid, 10 dark, 11 blackish.
 */
static const uint8_t gfx_empty[16] = {
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
};
static const uint8_t gfx_solid[16] = {
    0xFF, 0xFF, 0x81, 0x7E, 0x81, 0x7E, 0x81, 0x7E,
    0x81, 0x7E, 0x81, 0x7E, 0x81, 0x7E, 0xFF, 0xFF
};
static const uint8_t gfx_spike[16] = {
    0x18, 0x18, 0x3C, 0x3C, 0x7E, 0x7E, 0xFF, 0xFF,
    0x18, 0x18, 0x3C, 0x3C, 0x7E, 0x7E, 0xFF, 0xFF
};
static const uint8_t gfx_plat[16] = {
    0xFF, 0xFF, 0xFF, 0x00, 0xFF, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
};
static const uint8_t gfx_door[16] = {
    0x7E, 0x7E, 0x42, 0x42, 0x42, 0x5A, 0x42, 0x5A,
    0x42, 0x42, 0x42, 0x42, 0x42, 0x42, 0x7E, 0x7E
};
static const uint8_t gfx_ball[16] = {
    0x3C, 0x3C, 0x7E, 0x42, 0xFF, 0x81, 0xFF, 0x81,
    0xFF, 0x81, 0xFF, 0x81, 0x7E, 0x42, 0x3C, 0x3C
};
static const uint8_t gfx_post[16] = {
    0x18, 0x18, 0x18, 0x18, 0x3C, 0x3C, 0x7E, 0x7E,
    0x18, 0x18, 0x18, 0x18, 0x18, 0x18, 0x3C, 0x3C
};
static const uint8_t gfx_grass[16] = {
    0x00, 0x00, 0x22, 0x00, 0x77, 0x22, 0xFF, 0x55,
    0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF
};
static const uint8_t gfx_brick[16] = {
    0xFF, 0xFF, 0x01, 0xFE, 0x01, 0xFE, 0xFF, 0xFF,
    0x10, 0xEF, 0x10, 0xEF, 0xFF, 0xFF, 0x01, 0xFE
};
static const uint8_t gfx_leaf[16] = {
    0x00, 0x00, 0x08, 0x08, 0x1C, 0x14, 0x3E, 0x2A,
    0x08, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
};
static const uint8_t gfx_player[16] = {
    0x3C, 0x3C, 0x7E, 0x5A, 0x7E, 0x7E, 0x3C, 0x3C,
    0x18, 0x18, 0x3C, 0x24, 0x24, 0x24, 0x66, 0x66
};
static const uint8_t gfx_enemy[16] = {
    0x3C, 0x3C, 0x7E, 0x66, 0xFF, 0xA5, 0xFF, 0x81,
    0x7E, 0x7E, 0x3C, 0x3C, 0x24, 0x24, 0x66, 0x66
};

/* Map legend: . empty  # solid  = plat  ^ spike  D door  B ball  P player
 *             E enemy  M mailbox  G grass  R brick  L leaf   (20x18 each) */
static const char *const room_maps[3] = {
    /* Room 0: platforms + wall-jump shelf to door */
    "RRRRRRRRRRRRRRRRRRRR"
    "R....L.........L...R"
    "R..................R"
    "R........####......R"
    "R..................R"
    "R....B.............R"
    "R...====...........R"
    "R..................R"
    "R...........###....R"
    "R..................R"
    "R........====......R"
    "R.................DR"
    "R....###...........R"
    "R..................R"
    "R.P.......E........R"
    "RGGGGG..GGGGGG..GGGR"
    "RRRRRR^^RRRRRR^^RRRR"
    "RRRRRRRRRRRRRRRRRRRR",

    /* Room 1: shaft climb; stun patrol with ball, exit door */
    "RRRRRRRRRRRRRRRRRRRR"
    "R..................R"
    "R.###############..R"
    "R.#.............#..R"
    "R.#..B..........#..R"
    "R.#.....###.....#..R"
    "R.#.............#..R"
    "R.#.........E...#..R"
    "R.#.....###.....#..R"
    "R.#...............DR"
    "R.#..P..........#..R"
    "R.###############..R"
    "R..................R"
    "R....L......L......R"
    "R..................R"
    "RGGGGGGGGGGGGGGGGGGR"
    "RRRRRRRRRRRRRRRRRRRR"
    "RRRRRRRRRRRRRRRRRRRR",

    /* Room 2: climb to mailbox goal */
    "RRRRRRRRRRRRRRRRRRRR"
    "R........M.........R"
    "R.......===........R"
    "R..................R"
    "R....##.....##.....R"
    "R..................R"
    "R.B.....=====......R"
    "R..................R"
    "R...###.....###....R"
    "R..............E...R"
    "R......=====.......R"
    "R..................R"
    "R.###.........###..R"
    "R..................R"
    "R.P.....E..........R"
    "RGGG..GGGGGGGGG..GGR"
    "RRRR^^RRRRRRRRR^^RRR"
    "RRRRRRRRRRRRRRRRRRRR"
};

static uint8_t room;
static uint8_t lives;
static uint8_t map[ROOM_W * ROOM_H];

static int16_t px, py;       /* player top-left in OAM pixels */
static int8_t pvx, pvy;
static int8_t facing;        /* 1 right, -1 left */
static bool on_ground;
static bool on_wall;
static int8_t wall_dir;      /* -1 wall left, +1 wall right */
static bool holding_ball;
static bool seeded;
static bool a_held;
static uint8_t coyote;
static uint8_t jump_buf;

/* Throwable / pickup ball */
static bool ball_alive;
static bool ball_held;
static int16_t bx, by;
static int8_t bvx, bvy;
static uint8_t ball_tile_x, ball_tile_y; /* original pickup cell */

/* Enemies */
static uint8_t enemy_count;
static int16_t ex[MAX_ENEMIES], ey[MAX_ENEMIES];
static int8_t evx[MAX_ENEMIES];
static uint8_t estun[MAX_ENEMIES];
static bool ealive[MAX_ENEMIES];

static uint8_t door_x, door_y;
static uint8_t goal_x, goal_y;
static bool has_goal;
static uint8_t spawn_x, spawn_y;
static uint8_t frame;

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
    uint8_t i, f;
    for (i = 0u; i < 4u; ++i) {
        NR21_REG = 0x80u;
        NR22_REG = 0xF2u;
        NR23_REG = (uint8_t)notes[i];
        NR24_REG = (uint8_t)(0x80u | (notes[i] >> 8));
        for (f = 0u; f < 8u; ++f) {
            wait_vbl_done();
        }
    }
}

static void sfx_jump(void) {
    NR10_REG = 0x15u;
    NR11_REG = 0x40u;
    NR12_REG = 0xF2u;
    NR13_REG = 0xC0u;
    NR14_REG = 0x85u;
}

static void sfx_throw(void) {
    NR10_REG = 0x00u;
    NR11_REG = 0x80u;
    NR12_REG = 0xD1u;
    NR13_REG = 0x20u;
    NR14_REG = 0x86u;
}

static uint8_t char_to_tile(char c) {
    switch (c) {
    case '#': return T_SOLID;
    case 'R': return T_BRICK;
    case '=': return T_PLAT;
    case '^': return T_SPIKE;
    case 'D': return T_DOOR;
    case 'M': return T_POST;
    case 'G': return T_GRASS;
    case 'L': return T_LEAF;
    case 'B': return T_EMPTY; /* ball is sprite/pickup */
    case 'P': return T_EMPTY;
    case 'E': return T_EMPTY;
    default:  return T_EMPTY;
    }
}

static bool is_solid(uint8_t t) {
    /* Door/post are walk-through exits, not blockers */
    return t == T_SOLID || t == T_BRICK || t == T_GRASS;
}

static bool is_platform(uint8_t t) {
    return t == T_PLAT;
}

static bool is_hazard(uint8_t t) {
    return t == T_SPIKE;
}

static uint8_t tile_at_px(int16_t x, int16_t y) {
    int16_t tx, ty;
    /* Convert OAM pixel to BG tile */
    tx = (x - 8) >> 3;
    ty = (y - 16) >> 3;
    if (tx < 0 || ty < 0 || tx >= ROOM_W || ty >= ROOM_H) {
        return T_SOLID;
    }
    return map[(uint8_t)ty * ROOM_W + (uint8_t)tx];
}

static void load_tiles(void) {
    set_bkg_data(T_EMPTY, 1u, gfx_empty);
    set_bkg_data(T_SOLID, 1u, gfx_solid);
    set_bkg_data(T_SPIKE, 1u, gfx_spike);
    set_bkg_data(T_PLAT, 1u, gfx_plat);
    set_bkg_data(T_DOOR, 1u, gfx_door);
    set_bkg_data(T_BALL, 1u, gfx_ball);
    set_bkg_data(T_POST, 1u, gfx_post);
    set_bkg_data(T_GRASS, 1u, gfx_grass);
    set_bkg_data(T_BRICK, 1u, gfx_brick);
    set_bkg_data(T_LEAF, 1u, gfx_leaf);
    set_sprite_data(0u, 1u, gfx_player);
    set_sprite_data(1u, 1u, gfx_ball);
    set_sprite_data(2u, 1u, gfx_enemy);
}

static void parse_room(uint8_t r) {
    const char *src;
    uint16_t i;
    uint8_t x, y;
    char c;

    src = room_maps[r];
    enemy_count = 0u;
    ball_alive = false;
    ball_held = false;
    holding_ball = false;
    has_goal = false;
    door_x = 18u;
    door_y = 11u;
    spawn_x = 2u;
    spawn_y = 14u;

    for (i = 0u; i < (uint16_t)(ROOM_W * ROOM_H); ++i) {
        c = src[i];
        x = (uint8_t)(i % ROOM_W);
        y = (uint8_t)(i / ROOM_W);
        map[i] = char_to_tile(c);

        if (c == 'P') {
            spawn_x = x;
            spawn_y = y;
        } else if (c == 'D') {
            door_x = x;
            door_y = y;
            map[i] = T_DOOR;
        } else if (c == 'M') {
            goal_x = x;
            goal_y = y;
            has_goal = true;
            map[i] = T_POST;
        } else if (c == 'B') {
            ball_alive = true;
            ball_held = false;
            ball_tile_x = x;
            ball_tile_y = y;
            bx = (int16_t)(x * 8 + 8);
            by = (int16_t)(y * 8 + 16);
            bvx = 0;
            bvy = 0;
        } else if (c == 'E' && enemy_count < MAX_ENEMIES) {
            ex[enemy_count] = (int16_t)(x * 8 + 8);
            ey[enemy_count] = (int16_t)(y * 8 + 16);
            /* Non-deterministic patrol direction after seed; default before seed */
            evx[enemy_count] = (enemy_count & 1u) ? (int8_t)1 : (int8_t)-1;
            estun[enemy_count] = 0u;
            ealive[enemy_count] = true;
            ++enemy_count;
        }
    }

    set_bkg_tiles(0u, 0u, ROOM_W, ROOM_H, map);
}

static void respawn_player(void) {
    px = (int16_t)(spawn_x * 8 + 8);
    py = (int16_t)(spawn_y * 8 + 16);
    pvx = 0;
    pvy = 0;
    facing = 1;
    on_ground = false;
    on_wall = false;
    wall_dir = 0;
    coyote = 0u;
    jump_buf = 0u;
    a_held = false;
    holding_ball = false;
    ball_held = false;
    /* Restore ball pickup if room had one */
    {
        const char *src = room_maps[room];
        uint16_t i;
        ball_alive = false;
        for (i = 0u; i < (uint16_t)(ROOM_W * ROOM_H); ++i) {
            if (src[i] == 'B') {
                ball_alive = true;
                ball_held = false;
                ball_tile_x = (uint8_t)(i % ROOM_W);
                ball_tile_y = (uint8_t)(i / ROOM_W);
                bx = (int16_t)(ball_tile_x * 8 + 8);
                by = (int16_t)(ball_tile_y * 8 + 16);
                bvx = 0;
                bvy = 0;
                break;
            }
        }
    }
    /* Reset enemies */
    {
        const char *src = room_maps[room];
        uint16_t i;
        uint8_t e;
        e = 0u;
        for (i = 0u; i < (uint16_t)(ROOM_W * ROOM_H); ++i) {
            if (src[i] == 'E' && e < MAX_ENEMIES) {
                ex[e] = (int16_t)((i % ROOM_W) * 8 + 8);
                ey[e] = (int16_t)((i / ROOM_W) * 8 + 16);
                if (seeded) {
                    evx[e] = ((int8_t)(rand() & 1)) ? (int8_t)1 : (int8_t)-1;
                } else {
                    evx[e] = (e & 1u) ? (int8_t)1 : (int8_t)-1;
                }
                estun[e] = 0u;
                ealive[e] = true;
                ++e;
            }
        }
        enemy_count = e;
    }
}

static void initialize_video(void) {
    DISPLAY_OFF;

    SCX_REG = 0u;
    SCY_REG = 0u;
    WY_REG = 0u;
    WX_REG = 7u;
    STAT_REG = 0u;

    /* DMG: pale green-leaning palette (light background) */
    BGP_REG = 0xE4u;
    OBP0_REG = 0xE4u;
    OBP1_REG = 0xD2u;
    NR52_REG = 0u;

    LCDC_REG = 0x40u;

    if (_cpu == CGB_TYPE) {
        set_bkg_palette(0u, 1u, bkg_palettes);
        set_sprite_palette(0u, 3u, obj_palettes);
    }

    load_tiles();

    set_sprite_tile(SPR_PLAYER, 0u);
    set_sprite_tile(SPR_BALL, 1u);
    set_sprite_tile(SPR_ENEMY0, 2u);
    set_sprite_tile(SPR_ENEMY1, 2u);
    set_sprite_prop(SPR_PLAYER, 0u);
    set_sprite_prop(SPR_BALL, 1u);
    set_sprite_prop(SPR_ENEMY0, 2u);
    set_sprite_prop(SPR_ENEMY1, 2u);

    SPRITES_8x8;
    SHOW_BKG;
    SHOW_SPRITES;
    DISPLAY_ON;
}

static bool solid_at(int16_t x, int16_t y) {
    uint8_t t = tile_at_px(x, y);
    return is_solid(t);
}

static bool floor_at(int16_t x, int16_t y) {
    uint8_t t = tile_at_px(x, y);
    return is_solid(t) || is_platform(t);
}

static bool blocks_at(int16_t x, int16_t y, int8_t vy_sense) {
    uint8_t t = tile_at_px(x, y);
    if (is_solid(t)) {
        return true;
    }
    /* One-way platforms only when falling onto top */
    if (vy_sense > 0 && is_platform(t)) {
        int16_t ty = (y - 16) >> 3;
        int16_t top = (int16_t)(ty * 8 + 16);
        if (y >= top && y < top + 4) {
            return true;
        }
    }
    return false;
}

static bool player_rect_blocked(int16_t nx, int16_t ny, int8_t vy_sense) {
    /* Sample corners and mid edges */
    int16_t x0 = nx;
    int16_t x1 = (int16_t)(nx + PW - 1);
    int16_t y0 = ny;
    int16_t y1 = (int16_t)(ny + PH - 1);
    if (blocks_at(x0, y0, vy_sense) || blocks_at(x1, y0, vy_sense) ||
        blocks_at(x0, y1, vy_sense) || blocks_at(x1, y1, vy_sense) ||
        blocks_at((int16_t)((x0 + x1) >> 1), y1, vy_sense)) {
        return true;
    }
    return false;
}

static bool hazard_at_player(void) {
    int16_t x0 = px;
    int16_t x1 = (int16_t)(px + PW - 1);
    int16_t y0 = py;
    int16_t y1 = (int16_t)(py + PH - 1);
    if (is_hazard(tile_at_px(x0, y1)) || is_hazard(tile_at_px(x1, y1)) ||
        is_hazard(tile_at_px(x0, y0)) || is_hazard(tile_at_px(x1, y0))) {
        return true;
    }
    return false;
}

static bool aabb(int16_t ax, int16_t ay, int16_t aw, int16_t ah,
                 int16_t bx_, int16_t by_, int16_t bw, int16_t bh) {
    return ax < bx_ + bw && ax + aw > bx_ && ay < by_ + bh && ay + ah > by_;
}

static void try_seed(void) {
    if (!seeded) {
        initrand(DIV_REG);
        seeded = true;
        /* Vary enemy directions once seed is live */
        {
            uint8_t e;
            for (e = 0u; e < enemy_count; ++e) {
                evx[e] = ((int8_t)(rand() & 1)) ? (int8_t)1 : (int8_t)-1;
            }
        }
        /* Slight spawn jitter on ball if present and free */
        if (ball_alive && !ball_held && bvx == 0 && bvy == 0) {
            bx = (int16_t)(bx + (int8_t)((rand() % 5) - 2));
        }
    }
}

static void throw_ball(void) {
    if (!holding_ball) {
        return;
    }
    holding_ball = false;
    ball_held = false;
    ball_alive = true;
    bx = (int16_t)(px + (facing > 0 ? 8 : -4));
    by = (int16_t)(py - 2);
    bvx = (int8_t)(facing * (int8_t)(3 + (seeded ? (rand() & 1) : 0)));
    bvy = -2;
    sfx_throw();
}

static void update_ball(void) {
    uint8_t e;
    if (holding_ball) {
        bx = (int16_t)(px + (facing > 0 ? 6 : -2));
        by = (int16_t)(py - 4);
        move_sprite(SPR_BALL, (uint8_t)bx, (uint8_t)by);
        return;
    }
    if (!ball_alive) {
        hide_sprite(SPR_BALL);
        return;
    }

    /* Pickup when still */
    if (bvx == 0 && bvy == 0) {
        if (aabb(px, py, PW, PH, bx, by, 8, 8)) {
            holding_ball = true;
            ball_held = true;
            sfx_beep();
        }
        move_sprite(SPR_BALL, (uint8_t)bx, (uint8_t)by);
        return;
    }

    /* Fly with gravity */
    bvy += 1;
    if (bvy > 4) {
        bvy = 4;
    }

    bx = (int16_t)(bx + bvx);
    if (solid_at(bx, (int16_t)(by + 4)) || solid_at((int16_t)(bx + 7), (int16_t)(by + 4))) {
        bvx = (int8_t)-bvx;
        bx = (int16_t)(bx + bvx);
    }
    by = (int16_t)(by + bvy);
    if (bvy > 0 && (solid_at((int16_t)(bx + 2), (int16_t)(by + 7)) ||
                    solid_at((int16_t)(bx + 5), (int16_t)(by + 7)))) {
        /* Rest on ground */
        bvx = 0;
        bvy = 0;
        /* Snap up out of floor */
        while (solid_at((int16_t)(bx + 2), (int16_t)(by + 7)) ||
               solid_at((int16_t)(bx + 5), (int16_t)(by + 7))) {
            --by;
        }
    }
    if (by > WORLD_BOTTOM || bx < 0 || bx > 168) {
        /* Respawn ball at original tile */
        bx = (int16_t)(ball_tile_x * 8 + 8);
        by = (int16_t)(ball_tile_y * 8 + 16);
        bvx = 0;
        bvy = 0;
    }

    /* Stun enemies on hit */
    for (e = 0u; e < enemy_count; ++e) {
        if (ealive[e] && estun[e] == 0u &&
            aabb(bx, by, 8, 8, ex[e], ey[e], 8, 8)) {
            estun[e] = 120u;
            bvx = (int8_t)-bvx;
            sfx_beep();
        }
    }

    move_sprite(SPR_BALL, (uint8_t)bx, (uint8_t)by);
}

static void update_enemies(void) {
    uint8_t e;
    int16_t nx;
    for (e = 0u; e < enemy_count; ++e) {
        if (!ealive[e]) {
            hide_sprite((uint8_t)(SPR_ENEMY0 + e));
            continue;
        }
        if (estun[e] > 0u) {
            --estun[e];
            /* Flash by hiding every other frame */
            if ((frame & 2u) != 0u) {
                hide_sprite((uint8_t)(SPR_ENEMY0 + e));
            } else {
                move_sprite((uint8_t)(SPR_ENEMY0 + e), (uint8_t)ex[e], (uint8_t)ey[e]);
            }
            continue;
        }
        nx = (int16_t)(ex[e] + evx[e]);
        /* Turn at walls or ledges (platforms count as floor) */
        if (solid_at(nx, (int16_t)(ey[e] + 4)) ||
            solid_at((int16_t)(nx + 7), (int16_t)(ey[e] + 4)) ||
            !floor_at((int16_t)(nx + 4), (int16_t)(ey[e] + 9))) {
            evx[e] = (int8_t)-evx[e];
            nx = (int16_t)(ex[e] + evx[e]);
        }
        ex[e] = nx;
        move_sprite((uint8_t)(SPR_ENEMY0 + e), (uint8_t)ex[e], (uint8_t)ey[e]);
    }
    /* Hide unused enemy sprites */
    for (; e < MAX_ENEMIES; ++e) {
        hide_sprite((uint8_t)(SPR_ENEMY0 + e));
    }
}

static bool enemy_hit_player(void) {
    uint8_t e;
    for (e = 0u; e < enemy_count; ++e) {
        if (ealive[e] && estun[e] == 0u &&
            aabb(px, py, PW, PH, ex[e], ey[e], 8, 8)) {
            return true;
        }
    }
    return false;
}

static bool at_exit(void) {
    int16_t cx = (int16_t)(px + 4);
    int16_t cy = (int16_t)(py + 4);
    uint8_t t = tile_at_px(cx, cy);
    if (room < 2u) {
        return t == T_DOOR ||
               aabb(px, py, PW, PH,
                    (int16_t)(door_x * 8 + 8), (int16_t)(door_y * 8 + 16), 8, 8);
    }
    /* Final room: touch mailbox */
    return has_goal &&
           aabb(px, py, PW, PH,
                (int16_t)(goal_x * 8 + 8), (int16_t)(goal_y * 8 + 16), 8, 12);
}

static void start_room(uint8_t r) {
    room = r;
    parse_room(r);
    respawn_player();
    move_sprite(SPR_PLAYER, (uint8_t)px, (uint8_t)py);
}

/* Returns 0 playing, 2 win, 3 loss. Death instant-restarts room or spends a life. */
static uint8_t update_player(uint8_t keys) {
    int8_t input_x = 0;
    int16_t nx, ny;
    bool want_jump;
    bool wall_l, wall_r;

    if ((keys & J_LEFT) != 0u) {
        input_x = -1;
        facing = -1;
    } else if ((keys & J_RIGHT) != 0u) {
        input_x = 1;
        facing = 1;
    }

    /* Horizontal velocity */
    if (input_x != 0) {
        pvx = (int8_t)(input_x * 2);
    } else {
        pvx = 0;
    }

    /* Gravity / wall slide */
    wall_l = solid_at((int16_t)(px - 1), (int16_t)(py + 2)) ||
             solid_at((int16_t)(px - 1), (int16_t)(py + 6));
    wall_r = solid_at((int16_t)(px + PW), (int16_t)(py + 2)) ||
             solid_at((int16_t)(px + PW), (int16_t)(py + 6));
    on_wall = !on_ground && ((wall_l && input_x < 0) || (wall_r && input_x > 0));
    if (on_wall) {
        wall_dir = wall_l ? (int8_t)-1 : (int8_t)1;
        if (pvy > 1) {
            pvy = 1; /* slide */
        }
    } else {
        wall_dir = 0;
    }

    if (!on_ground) {
        if (!on_wall) {
            pvy += 1;
            if (pvy > 5) {
                pvy = 5;
            }
        } else if (pvy < 1) {
            pvy += 1;
        }
    } else {
        pvy = 0;
    }

    want_jump = ((keys & J_A) != 0u);
    if (want_jump && !a_held) {
        jump_buf = 6u;
    }
    a_held = want_jump;

    if (jump_buf > 0u) {
        --jump_buf;
        if (on_ground || coyote > 0u) {
            pvy = -6;
            on_ground = false;
            coyote = 0u;
            jump_buf = 0u;
            sfx_jump();
        } else if (on_wall) {
            pvy = -6;
            pvx = (int8_t)(-wall_dir * 3);
            on_wall = false;
            jump_buf = 0u;
            facing = (int8_t)-wall_dir;
            sfx_jump();
        }
    }

    /* Throw with Down */
    if ((keys & J_DOWN) != 0u && holding_ball) {
        throw_ball();
    }

    /* Move X */
    nx = (int16_t)(px + pvx);
    if (pvx != 0) {
        if (!player_rect_blocked(nx, py, pvy)) {
            px = nx;
        } else {
            /* Nudge flush */
            if (pvx > 0) {
                while (!player_rect_blocked((int16_t)(px + 1), py, pvy)) {
                    ++px;
                }
            } else {
                while (!player_rect_blocked((int16_t)(px - 1), py, pvy)) {
                    --px;
                }
            }
            pvx = 0;
        }
    }

    /* Move Y */
    ny = (int16_t)(py + pvy);
    on_ground = false;
    if (pvy >= 0) {
        if (!player_rect_blocked(px, ny, 1)) {
            py = ny;
        } else {
            while (!player_rect_blocked(px, (int16_t)(py + 1), 1)) {
                ++py;
            }
            on_ground = true;
            pvy = 0;
            coyote = 6u;
        }
    } else {
        if (!player_rect_blocked(px, ny, -1)) {
            py = ny;
        } else {
            while (!player_rect_blocked(px, (int16_t)(py - 1), -1)) {
                --py;
            }
            pvy = 0;
        }
    }

    if (on_ground) {
        coyote = 6u;
    } else if (coyote > 0u) {
        --coyote;
    }

    /* Death: spikes, enemies, or fall — instant room restart; out of lives = loss */
    if (py > (int16_t)WORLD_BOTTOM || hazard_at_player() || enemy_hit_player()) {
        sfx_boom();
        if (lives == 0u) {
            return 3u;
        }
        --lives;
        respawn_player();
        move_sprite(SPR_PLAYER, (uint8_t)px, (uint8_t)py);
        return 0u;
    }

    if (at_exit()) {
        if (room >= 2u) {
            return 2u;
        }
        sfx_beep();
        start_room((uint8_t)(room + 1u));
    }

    move_sprite(SPR_PLAYER, (uint8_t)px, (uint8_t)py);
    return 0u;
}

void main(void) {
    uint8_t keys;
    uint8_t st;

    wait_vbl_done();

    seeded = false;
    frame = 0u;
    room = 0u;
    lives = 3u;

    initialize_video();
    sound_init();
    start_room(0u);
    NOVA_STATE = 1; /* play begins */

    st = 0u;
    while (st == 0u) {
        keys = joypad();
        if (keys != 0u) {
            try_seed();
        }

        st = update_player(keys);
        if (st == 0u) {
            update_ball();
            update_enemies();
        }

        ++frame;
        wait_vbl_done();
    }

    if (st == 2u) {
        NOVA_STATE = 2; /* win */
        sfx_jingle();
    } else {
        NOVA_STATE = 3; /* loss */
        sfx_boom();
    }
    while (true) {
        wait_vbl_done();
    }
}
