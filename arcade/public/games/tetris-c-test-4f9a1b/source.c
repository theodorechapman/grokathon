// TITLE: Tetris
// DESC: Clear 12 lines before the stack reaches the top.
// CONTROLS: D-Pad move/soft-drop, A rotate
#include <gb/gb.h>
#include <stdbool.h>
#include <stdint.h>
#include <rand.h>

#define NOVA_STATE (*(volatile uint8_t *)0xCF00)

enum {
    TILE_BLACK = 0u,
    TILE_EMPTY = 1u,
    TILE_BLOCK = 2u,
    TILE_WALL = 3u,
    TILE_GHOST = 4u,

    BOARD_X = 5u,
    BOARD_Y = 1u,
    BOARD_W = 10u,
    BOARD_H = 16u,

    LINES_TO_WIN = 12u,
    DROP_FRAMES_START = 45u,
    DROP_FRAMES_MIN = 12u
};

/* 7 tetrominoes, 4 rotations, 4 cells each as packed (dx,dy) nibbles */
static const uint8_t PIECE_CELLS[7][4][4] = {
    /* I */
    {
        {0x12, 0x22, 0x32, 0x42},
        {0x30, 0x31, 0x32, 0x33},
        {0x12, 0x22, 0x32, 0x42},
        {0x30, 0x31, 0x32, 0x33}
    },
    /* O */
    {
        {0x21, 0x22, 0x31, 0x32},
        {0x21, 0x22, 0x31, 0x32},
        {0x21, 0x22, 0x31, 0x32},
        {0x21, 0x22, 0x31, 0x32}
    },
    /* T */
    {
        {0x12, 0x21, 0x22, 0x32},
        {0x12, 0x21, 0x22, 0x23},
        {0x12, 0x22, 0x23, 0x32},
        {0x21, 0x22, 0x23, 0x32}
    },
    /* S */
    {
        {0x22, 0x23, 0x31, 0x32},
        {0x11, 0x21, 0x22, 0x32},
        {0x22, 0x23, 0x31, 0x32},
        {0x11, 0x21, 0x22, 0x32}
    },
    /* Z */
    {
        {0x21, 0x22, 0x32, 0x33},
        {0x12, 0x21, 0x22, 0x31},
        {0x21, 0x22, 0x32, 0x33},
        {0x12, 0x21, 0x22, 0x31}
    },
    /* J */
    {
        {0x11, 0x21, 0x22, 0x23},
        {0x12, 0x13, 0x22, 0x32},
        {0x21, 0x22, 0x23, 0x33},
        {0x12, 0x22, 0x31, 0x32}
    },
    /* L */
    {
        {0x13, 0x21, 0x22, 0x23},
        {0x12, 0x22, 0x32, 0x33},
        {0x21, 0x22, 0x23, 0x31},
        {0x11, 0x12, 0x22, 0x32}
    }
};

static const uint8_t tile_data[] = {
    /* 0 black */
    0xFFu, 0xFFu, 0xFFu, 0xFFu, 0xFFu, 0xFFu, 0xFFu, 0xFFu,
    0xFFu, 0xFFu, 0xFFu, 0xFFu, 0xFFu, 0xFFu, 0xFFu, 0xFFu,
    /* 1 empty playfield */
    0x00u, 0x00u, 0x00u, 0x00u, 0x00u, 0x00u, 0x00u, 0x00u,
    0x00u, 0x00u, 0x00u, 0x00u, 0x00u, 0x00u, 0x00u, 0x00u,
    /* 2 solid block */
    0xFFu, 0xFFu, 0x81u, 0x7Eu, 0x81u, 0x7Eu, 0x81u, 0x7Eu,
    0x81u, 0x7Eu, 0x81u, 0x7Eu, 0x81u, 0x7Eu, 0xFFu, 0xFFu,
    /* 3 wall */
    0xAAu, 0xFFu, 0x55u, 0xFFu, 0xAAu, 0xFFu, 0x55u, 0xFFu,
    0xAAu, 0xFFu, 0x55u, 0xFFu, 0xAAu, 0xFFu, 0x55u, 0xFFu,
    /* 4 ghost / dim block */
    0xFFu, 0x00u, 0x81u, 0x00u, 0x81u, 0x00u, 0x81u, 0x00u,
    0x81u, 0x00u, 0x81u, 0x00u, 0x81u, 0x00u, 0xFFu, 0x00u
};

