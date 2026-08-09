// TITLE: Space Invaders
// DESC: Waves of aliens march down — blast them all before they land.
// CONTROLS: D-pad left/right move, A fire
#include <gb/gb.h>
#include <stdbool.h>
#include <stdint.h>
#include <rand.h>

#include "assets.h"

enum {
    /* Background tile from the shared asset bank (empty cell). */
    TILE_EMPTY = 0x80u,

    /* Local sprite tile indices (loaded via set_sprite_data). */
    SPR_TILE_SHIP = 0u,
    SPR_TILE_ALIEN_A = 1u,
    SPR_TILE_ALIEN_B = 2u,
    SPR_TILE_BULLET = 3u,
    SPR_TILE_ABULLET = 4u,
    SPR_TILE_COUNT = 5u,

    /* OAM sprite slots */
    SPR_PLAYER = 0u,
    SPR_PBULLET = 1u,
    SPR_ABULLET0 = 2u,
    SPR_ABULLET1 = 3u,
    SPR_ALIEN0 = 4u,

    PLAYER_Y = 0x98u,
    PLAYER_MIN_X = 0x08u,
    PLAYER_MAX_X = 0x98u,
    PLAYER_INITIAL_X = 0x50u,

    BULLET_SPEED = 3,
    ABULLET_SPEED = 2,

    ALIEN_COLS = 6u,
    ALIEN_ROWS = 3u,
    ALIEN_COUNT = 18u,
    ALIEN_X_SPACING = 16u,
    ALIEN_Y_SPACING = 12u,
    ALIEN_START_X = 0x18u,
    ALIEN_START_Y = 0x28u,
    ALIEN_LEFT_LIMIT = 0x0Cu,
    ALIEN_RIGHT_LIMIT = 0x98u,
    ALIEN_LAND_Y = 0x90u,

    WAVES_TO_WIN = 3u,
    BASE_MOVE_PERIOD = 18u,
    SHOT_COOLDOWN_FRAMES = 12u,
    ALIEN_SHOT_BASE = 45u
};

/*
 * Nova arcade protocol: one byte at a fixed WRAM address the arcade polls to
 * detect run state. The linker can't move it because it's an absolute pointer,
 * not a variable. 1 = run started, 2 = won, 3 = lost. Every game the pipeline
 * ships MUST keep these three writes intact.
 */
#define NOVA_STATE (*(volatile uint8_t *)0xCF00)

/* 8x8 2bpp sprite tiles: ship, alien A/B, player bullet, alien bullet */
static const uint8_t sprite_tiles[SPR_TILE_COUNT * 16u] = {
    /* ship */
    0x18u, 0x18u, 0x3Cu, 0x3Cu, 0x7Eu, 0x7Eu, 0xFFu, 0xFFu,
    0xBDu, 0xBDu, 0x99u, 0x99u, 0x81u, 0x81u, 0x00u, 0x00u,
    /* alien A */
    0x42u, 0x42u, 0x24u, 0x24u, 0x7Eu, 0x7Eu, 0xDBu, 0xDBu,
    0xFFu, 0xFFu, 0xA5u, 0xA5u, 0x24u, 0x24u, 0x42u, 0x42u,
    /* alien B */
    0x24u, 0x24u, 0x7Eu, 0x7Eu, 0xFFu, 0xFFu, 0xDBu, 0xDBu,
    0x7Eu, 0x7Eu, 0x3Cu, 0x3Cu, 0x42u, 0x42u, 0x81u, 0x81u,
    /* player bullet */
    0x18u, 0x18u, 0x18u, 0x18u, 0x18u, 0x18u, 0x18u, 0x18u,
    0x18u, 0x18u, 0x00u, 0x00u, 0x00u, 0x00u, 0x00u, 0x00u,
    /* alien bullet */
    0x00u, 0x00u, 0x18u, 0x18u, 0x3Cu, 0x3Cu, 0x18u, 0x18u,
    0x18u, 0x18u, 0x3Cu, 0x3Cu, 0x18u, 0x18u, 0x00u, 0x00u
};

static uint8_t player_x;
static uint8_t pbullet_x;
static uint8_t pbullet_y;
static bool pbullet_active;
static uint8_t shot_cooldown;

static uint8_t alien_x[ALIEN_COUNT];
static uint8_t alien_y[ALIEN_COUNT];
static bool alien_alive[ALIEN_COUNT];
static uint8_t aliens_left;
static int8_t alien_dir;
static uint8_t alien_move_timer;
static uint8_t alien_move_period;
static uint8_t alien_anim;
static uint8_t wave;
static uint8_t alien_shot_timer;

