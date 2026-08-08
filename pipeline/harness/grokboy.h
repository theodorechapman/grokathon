#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#if defined(_WIN32)
#define SB_EXPORT __declspec(dllexport)
#else
#define SB_EXPORT __attribute__((visibility("default")))
#endif

#ifdef __cplusplus
extern "C" {
#endif

typedef struct sb_handle sb_handle;

typedef enum {
    SB_STOP_FRAME_LIMIT,
    SB_STOP_BREAKPOINT,
    SB_STOP_WATCH_READ,
    SB_STOP_WATCH_WRITE,
    SB_STOP_UNTIL_PC,
    SB_STOP_INSTRUCTION_LIMIT,
} sb_stop_reason;

typedef enum {
    SB_KEY_RIGHT,
    SB_KEY_LEFT,
    SB_KEY_UP,
    SB_KEY_DOWN,
    SB_KEY_A,
    SB_KEY_B,
    SB_KEY_SELECT,
    SB_KEY_START,
} sb_key;

typedef enum {
    SB_REG_AF,
    SB_REG_BC,
    SB_REG_DE,
    SB_REG_HL,
    SB_REG_SP,
    SB_REG_PC,
    SB_REG_A,
    SB_REG_F,
    SB_REG_B,
    SB_REG_C,
    SB_REG_D,
    SB_REG_E,
    SB_REG_H,
    SB_REG_L,
} sb_register;

typedef enum {
    SB_WATCH_READ = 1,
    SB_WATCH_WRITE = 2,
    SB_WATCH_READ_WRITE = 3,
} sb_watch_access;

typedef struct {
    uint16_t af;
    uint16_t bc;
    uint16_t de;
    uint16_t hl;
    uint16_t sp;
    uint16_t pc;
    uint8_t a;
    uint8_t f;
    uint8_t b;
    uint8_t c;
    uint8_t d;
    uint8_t e;
    uint8_t h;
    uint8_t l;
} sb_registers;

typedef struct {
    uint32_t reason;
    uint16_t address;
    uint8_t value;
    uint64_t executed;
    uint64_t frames;
    uint64_t instructions;
    sb_registers registers;
} sb_stop;

typedef struct {
    uint16_t start;
    uint16_t end;
    uint8_t access;
} sb_watchpoint;

typedef struct {
    uint16_t model;
    uint16_t rom_bank;
    uint16_t ram_bank;
    uint16_t vram_bank;
    uint8_t cgb_mode;
} sb_hardware_info;

typedef struct {
    uint16_t bank;
    uint16_t pc;
    uint64_t instruction;
    uint64_t frame;
} sb_bank_event;

typedef struct {
    uint16_t rom_bank;
    uint16_t src;
    uint16_t vram_bank;
    uint16_t dst;
    uint32_t length;
} sb_asset_run;

SB_EXPORT int sb_create(const char *rom_path, const char *boot_path, sb_handle **out);
SB_EXPORT void sb_destroy(sb_handle *handle);
SB_EXPORT const char *sb_last_error(const sb_handle *handle);

SB_EXPORT int sb_get_title(sb_handle *handle, char *out, size_t capacity);
SB_EXPORT int sb_get_hardware_info(sb_handle *handle, sb_hardware_info *out);
SB_EXPORT int sb_get_registers(sb_handle *handle, sb_registers *out);
SB_EXPORT int sb_set_register(sb_handle *handle, uint32_t reg, uint16_t value);
SB_EXPORT uint64_t sb_get_frames(const sb_handle *handle);
SB_EXPORT uint64_t sb_get_instructions(const sb_handle *handle);

SB_EXPORT int sb_run(
    sb_handle *handle,
    uint64_t frames,
    uint64_t max_instructions,
    bool has_until_pc,
    uint16_t until_pc,
    sb_stop *out);
SB_EXPORT int sb_step(sb_handle *handle, sb_stop *out);
SB_EXPORT int sb_set_key(sb_handle *handle, uint32_t key, bool pressed);

SB_EXPORT int sb_read_memory(
    sb_handle *handle, uint16_t address, uint8_t *out, size_t length);
SB_EXPORT int sb_write_memory(
    sb_handle *handle, uint16_t address, const uint8_t *data, size_t length);

SB_EXPORT int sb_add_breakpoint(sb_handle *handle, uint16_t address);
SB_EXPORT int sb_remove_breakpoint(sb_handle *handle, uint16_t address);
SB_EXPORT void sb_clear_breakpoints(sb_handle *handle);
SB_EXPORT size_t sb_breakpoint_count(const sb_handle *handle);
SB_EXPORT int sb_get_breakpoint(const sb_handle *handle, size_t index, uint16_t *out);

SB_EXPORT int sb_add_watchpoint(
    sb_handle *handle, uint16_t start, uint16_t end, uint8_t access);
SB_EXPORT int sb_remove_watchpoint(sb_handle *handle, uint16_t start, uint16_t end);
SB_EXPORT void sb_clear_watchpoints(sb_handle *handle);
SB_EXPORT size_t sb_watchpoint_count(const sb_handle *handle);
SB_EXPORT int sb_get_watchpoint(
    const sb_handle *handle, size_t index, sb_watchpoint *out);

SB_EXPORT int sb_evaluate(
    sb_handle *handle, const char *expression, uint16_t *value, uint16_t *bank);
SB_EXPORT int sb_debug(
    sb_handle *handle, const char *command, char *output, size_t capacity);
SB_EXPORT int sb_load_symbols(sb_handle *handle, const char *path);

/* Call-target trace: records runtime-resolved (bank, address) function entry
   points in switchable ROM banks, to seed static analysis of banked code. */
SB_EXPORT int sb_set_call_trace(sb_handle *handle, bool on);
SB_EXPORT int sb_clear_call_trace(sb_handle *handle);
SB_EXPORT size_t sb_get_call_targets(
    const sb_handle *handle, uint32_t *out, size_t capacity);

/* Execution trace: records every distinct physical (ROM bank, PC) reached,
   plus a compact timeline of changes to the switchable ROM bank. */
SB_EXPORT int sb_set_execution_trace(sb_handle *handle, bool on);
SB_EXPORT int sb_clear_execution_trace(sb_handle *handle);
SB_EXPORT size_t sb_get_execution_coverage(
    const sb_handle *handle, uint32_t *out, size_t capacity);
SB_EXPORT size_t sb_get_bank_events(
    const sb_handle *handle, sb_bank_event *out, size_t capacity);

/* Asset trace: records ROM-to-VRAM runs including the physical source ROM
   bank and destination CGB VRAM bank. */
SB_EXPORT int sb_set_asset_trace(sb_handle *handle, bool on);
SB_EXPORT int sb_clear_asset_trace(sb_handle *handle);
SB_EXPORT size_t sb_get_asset_runs(
    sb_handle *handle, sb_asset_run *out, size_t capacity);

/* Snapshot CGB video memory without changing the emulated machine state. */
SB_EXPORT int sb_copy_vram_bank(
    sb_handle *handle, uint16_t bank, uint8_t *out, size_t length);
SB_EXPORT int sb_copy_palette(
    sb_handle *handle, bool object_palette, uint8_t *out, size_t length);

SB_EXPORT int sb_copy_frame_rgb(sb_handle *handle, uint8_t *out, size_t length);
SB_EXPORT int sb_save_state(sb_handle *handle, const char *path);
SB_EXPORT int sb_load_state(sb_handle *handle, const char *path);
SB_EXPORT int sb_reset(sb_handle *handle, bool quick);
SB_EXPORT int sb_reload(sb_handle *handle);

#ifdef __cplusplus
}
#endif