static uint8_t board[BOARD_H][BOARD_W];
static uint8_t cur_type;
static uint8_t cur_rot;
static int8_t cur_x;
static int8_t cur_y;
static uint8_t next_type;
static uint8_t lines_cleared;
static uint8_t drop_timer;
static uint8_t drop_period;
static uint8_t das_timer;
static uint8_t prev_keys;
static bool seeded;
static bool piece_active;

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

static void sfx_lock(void) {
    NR10_REG = 0x00u;
    NR11_REG = 0x40u;
    NR12_REG = 0xD1u;
    NR13_REG = 0xC1u;
    NR14_REG = 0x85u;
}

static void sfx_line(void) {
    NR10_REG = 0x15u;
    NR11_REG = 0x80u;
    NR12_REG = 0xF2u;
    NR13_REG = 0x9Cu;
    NR14_REG = 0x87u;
}

static uint8_t cell_dx(uint8_t packed) {
    return (uint8_t)(packed >> 4);
}

static uint8_t cell_dy(uint8_t packed) {
    return (uint8_t)(packed & 0x0Fu);
}

static bool cell_free(int8_t x, int8_t y) {
    if (x < 0 || x >= (int8_t)BOARD_W || y >= (int8_t)BOARD_H) {
        return false;
    }
    if (y < 0) {
        return true;
    }
    return board[y][x] == 0u;
}

static bool piece_fits(uint8_t type, uint8_t rot, int8_t px, int8_t py) {
    uint8_t i;
    int8_t x;
    int8_t y;

    for (i = 0u; i < 4u; ++i) {
        x = (int8_t)(px + (int8_t)cell_dx(PIECE_CELLS[type][rot][i]) - 2);
        y = (int8_t)(py + (int8_t)cell_dy(PIECE_CELLS[type][rot][i]) - 1);
        if (!cell_free(x, y)) {
            return false;
        }
    }
    return true;
}

static void draw_board_cell(uint8_t bx, uint8_t by, uint8_t tile) {
    set_bkg_tile_xy((uint8_t)(BOARD_X + bx), (uint8_t)(BOARD_Y + by), tile);
}

static void redraw_board(void) {
    uint8_t y;
    uint8_t x;

    for (y = 0u; y < BOARD_H; ++y) {
        for (x = 0u; x < BOARD_W; ++x) {
            draw_board_cell(x, y, board[y][x] != 0u ? TILE_BLOCK : TILE_EMPTY);
        }
    }
}

static void draw_piece(uint8_t type, uint8_t rot, int8_t px, int8_t py, uint8_t tile) {
    uint8_t i;
    int8_t x;
    int8_t y;

    for (i = 0u; i < 4u; ++i) {
        x = (int8_t)(px + (int8_t)cell_dx(PIECE_CELLS[type][rot][i]) - 2);
        y = (int8_t)(py + (int8_t)cell_dy(PIECE_CELLS[type][rot][i]) - 1);
        if (x >= 0 && x < (int8_t)BOARD_W && y >= 0 && y < (int8_t)BOARD_H) {
            draw_board_cell((uint8_t)x, (uint8_t)y, tile);
        }
    }
}

static void draw_current(void) {
    draw_piece(cur_type, cur_rot, cur_x, cur_y, TILE_BLOCK);
}

static void erase_current(void) {
    draw_piece(cur_type, cur_rot, cur_x, cur_y, TILE_EMPTY);
    /* restore any locked cells under the piece footprint */
    {
        uint8_t i;
        int8_t x;
        int8_t y;
        for (i = 0u; i < 4u; ++i) {
            x = (int8_t)(cur_x + (int8_t)cell_dx(PIECE_CELLS[cur_type][cur_rot][i]) - 2);
            y = (int8_t)(cur_y + (int8_t)cell_dy(PIECE_CELLS[cur_type][cur_rot][i]) - 1);
            if (x >= 0 && x < (int8_t)BOARD_W && y >= 0 && y < (int8_t)BOARD_H) {
                if (board[y][x] != 0u) {
                    draw_board_cell((uint8_t)x, (uint8_t)y, TILE_BLOCK);
                }
            }
        }
    }
}

