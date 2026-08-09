// TITLE: Fireboy Watergirl
// DESC: Guide both heroes to their doors; fire hates water, water hates fire.
// CONTROLS: D-pad move, A jump, B switch hero

#include <gb/gb.h>
#include <stdbool.h>
#include <stdint.h>
#include <rand.h>

#include "assets.h"

/*
 * Nova arcade protocol: one byte at a fixed WRAM address the arcade polls to
 * detect run state. The linker can't move it because it's an absolute pointer,
 * not a variable. 1 = run started, 2 = won, 3 = lost. Every game the pipeline
 * ships MUST keep these three writes intact.
 */
#define NOVA_STATE (*(volatile uint8_t *)0xCF00)

enum {
    TILE_EMPTY = 0x80u,
    TILE_WALL = 0x81u,
    TILE_WATER = 0x82u,
    TILE_FIRE = 0x83u,
    TILE_SLIME = 0x84u,
    TILE_FDOOR = 0x85u,
    TILE_WDOOR = 0x86u,
    TILE_PLAT = 0x87u,
    TILE_FIREBOY = 0x88u,
    TILE_WATERGIRL = 0x89u,

    SPR_FIRE = 0u,
    SPR_WATER = 1u,

    MAP_W = 20u,
    MAP_H = 18u,

    GRAVITY = 1,
    MAX_FALL = 3,
    JUMP_V = -5,
    MOVE_SPEED = 1,

    TYPE_FIRE = 0u,
    TYPE_WATER = 1u
};

enum {
    C_EMPTY = 0u,
    C_WALL = 1u,
    C_WATER = 2u,
    C_FIRE = 3u,
    C_SLIME = 4u,
    C_FDOOR = 5u,
    C_WDOOR = 6u,
    C_PLAT = 7u
};

/*
 * Short dual-hero stage (20x18). Fireboy dies in water, Watergirl in fire,
 * both die in slime. Win: each stands on their own door.
 */
static uint8_t level_map[MAP_W * MAP_H];

static const uint8_t level_template[MAP_W * MAP_H] = {
    /* 0  ceiling */
    1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
    /* 1  start air */
    1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
    /* 2  start platforms under spawns */
    1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,
    /* 3 */
    1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
    /* 4  upper shelves */
    1,0,0,0,1,1,1,0,0,0,0,0,1,1,1,0,0,0,0,1,
    /* 5 */
    1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
    /* 6  water puddle left (jump), fire puddle right (jump) */
    1,0,2,2,0,0,0,0,0,0,0,0,0,0,0,3,3,0,0,1,
    /* 7  ledges beside hazards */
    1,1,1,1,1,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,
    /* 8 */
    1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
    /* 9  mid bridge */
    1,0,0,0,0,1,1,1,1,1,1,1,1,0,0,0,0,0,0,1,
    /* 10  (runtime floating pad may appear here) */
    1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
    /* 11 doors */
    1,0,0,5,0,0,0,0,0,0,0,0,0,0,0,6,0,0,0,1,
    /* 12 door floors + center gap */
    1,1,1,1,1,1,0,0,0,0,0,0,1,1,1,1,1,1,1,1,
    /* 13 slime under gap */
    1,0,0,0,0,0,0,0,4,4,4,0,0,0,0,0,0,0,0,1,
    /* 14 */
    1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
    /* 15 safe lower shelves */
    1,0,0,1,1,1,1,0,0,0,0,1,1,1,1,0,0,0,0,1,
    /* 16 */
    1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
    /* 17 floor */
    1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1
};