static uint8_t abullet_x[2];
static uint8_t abullet_y[2];
static bool abullet_active[2];

static bool rng_seeded;
static bool game_won;
static bool game_lost;

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

/* Short square blip on channel 1: shots and alien hits. Non-blocking. */
static void sfx_beep(void) {
    NR10_REG = 0x00u; /* no sweep */
    NR11_REG = 0x80u; /* 50% duty */
    NR12_REG = 0xF1u; /* full volume, fast envelope decay */
    NR13_REG = 0xC1u;
    NR14_REG = 0x87u; /* trigger, slightly higher pitch for laser */
}

/* Noise burst on channel 4: explosion / loss. Non-blocking. */
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

static void seed_rng_from_div(void) {
    uint16_t seed;

    if (rng_seeded) {
        return;
    }
    seed = (uint16_t)DIV_REG;
    seed |= (uint16_t)((uint16_t)DIV_REG << 8);
    if (seed == 0u) {
        seed = 1u;
    }
    initrand(seed);
    rng_seeded = true;
}

static void spr_hide(uint8_t id) {
    move_sprite(id, 0u, 0u);
}

static void clear_background(void) {
    uint8_t x;
    uint8_t y;

    for (y = 0u; y < BREAKOUT_MAP_HEIGHT; ++y) {
        for (x = 0u; x < BREAKOUT_MAP_WIDTH; ++x) {
            set_bkg_tile_xy(x, y, TILE_EMPTY);
        }
    }
}

static void draw_player(void) {
    move_sprite(SPR_PLAYER, player_x, PLAYER_Y);
}

static void spawn_wave(void) {
    uint8_t row;
    uint8_t col;
    uint8_t i;
    uint8_t x_offset;
    uint8_t y_base;

    /* Run-to-run variation once seeded; first wave uses a small fixed spread. */
    if (rng_seeded) {
        x_offset = (uint8_t)(rand() & 0x0Fu);
        y_base = (uint8_t)(ALIEN_START_Y + (uint8_t)(rand() & 0x07u));
    } else {
        x_offset = 0u;
        y_base = ALIEN_START_Y;
    }

    aliens_left = ALIEN_COUNT;
    alien_dir = 1;
    alien_anim = 0u;
    /* Later waves march faster. */
    alien_move_period = (uint8_t)(BASE_MOVE_PERIOD - (wave * 4u));
    if (alien_move_period < 6u) {
        alien_move_period = 6u;
    }
    alien_move_timer = alien_move_period;
    alien_shot_timer = (uint8_t)(ALIEN_SHOT_BASE - (wave * 8u));

    i = 0u;
    for (row = 0u; row < ALIEN_ROWS; ++row) {
        for (col = 0u; col < ALIEN_COLS; ++col) {
            alien_x[i] = (uint8_t)(ALIEN_START_X + x_offset + col * ALIEN_X_SPACING);
            alien_y[i] = (uint8_t)(y_base + row * ALIEN_Y_SPACING);
            alien_alive[i] = true;
            set_sprite_tile(
                (uint8_t)(SPR_ALIEN0 + i),
                (row == 0u) ? SPR_TILE_ALIEN_A : SPR_TILE_ALIEN_B
            );
            move_sprite((uint8_t)(SPR_ALIEN0 + i), alien_x[i], alien_y[i]);
            ++i;
        }
    }

    pbullet_active = false;
    spr_hide(SPR_PBULLET);
    abullet_active[0] = false;
    abullet_active[1] = false;
    spr_hide(SPR_ABULLET0);
    spr_hide(SPR_ABULLET1);
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
    clear_background();

    set_sprite_data(0u, SPR_TILE_COUNT, sprite_tiles);
    set_sprite_tile(SPR_PLAYER, SPR_TILE_SHIP);
    set_sprite_tile(SPR_PBULLET, SPR_TILE_BULLET);
    set_sprite_tile(SPR_ABULLET0, SPR_TILE_ABULLET);
    set_sprite_tile(SPR_ABULLET1, SPR_TILE_ABULLET);

    for (i = 0u; i < ALIEN_COUNT; ++i) {
        set_sprite_tile((uint8_t)(SPR_ALIEN0 + i), SPR_TILE_ALIEN_A);
        spr_hide((uint8_t)(SPR_ALIEN0 + i));
    }
    spr_hide(SPR_PBULLET);
    spr_hide(SPR_ABULLET0);
    spr_hide(SPR_ABULLET1);

    SPRITES_8x8;
    SHOW_BKG;
    SHOW_SPRITES;
    DISPLAY_ON;
}