static void lock_piece(void) {
    uint8_t i;
    int8_t x;
    int8_t y;

    for (i = 0u; i < 4u; ++i) {
        x = (int8_t)(cur_x + (int8_t)cell_dx(PIECE_CELLS[cur_type][cur_rot][i]) - 2);
        y = (int8_t)(cur_y + (int8_t)cell_dy(PIECE_CELLS[cur_type][cur_rot][i]) - 1);
        if (x >= 0 && x < (int8_t)BOARD_W && y >= 0 && y < (int8_t)BOARD_H) {
            board[y][x] = 1u;
        }
    }
    sfx_lock();
}

static uint8_t clear_lines(void) {
    uint8_t y;
    uint8_t x;
    uint8_t cleared;
    bool full;
    uint8_t ty;

    cleared = 0u;
    for (y = BOARD_H; y > 0u; ) {
        --y;
        full = true;
        for (x = 0u; x < BOARD_W; ++x) {
            if (board[y][x] == 0u) {
                full = false;
                break;
            }
        }
        if (full) {
            ++cleared;
            for (ty = y; ty > 0u; --ty) {
                for (x = 0u; x < BOARD_W; ++x) {
                    board[ty][x] = board[ty - 1u][x];
                }
            }
            for (x = 0u; x < BOARD_W; ++x) {
                board[0][x] = 0u;
            }
            y++; /* recheck same row index after collapse */
            if (y > BOARD_H) {
                y = BOARD_H;
            }
        }
    }
    if (cleared != 0u) {
        sfx_line();
        redraw_board();
    }
    return cleared;
}

static uint8_t random_piece(void) {
    return (uint8_t)(rand() % 7);
}

static bool spawn_piece(void) {
    cur_type = next_type;
    next_type = random_piece();
    cur_rot = 0u;
    cur_x = 4;
    cur_y = 0;
    drop_timer = 0u;
    piece_active = true;
    if (!piece_fits(cur_type, cur_rot, cur_x, cur_y)) {
        piece_active = false;
        return false;
    }
    draw_current();
    return true;
}

static void try_move(int8_t dx, int8_t dy) {
    if (!piece_active) {
        return;
    }
    if (piece_fits(cur_type, cur_rot, (int8_t)(cur_x + dx), (int8_t)(cur_y + dy))) {
        erase_current();
        cur_x = (int8_t)(cur_x + dx);
        cur_y = (int8_t)(cur_y + dy);
        draw_current();
        if (dx != 0) {
            sfx_beep();
        }
    }
}

static void try_rotate(void) {
    uint8_t new_rot;
    int8_t kick;

    if (!piece_active) {
        return;
    }
    new_rot = (uint8_t)((cur_rot + 1u) & 3u);
    /* simple wall kicks: 0, -1, +1, -2, +2 */
    for (kick = 0; kick <= 2; ++kick) {
        if (piece_fits(cur_type, new_rot, cur_x, cur_y)) {
            erase_current();
            cur_rot = new_rot;
            draw_current();
            sfx_beep();
            return;
        }
        if (kick == 0) {
            continue;
        }
        if (piece_fits(cur_type, new_rot, (int8_t)(cur_x - kick), cur_y)) {
            erase_current();
            cur_rot = new_rot;
            cur_x = (int8_t)(cur_x - kick);
            draw_current();
            sfx_beep();
            return;
        }
        if (piece_fits(cur_type, new_rot, (int8_t)(cur_x + kick), cur_y)) {
            erase_current();
            cur_rot = new_rot;
            cur_x = (int8_t)(cur_x + kick);
            draw_current();
            sfx_beep();
            return;
        }
    }
}

static bool soft_drop_one(void) {
    if (!piece_active) {
        return false;
    }
    if (piece_fits(cur_type, cur_rot, cur_x, (int8_t)(cur_y + 1))) {
        erase_current();
        cur_y = (int8_t)(cur_y + 1);
        draw_current();
        return true;
    }
    return false;
}

