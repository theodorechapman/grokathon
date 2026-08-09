#pragma once

#include <stdlib.h>
#include <string.h>
#include <stdint.h>

typedef struct {
    char *name;
    uint16_t addr;
    bool is_local;
} GB_bank_symbol_t;

typedef struct GB_symbol_s {
    struct GB_symbol_s *next;
    const char *name;
    uint16_t bank;
    uint16_t addr;
} GB_symbol_t;

typedef struct {
    GB_bank_symbol_t *symbols;
    size_t n_symbols;
} GB_symbol_map_t;

typedef struct {
    GB_symbol_t *buckets[0x2000];
} GB_reversed_symbol_map_t;