static void initialize_game(void) {
    player_x = PLAYER_INITIAL_X;
    pbullet_active = false;
    shot_cooldown = 0u;
    wave = 0u;
    rng_seeded = false;
    game_won = false;
    game_lost = false;
    abullet_active[0] = false;
    abullet_active[1] = false;

    draw_player();
    spawn_wave();
}

static void move_player(int8_t delta) {
    int16_t next_x;

    next_x = (int16_t)player_x + delta;
    if (next_x < (int16_t)PLAYER_MIN_X) {
        next_x = PLAYER_MIN_X;
    } else if (next_x > (int16_t)PLAYER_MAX_X) {
        next_x = PLAYER_MAX_X;
    }
    player_x = (uint8_t)next_x;
    draw_player();
}

static void try_fire(void) {
    if (pbullet_active || shot_cooldown != 0u) {
        return;
    }
    pbullet_active = true;
    pbullet_x = player_x;
    pbullet_y = (uint8_t)(PLAYER_Y - 8u);
    move_sprite(SPR_PBULLET, pbullet_x, pbullet_y);
    shot_cooldown = SHOT_COOLDOWN_FRAMES;
    sfx_beep();
}

static bool sprite_overlap(uint8_t ax, uint8_t ay, uint8_t bx, uint8_t by) {
    int16_t dx;
    int16_t dy;

    dx = (int16_t)ax - (int16_t)bx;
    if (dx < 0) {
        dx = (int16_t)-dx;
    }
    dy = (int16_t)ay - (int16_t)by;
    if (dy < 0) {
        dy = (int16_t)-dy;
    }
    return (dx < 8) && (dy < 8);
}

static void kill_alien(uint8_t i) {
    alien_alive[i] = false;
    --aliens_left;
    spr_hide((uint8_t)(SPR_ALIEN0 + i));
    sfx_beep();
}

static void update_player_bullet(void) {
    uint8_t i;

    if (!pbullet_active) {
        return;
    }

    if (pbullet_y <= 0x14u) {
        pbullet_active = false;
        spr_hide(SPR_PBULLET);
        return;
    }

    pbullet_y = (uint8_t)(pbullet_y - BULLET_SPEED);
    move_sprite(SPR_PBULLET, pbullet_x, pbullet_y);

    for (i = 0u; i < ALIEN_COUNT; ++i) {
        if (!alien_alive[i]) {
            continue;
        }
        if (sprite_overlap(pbullet_x, pbullet_y, alien_x[i], alien_y[i])) {
            kill_alien(i);
            pbullet_active = false;
            spr_hide(SPR_PBULLET);
            return;
        }
    }
}

static void alien_try_shoot(void) {
    uint8_t slot;
    uint8_t living[ALIEN_COUNT];
    uint8_t n;
    uint8_t i;
    uint8_t pick;
    uint8_t bottom_row;

    if (!rng_seeded) {
        return;
    }

    slot = 0xFFu;
    if (!abullet_active[0]) {
        slot = 0u;
    } else if (!abullet_active[1]) {
        slot = 1u;
    } else {
        return;
    }

    n = 0u;
    /* Prefer lowest living alien in a random column for a fair threat. */
    for (i = 0u; i < ALIEN_COUNT; ++i) {
        if (alien_alive[i]) {
            living[n++] = i;
        }
    }
    if (n == 0u) {
        return;
    }

    pick = living[(uint8_t)(rand() % n)];
    /* Walk down the column for the bottom-most shooter. */
    bottom_row = (uint8_t)(pick % ALIEN_COLS);
    for (i = (uint8_t)(ALIEN_ROWS - 1u); ; --i) {
        uint8_t idx = (uint8_t)(i * ALIEN_COLS + bottom_row);
        if (alien_alive[idx]) {
            pick = idx;
            break;
        }
        if (i == 0u) {
            break;
        }
    }

    abullet_active[slot] = true;
    abullet_x[slot] = alien_x[pick];
    abullet_y[slot] = (uint8_t)(alien_y[pick] + 8u);
    move_sprite((uint8_t)(SPR_ABULLET0 + slot), abullet_x[slot], abullet_y[slot]);
}