static void initialize_video(void) {
    uint8_t x;
    uint8_t y;

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

    LCDC_REG = 0x00u;

    set_bkg_data(0u, 5u, tile_data);

    /* fill screen black */
    for (y = 0u; y < 18u; ++y) {
        for (x = 0u; x < 20u; ++x) {
            set_bkg_tile_xy(x, y, TILE_BLACK);
        }
    }

    /* playfield border */
    for (y = 0u; y < BOARD_H; ++y) {
        set_bkg_tile_xy((uint8_t)(BOARD_X - 1u), (uint8_t)(BOARD_Y + y), TILE_WALL);
        set_bkg_tile_xy((uint8_t)(BOARD_X + BOARD_W), (uint8_t)(BOARD_Y + y), TILE_WALL);
    }
    for (x = 0u; x < BOARD_W + 2u; ++x) {
        set_bkg_tile_xy((uint8_t)(BOARD_X - 1u + x), (uint8_t)(BOARD_Y + BOARD_H), TILE_WALL);
        set_bkg_tile_xy((uint8_t)(BOARD_X - 1u + x), (uint8_t)(BOARD_Y - 1u), TILE_WALL);
    }

    /* empty well */
    for (y = 0u; y < BOARD_H; ++y) {
        for (x = 0u; x < BOARD_W; ++x) {
            set_bkg_tile_xy((uint8_t)(BOARD_X + x), (uint8_t)(BOARD_Y + y), TILE_EMPTY);
        }
    }

    SHOW_BKG;
    DISPLAY_ON;
}

static void initialize_game(void) {
    uint8_t y;
    uint8_t x;

    for (y = 0u; y < BOARD_H; ++y) {
        for (x = 0u; x < BOARD_W; ++x) {
            board[y][x] = 0u;
        }
    }

    lines_cleared = 0u;
    drop_period = DROP_FRAMES_START;
    drop_timer = 0u;
    das_timer = 0u;
    prev_keys = 0u;
    seeded = false;
    piece_active = false;

    /* deterministic bag head until first input reseeds */
    cur_type = 0u;
    next_type = 3u;
    cur_rot = 0u;
    cur_x = 4;
    cur_y = 0;

    redraw_board();
    spawn_piece();
}

void main(void) {
    uint8_t keys;
    uint8_t pressed;
    bool won;
    bool lost;

    wait_vbl_done();

    initialize_video();
    sound_init();
    initialize_game();
    NOVA_STATE = 1u;

    won = false;
    lost = false;

    while (!won && !lost) {
        keys = joypad();
        pressed = (uint8_t)(keys & (uint8_t)~prev_keys);

        if (!seeded && keys != 0u) {
            initrand((uint16_t)DIV_REG | ((uint16_t)DIV_REG << 8));
            next_type = random_piece();
            seeded = true;
        }

        if ((pressed & J_UP) != 0u || (pressed & J_A) != 0u) {
            try_rotate();
        }

        if ((keys & J_LEFT) != 0u) {
            if ((pressed & J_LEFT) != 0u || das_timer == 0u) {
                try_move(-1, 0);
                das_timer = (pressed & J_LEFT) != 0u ? 12u : 5u;
            } else {
                --das_timer;
            }
        } else if ((keys & J_RIGHT) != 0u) {
            if ((pressed & J_RIGHT) != 0u || das_timer == 0u) {
                try_move(1, 0);
                das_timer = (pressed & J_RIGHT) != 0u ? 12u : 5u;
            } else {
                --das_timer;
            }
        } else {
            das_timer = 0u;
        }

        if ((keys & J_DOWN) != 0u) {
            if (!soft_drop_one()) {
                lock_piece();
                lines_cleared = (uint8_t)(lines_cleared + clear_lines());
                if (lines_cleared >= LINES_TO_WIN) {
                    won = true;
                } else {
                    /* speed up slightly every few lines */
                    if (lines_cleared >= 4u && drop_period > 30u) {
                        drop_period = 30u;
                    }
                    if (lines_cleared >= 8u && drop_period > DROP_FRAMES_MIN) {
                        drop_period = DROP_FRAMES_MIN;
                    }
                    if (!spawn_piece()) {
                        lost = true;
                    }
                }
                drop_timer = 0u;
            } else {
                drop_timer = 0u;
            }
        } else {
            ++drop_timer;
            if (drop_timer >= drop_period) {
                drop_timer = 0u;
                if (!soft_drop_one()) {
                    lock_piece();
                    lines_cleared = (uint8_t)(lines_cleared + clear_lines());
                    if (lines_cleared >= LINES_TO_WIN) {
                        won = true;
                    } else if (!spawn_piece()) {
                        lost = true;
                    }
                }
            }
        }

        prev_keys = keys;
        wait_vbl_done();
    }

    NOVA_STATE = won ? 2u : 3u;
    if (won) {
        sfx_jingle();
    } else {
        sfx_boom();
    }
    while (true) {
        wait_vbl_done();
    }
}