/* empty, wall, water, fire, slime, fdoor, wdoor, plat, fireboy, watergirl */
static const uint8_t game_tiles[] = {
    /* 0 empty */
    0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
    /* 1 wall */
    0xFF,0xFF,0x81,0xFF,0x81,0xFF,0xFF,0xFF,0xFF,0xFF,0x81,0xFF,0x81,0xFF,0xFF,0xFF,
    /* 2 water */
    0x00,0x00,0x3C,0x00,0x7E,0x3C,0xFF,0x7E,0xFF,0xFF,0x7E,0xFF,0x3C,0x7E,0x00,0x3C,
    /* 3 fire */
    0x18,0x00,0x3C,0x18,0x7E,0x3C,0xFF,0x5A,0xFF,0x99,0x7E,0x3C,0x3C,0x18,0x18,0x00,
    /* 4 slime */
    0x00,0x00,0x3C,0x3C,0x7E,0x7E,0xFF,0xFF,0xFF,0xFF,0x7E,0x7E,0x3C,0x3C,0x00,0x00,
    /* 5 fire door */
    0xFF,0xFF,0x81,0x81,0xBD,0xBD,0xA5,0xA5,0xA5,0xA5,0x81,0x81,0x81,0x81,0xFF,0xFF,
    /* 6 water door */
    0xFF,0x00,0x81,0x7E,0x99,0x66,0x81,0x7E,0x99,0x66,0x81,0x7E,0x81,0x7E,0xFF,0x00,
    /* 7 thin platform */
    0xFF,0xFF,0xFF,0xFF,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
    /* 8 fireboy */
    0x3C,0x3C,0x7E,0x5A,0x7E,0x7E,0x3C,0x3C,0x18,0x18,0x3C,0x24,0x24,0x24,0x66,0x66,
    /* 9 watergirl */
    0x18,0x18,0x3C,0x3C,0x7E,0x5A,0x7E,0x7E,0x3C,0x3C,0x18,0x18,0x2C,0x2C,0x6E,0x6E
};

static const uint8_t cell_to_tile[] = {
    TILE_EMPTY, TILE_WALL, TILE_WATER, TILE_FIRE,
    TILE_SLIME, TILE_FDOOR, TILE_WDOOR, TILE_PLAT
};

typedef struct {
    uint8_t x;
    uint8_t y;
    int8_t vy;
    uint8_t grounded;
    uint8_t type;
    uint8_t alive;
    uint8_t on_door;
} hero_t;

static hero_t heroes[2];
static uint8_t active;
static uint8_t game_over;
static uint8_t won;
static uint8_t seeded;
static uint8_t rng_pad_col;

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

static uint8_t cell_at(uint8_t tx, uint8_t ty) {
    if (tx >= MAP_W || ty >= MAP_H) {
        return C_WALL;
    }
    return level_map[(uint16_t)ty * MAP_W + tx];
}

static bool is_solid(uint8_t c) {
    return (c == C_WALL) || (c == C_PLAT);
}

static bool solid_at_px(uint8_t px, uint8_t py) {
    return is_solid(cell_at((uint8_t)(px >> 3), (uint8_t)(py >> 3)));
}

/* OAM (x,y) -> screen top-left (x-8, y-16); sample inset corners. */
static bool hero_hits_solid(uint8_t hx, uint8_t hy) {
    uint8_t sx = (uint8_t)(hx - 8u);
    uint8_t sy = (uint8_t)(hy - 16u);
    uint8_t x0 = (uint8_t)(sx + 1u);
    uint8_t x1 = (uint8_t)(sx + 6u);
    uint8_t y0 = (uint8_t)(sy + 1u);
    uint8_t y1 = (uint8_t)(sy + 7u);

    return solid_at_px(x0, y0) || solid_at_px(x1, y0) ||
           solid_at_px(x0, y1) || solid_at_px(x1, y1);
}

static uint8_t hazard_under(hero_t *h) {
    uint8_t sx = (uint8_t)(h->x - 8u);
    uint8_t sy = (uint8_t)(h->y - 16u);
    uint8_t cx = (uint8_t)((sx + 3u) >> 3);
    uint8_t cy = (uint8_t)((sy + 6u) >> 3);
    return cell_at(cx, cy);
}