static void update_alien_bullets(void) {
    uint8_t s;

    for (s = 0u; s < 2u; ++s) {
        if (!abullet_active[s]) {
            continue;
        }
        abullet_y[s] = (uint8_t)(abullet_y[s] + ABULLET_SPEED);
        if (abullet_y[s] >= 0xA0u) {
            abullet_active[s] = false;
            spr_hide((uint8_t)(SPR_ABULLET0 + s));
            continue;
        }
        move_sprite((uint8_t)(SPR_ABULLET0 + s), abullet_x[s], abullet_y[s]);

        if (sprite_overlap(abullet_x[s], abullet_y[s], player_x, PLAYER_Y)) {
            game_lost = true;
            return;
        }
    }
}

static void update_aliens(void) {
    uint8_t i;
    uint8_t min_x;
    uint8_t max_x;
    bool hit_edge;
    bool drop;

    if (aliens_left == 0u) {
        return;
    }

    if (alien_move_timer != 0u) {
        --alien_move_timer;
        return;
    }
    alien_move_timer = alien_move_period;
    alien_anim ^= 1u;

    min_x = 0xFFu;
    max_x = 0u;
    for (i = 0u; i < ALIEN_COUNT; ++i) {
        if (!alien_alive[i]) {
            continue;
        }
        if (alien_x[i] < min_x) {
            min_x = alien_x[i];
        }
        if (alien_x[i] > max_x) {
            max_x = alien_x[i];
        }
    }

    hit_edge = false;
    if (alien_dir > 0) {
        if ((uint16_t)max_x + 2u >= ALIEN_RIGHT_LIMIT) {
            hit_edge = true;
        }
    } else {
        if (min_x <= (uint8_t)(ALIEN_LEFT_LIMIT + 2u)) {
            hit_edge = true;
        }
    }

    drop = false;
    if (hit_edge) {
        alien_dir = (int8_t)-alien_dir;
        drop = true;
    }

    for (i = 0u; i < ALIEN_COUNT; ++i) {
        if (!alien_alive[i]) {
            continue;
        }
        if (drop) {
            alien_y[i] = (uint8_t)(alien_y[i] + 8u);
            if (alien_y[i] >= ALIEN_LAND_Y) {
                game_lost = true;
            }
        } else {
            alien_x[i] = (uint8_t)((int16_t)alien_x[i] + alien_dir * 2);
        }

        /* Animate tile by row family. */
        if ((i / ALIEN_COLS) == 0u) {
            set_sprite_tile(
                (uint8_t)(SPR_ALIEN0 + i),
                alien_anim ? SPR_TILE_ALIEN_B : SPR_TILE_ALIEN_A
            );
        } else {
            set_sprite_tile(
                (uint8_t)(SPR_ALIEN0 + i),
                alien_anim ? SPR_TILE_ALIEN_A : SPR_TILE_ALIEN_B
            );
        }
        move_sprite((uint8_t)(SPR_ALIEN0 + i), alien_x[i], alien_y[i]);
    }
}

void main(void) {
    uint8_t keys;
    uint8_t prev_keys;

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

    prev_keys = 0u;

    while (!game_won && !game_lost) {
        keys = joypad();

        if (keys != 0u) {
            seed_rng_from_div();
        }

        if ((keys & J_LEFT) != 0u) {
            move_player(-2);
        } else if ((keys & J_RIGHT) != 0u) {
            move_player(2);
        }

        if (((keys & J_A) != 0u) && ((prev_keys & J_A) == 0u)) {
            try_fire();
        }

        if (shot_cooldown != 0u) {
            --shot_cooldown;
        }

        update_player_bullet();
        update_aliens();

        if (alien_shot_timer != 0u) {
            --alien_shot_timer;
        } else {
            alien_try_shoot();
            if (rng_seeded) {
                alien_shot_timer = (uint8_t)(ALIEN_SHOT_BASE - (wave * 8u) + (rand() & 0x1Fu));
            } else {
                alien_shot_timer = ALIEN_SHOT_BASE;
            }
        }

        update_alien_bullets();

        if (game_lost) {
            break;
        }

        if (aliens_left == 0u) {
            ++wave;
            if (wave >= WAVES_TO_WIN) {
                game_won = true;
                break;
            }
            /* Brief pause between waves. */
            {
                uint8_t pause;
                for (pause = 0u; pause < 30u; ++pause) {
                    wait_vbl_done();
                }
            }
            spawn_wave();
        }

        prev_keys = keys;
        wait_vbl_done();
    }

    if (game_won) {
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
