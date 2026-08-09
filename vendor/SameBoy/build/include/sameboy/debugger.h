#pragma once
#include <stdbool.h>
#include <stdint.h>
#include "defs.h"
#include "symbol_hash.h"

typedef void (*GB_debugger_reload_callback_t)(GB_gameboy_t *gb);

void GB_debugger_break(GB_gameboy_t *gb);
void
GB_debugger_execute_command(GB_gameboy_t *gb, char *input); /* Destroys input. */
char *GB_debugger_complete_substring(GB_gameboy_t *gb, char *input, uintptr_t *context);  /* Destroys input, result requires free */
void GB_debugger_load_symbol_file(GB_gameboy_t *gb, const char *path);
const char *GB_debugger_name_for_address(GB_gameboy_t *gb, uint16_t addr);
/* Use -1 for bank to use the currently mapped bank */
const char *GB_debugger_describe_address(GB_gameboy_t *gb, uint16_t addr, uint16_t bank, bool exact_match, bool prefer_local);
bool GB_debugger_evaluate(GB_gameboy_t *gb, const char *string, uint16_t *result, uint16_t *result_bank); /* result_bank is -1 if unused. */
bool GB_debugger_is_stopped(GB_gameboy_t *gb);
void GB_debugger_set_disabled(GB_gameboy_t *gb, bool disabled);
void GB_debugger_clear_symbols(GB_gameboy_t *gb);
void GB_debugger_set_reload_callback(GB_gameboy_t *gb, GB_debugger_reload_callback_t callback);

double GB_debugger_get_frame_cpu_usage(GB_gameboy_t *gb);
double GB_debugger_get_second_cpu_usage(GB_gameboy_t *gb);