static void paint_level(void) {
    uint8_t x, y;
    uint8_t row[MAP_W];

    for (y = 0u; y < MAP_H; ++y) {
        for (x = 0u; x < MAP_W; ++x) {
            row[x] = cell_to_tile[level_map[(uint16_t)y * MAP_W + x]];
        }
        set_bkg_tiles(0u, y, MAP_W, 1u, row);
    }
}

static void build_level(void) {
    uint16_t i;
    uint8_t col;

    for (i = 0u; i < (uint16_t)MAP_W * MAP_H; ++i) {
        level_map[i] = level_template[i];
    }

    col = rng_pad_col;
    if (col < 4u) {
        col = 4u;
    }
    if (col > 13u) {
        col = 13u;
    }
    level_map[(uint16_t)10u * MAP_W + col] = C_PLAT;
    level_map[(uint16_t)10u * MAP_W + (uint8_t)(col + 1u)] = C_PLAT;
    level_map[(uint16_t)10u * MAP_W + (uint8_t)(col + 2u)] = C_PLAT;

    paint_level();
}

static void draw_heroes(void) {
    move_sprite(SPR_FIRE, heroes[0].x, heroes[0].y);
    move_sprite(SPR_WATER, heroes[1].x, heroes[1].y);
}

static void init_heroes(void) {
    /* Stand on row-2 start platforms. Screen y = 8 (top of row 1 air above plat). */
    /* Platform top at screen y=16 (row 2). Feet on it: sy=8, OAM y=24. */
    heroes[0].x = 24u;  /* tile col ~2 */
    heroes[0].y = 24u;
    heroes[0].vy = 0;
    heroes[0].grounded = 1u;
    heroes[0].type = TYPE_FIRE;
    heroes[0].alive = 1u;
    heroes[0].on_door = 0u;

    heroes[1].x = 152u; /* tile col ~18 */
    heroes[1].y = 24u;
    heroes[1].vy = 0;
    heroes[1].grounded = 1u;
    heroes[1].type = TYPE_WATER;
    heroes[1].alive = 1u;
    heroes[1].on_door = 0u;

    active = 0u;
    draw_heroes();
}

static void try_seed(uint8_t keys) {
    uint16_t seed;

    if (seeded || keys == 0u) {
        return;
    }
    seed = (uint16_t)DIV_REG;
    seed ^= (uint16_t)((uint16_t)DIV_REG << 8);
    if (seed == 0u) {
        seed = 0xA5u;
    }
    initrand(seed);
    rng_pad_col = (uint8_t)((rand() & 7u) + 5u);
    seeded = 1u;
    build_level();
    sfx_beep();
}

static void move_hero_x(hero_t *h, int8_t dx) {
    uint8_t nx;

    if (dx == 0) {
        return;
    }
    nx = (uint8_t)((int16_t)h->x + dx);
    if (nx < 16u) {
        nx = 16u;
    }
    if (nx > 160u) {
        nx = 160u;
    }
    if (!hero_hits_solid(nx, h->y)) {
        h->x = nx;
    }
}

static void apply_gravity(hero_t *h) {
    int8_t step;
    uint8_t ny;
    int8_t remaining;

    h->vy = (int8_t)(h->vy + GRAVITY);
    if (h->vy > MAX_FALL) {
        h->vy = MAX_FALL;
    }

    remaining = h->vy;
    h->grounded = 0u;

    if (remaining == 0) {
        if (hero_hits_solid(h->x, (uint8_t)(h->y + 1u))) {
            h->grounded = 1u;
            h->vy = 0;
        }
        return;
    }

    while (remaining != 0) {
        step = (remaining > 0) ? (int8_t)1 : (int8_t)-1;
        ny = (uint8_t)((int16_t)h->y + step);
        if (hero_hits_solid(h->x, ny)) {
            if (step > 0) {
                h->grounded = 1u;
            }
            h->vy = 0;
            break;
        }
        h->y = ny;
        remaining = (int8_t)(remaining - step);
    }

    if (h->y > 168u) {
        h->alive = 0u;
    }
}

static void check_hazards(hero_t *h) {
    uint8_t c = hazard_under(h);

    h->on_door = 0u;

    if (c == C_SLIME) {
        h->alive = 0u;
        return;
    }
    if ((c == C_WATER) && (h->type == TYPE_FIRE)) {
        h->alive = 0u;
        return;
    }
    if ((c == C_FIRE) && (h->type == TYPE_WATER)) {
        h->alive = 0u;
        return;
    }
    /* Safe liquids for matching element — stand on door tiles */
    if ((c == C_FDOOR) && (h->type == TYPE_FIRE)) {
        h->on_door = 1u;
    }
    if ((c == C_WDOOR) && (h->type == TYPE_WATER)) {
        h->on_door = 1u;
    }
}

static void update_hero(hero_t *h, uint8_t keys, bool controlled) {
    int8_t dx = 0;

    if (!h->alive) {
        return;
    }

    if (controlled) {
        if (keys & J_LEFT) {
            dx = (int8_t)-MOVE_SPEED;
        } else if (keys & J_RIGHT) {
            dx = (int8_t)MOVE_SPEED;
        }
        if ((keys & J_A) && h->grounded) {
            h->vy = (int8_t)JUMP_V;
            h->grounded = 0u;
            sfx_beep();
        }
    }

    move_hero_x(h, dx);
    apply_gravity(h);
    check_hazards(h);
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
    OBP1_REG = 0xD0u;
    NR52_REG = 0u;

    LCDC_REG = 0x40u;

    set_bkg_data(0x80u, 10u, game_tiles);

    {
        uint8_t blank[MAP_W];
        uint8_t i;
        uint8_t y;
        for (i = 0u; i < MAP_W; ++i) {
            blank[i] = TILE_EMPTY;
        }
        for (y = 0u; y < MAP_H; ++y) {
            set_bkg_tiles(0u, y, MAP_W, 1u, blank);
        }
    }

    set_sprite_tile(SPR_FIRE, TILE_FIREBOY);
    set_sprite_prop(SPR_FIRE, 0u);
    set_sprite_tile(SPR_WATER, TILE_WATERGIRL);
    set_sprite_prop(SPR_WATER, S_PALETTE);

    SPRITES_8x8;
    SHOW_BKG;
    SHOW_SPRITES;
    DISPLAY_ON;
}

static void initialize_game(void) {
    uint16_t i;

    seeded = 0u;
    game_over = 0u;
    won = 0u;
    rng_pad_col = 8u;

    for (i = 0u; i < (uint16_t)MAP_W * MAP_H; ++i) {
        level_map[i] = level_template[i];
    }
    level_map[(uint16_t)10u * MAP_W + 8u] = C_PLAT;
    level_map[(uint16_t)10u * MAP_W + 9u] = C_PLAT;
    level_map[(uint16_t)10u * MAP_W + 10u] = C_PLAT;
    paint_level();
    init_heroes();
}

void main(void) {
    uint8_t keys;
    uint8_t prev_keys = 0u;

    wait_vbl_done();

    initialize_video();
    sound_init();
    initialize_game();
    NOVA_STATE = 1;

    while (!game_over) {
        keys = joypad();
        try_seed(keys);

        if ((keys & J_B) && !(prev_keys & J_B)) {
            active ^= 1u;
            sfx_beep();
        }

        update_hero(&heroes[0], keys, active == 0u);
        update_hero(&heroes[1], keys, active == 1u);
        draw_heroes();

        if (!heroes[0].alive || !heroes[1].alive) {
            game_over = 1u;
            won = 0u;
        } else if (heroes[0].on_door && heroes[1].on_door) {
            game_over = 1u;
            won = 1u;
        }

        prev_keys = keys;
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
