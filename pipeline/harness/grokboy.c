#include "grokboy.h"

#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include <sameboy/gb.h>

/* glibc's <limits.h> hides PATH_MAX under strict -std=c11. */
#ifndef PATH_MAX
#define PATH_MAX 4096
#endif

#define SB_SCREEN_WIDTH 160
#define SB_SCREEN_HEIGHT 144
#define SB_FRAME_RGB_SIZE (SB_SCREEN_WIDTH * SB_SCREEN_HEIGHT * 3)
#define SB_MAX_BREAKPOINTS 128
#define SB_MAX_WATCHPOINTS 128
#define SB_LOG_SIZE 65536
#define SB_CALL_TRACE_CAP 16384  /* power of two; open-addressing set of seeds */

typedef struct {
    uint16_t address;
    bool enabled;
} native_breakpoint;

typedef struct {
    uint16_t start;
    uint16_t end;
    uint8_t access;
    bool enabled;
} native_watchpoint;

struct sb_handle {
    GB_gameboy_t *gb;
    uint32_t pixels[SB_SCREEN_WIDTH * SB_SCREEN_HEIGHT];
    char rom_path[PATH_MAX];
    char boot_path[PATH_MAX];
    char error[256];
    char log[SB_LOG_SIZE];
    size_t log_length;
    uint64_t frames;
    uint64_t instructions;
    native_breakpoint breakpoints[SB_MAX_BREAKPOINTS];
    native_watchpoint watchpoints[SB_MAX_WATCHPOINTS];
    sb_stop_reason stop_reason;
    uint16_t stop_address;
    uint8_t stop_value;
    bool suppress_watchpoints;
    bool skip_breakpoint_once;
    uint16_t resume_breakpoint_address;
    /* Call-target trace: seeds for static analysis of bank-switched code.
       When on, the execution callback records (bank, address) of the
       instruction executed immediately after a CALL, i.e. runtime-resolved
       function entry points in the currently mapped ROM bank. Stored as an
       open-addressing hash set of keys ((bank << 16) | address); address is
       always >= 0x4000 so key 0 marks an empty slot. */
    bool call_trace_on;
    bool call_pending;
    uint32_t call_targets[SB_CALL_TRACE_CAP];
    size_t call_target_count;
};

static _Thread_local char create_error[256];

static int fail(sb_handle *handle, const char *message)
{
    char *destination = handle ? handle->error : create_error;
    snprintf(destination, 256, "%s", message);
    return -1;
}

static sb_handle *context(GB_gameboy_t *gb)
{
    return GB_get_user_data(gb);
}

static uint32_t encode_rgb(GB_gameboy_t *gb, uint8_t r, uint8_t g, uint8_t b)
{
    (void)gb;
    return (uint32_t)r | (uint32_t)g << 8 | (uint32_t)b << 16 | 0xff000000u;
}

static void on_vblank(GB_gameboy_t *gb, GB_vblank_type_t type)
{
    (void)type;
    sb_handle *handle = context(gb);
    if (handle) handle->frames++;
}

static void on_log(GB_gameboy_t *gb, const char *text, GB_log_attributes_t attributes)
{
    (void)attributes;
    sb_handle *handle = context(gb);
    if (!handle || !text) return;

    size_t available = sizeof(handle->log) - handle->log_length - 1;
    size_t length = strlen(text);
    if (length > available) length = available;
    memcpy(handle->log + handle->log_length, text, length);
    handle->log_length += length;
    handle->log[handle->log_length] = '\0';
}

static bool watchpoint_matches(
    const native_watchpoint *watchpoint, uint16_t address, uint8_t access)
{
    return watchpoint->enabled &&
           address >= watchpoint->start &&
           address <= watchpoint->end &&
           (watchpoint->access & access);
}

static void record_watchpoint(GB_gameboy_t *gb, uint16_t address, uint8_t value, uint8_t access)
{
    sb_handle *handle = context(gb);
    if (!handle || handle->suppress_watchpoints ||
        handle->stop_reason != SB_STOP_FRAME_LIMIT) {
        return;
    }

    for (size_t i = 0; i < SB_MAX_WATCHPOINTS; i++) {
        if (watchpoint_matches(&handle->watchpoints[i], address, access)) {
            handle->stop_reason =
                access == SB_WATCH_WRITE ? SB_STOP_WATCH_WRITE : SB_STOP_WATCH_READ;
            handle->stop_address = address;
            handle->stop_value = value;
            return;
        }
    }
}

static uint8_t on_memory_read(GB_gameboy_t *gb, uint16_t address, uint8_t value)
{
    record_watchpoint(gb, address, value, SB_WATCH_READ);
    return value;
}

static bool on_memory_write(GB_gameboy_t *gb, uint16_t address, uint8_t value)
{
    record_watchpoint(gb, address, value, SB_WATCH_WRITE);
    return true;
}

static char *no_debugger_input(GB_gameboy_t *gb)
{
    (void)gb;
    return NULL;
}

/* Insert a (bank, address) seed into the open-addressing set; ignores
   duplicates and silently drops once the table is near full. */
static void call_target_insert(sb_handle *handle, uint32_t key)
{
    if (handle->call_target_count >= (SB_CALL_TRACE_CAP * 3) / 4) return;
    size_t mask = SB_CALL_TRACE_CAP - 1;
    size_t i = (key * 2654435761u) & mask;
    while (handle->call_targets[i] != 0) {
        if (handle->call_targets[i] == key) return;
        i = (i + 1) & mask;
    }
    handle->call_targets[i] = key;
    handle->call_target_count++;
}

static bool opcode_is_call(uint8_t opcode)
{
    /* CALL a16 / CALL cc,a16 — the SM83 unconditional and conditional calls.
       RST vectors target the fixed 0x00-0x38 page, never a bank, so are
       excluded: their targets are not banked function entries. */
    return opcode == 0xCD || opcode == 0xC4 || opcode == 0xCC ||
           opcode == 0xD4 || opcode == 0xDC;
}

static void on_execution(GB_gameboy_t *gb, uint16_t address, uint8_t opcode)
{
    sb_handle *handle = context(gb);
    if (!handle || !handle->call_trace_on) return;
    /* The instruction executed right after a CALL is the callee's entry. If
       it lands in the switchable bank window, record it with the bank mapped
       at that moment (a cross-bank call switches the bank before calling). */
    if (handle->call_pending && address >= 0x4000 && address <= 0x7FFF) {
        uint16_t bank = 0;
        size_t size = 0;
        GB_get_direct_access(gb, GB_DIRECT_ACCESS_ROM, &size, &bank);
        call_target_insert(handle, ((uint32_t)bank << 16) | address);
    }
    handle->call_pending = opcode_is_call(opcode);
}

static void copy_registers(sb_handle *handle, sb_registers *out)
{
    GB_registers_t *registers = GB_get_registers(handle->gb);
    *out = (sb_registers){
        .af = registers->af,
        .bc = registers->bc,
        .de = registers->de,
        .hl = registers->hl,
        .sp = registers->sp,
        .pc = registers->pc,
        .a = registers->a,
        .f = registers->f,
        .b = registers->b,
        .c = registers->c,
        .d = registers->d,
        .e = registers->e,
        .h = registers->h,
        .l = registers->l,
    };
}

static void copy_stop(sb_handle *handle, uint64_t executed, sb_stop *out)
{
    *out = (sb_stop){
        .reason = handle->stop_reason,
        .address = handle->stop_address,
        .value = handle->stop_value,
        .executed = executed,
        .frames = handle->frames,
        .instructions = handle->instructions,
    };
    copy_registers(handle, &out->registers);
}

static bool has_breakpoint(const sb_handle *handle, uint16_t address)
{
    for (size_t i = 0; i < SB_MAX_BREAKPOINTS; i++) {
        if (handle->breakpoints[i].enabled &&
            handle->breakpoints[i].address == address) {
            return true;
        }
    }
    return false;
}

SB_EXPORT int sb_create(const char *rom_path, const char *boot_path, sb_handle **out)
{
    if (!rom_path || !boot_path || !out) return fail(NULL, "invalid create arguments");
    *out = NULL;

    sb_handle *handle = calloc(1, sizeof(*handle));
    if (!handle) return fail(NULL, "could not allocate harness");

    handle->gb = GB_init(GB_alloc(), GB_MODEL_DMG_B);
    if (!handle->gb) {
        free(handle);
        return fail(NULL, "could not allocate SameBoy");
    }

    GB_set_user_data(handle->gb, handle);
    GB_set_pixels_output(handle->gb, handle->pixels);
    GB_set_rgb_encode_callback(handle->gb, encode_rgb);
    GB_set_vblank_callback(handle->gb, on_vblank);
    GB_set_log_callback(handle->gb, on_log);
    GB_set_input_callback(handle->gb, no_debugger_input);
    GB_set_async_input_callback(handle->gb, no_debugger_input);
    GB_set_read_memory_callback(handle->gb, on_memory_read);
    GB_set_write_memory_callback(handle->gb, on_memory_write);
    GB_set_execution_callback(handle->gb, on_execution);
    GB_set_emulate_joypad_bouncing(handle->gb, false);
    GB_set_color_correction_mode(handle->gb, GB_COLOR_CORRECTION_MODERN_BALANCED);

    if (GB_load_boot_rom(handle->gb, boot_path) != 0 ||
        GB_load_rom(handle->gb, rom_path) != 0) {
        GB_free(handle->gb);
        GB_dealloc(handle->gb);
        free(handle);
        return fail(NULL, "failed to load ROM or boot ROM");
    }

    snprintf(handle->rom_path, sizeof(handle->rom_path), "%s", rom_path);
    snprintf(handle->boot_path, sizeof(handle->boot_path), "%s", boot_path);
    handle->stop_reason = SB_STOP_FRAME_LIMIT;
    *out = handle;
    return 0;
}

SB_EXPORT void sb_destroy(sb_handle *handle)
{
    if (!handle) return;
    GB_free(handle->gb);
    GB_dealloc(handle->gb);
    free(handle);
}

SB_EXPORT const char *sb_last_error(const sb_handle *handle)
{
    return handle ? handle->error : create_error;
}

SB_EXPORT int sb_get_title(sb_handle *handle, char *out, size_t capacity)
{
    if (!handle || !out || capacity < 17) return fail(handle, "title buffer must hold 17 bytes");
    GB_get_rom_title(handle->gb, out);
    out[capacity - 1] = '\0';
    return 0;
}

SB_EXPORT int sb_get_registers(sb_handle *handle, sb_registers *out)
{
    if (!handle || !out) return fail(handle, "invalid register output");
    copy_registers(handle, out);
    return 0;
}

SB_EXPORT int sb_set_register(sb_handle *handle, uint32_t reg, uint16_t value)
{
    if (!handle) return fail(NULL, "invalid handle");
    GB_registers_t *registers = GB_get_registers(handle->gb);
    bool byte_register = reg >= SB_REG_A && reg <= SB_REG_L;
    if (byte_register && value > UINT8_MAX) return fail(handle, "8-bit register overflow");

    switch (reg) {
        case SB_REG_AF: registers->af = value; break;
        case SB_REG_BC: registers->bc = value; break;
        case SB_REG_DE: registers->de = value; break;
        case SB_REG_HL: registers->hl = value; break;
        case SB_REG_SP: registers->sp = value; break;
        case SB_REG_PC: registers->pc = value; break;
        case SB_REG_A: registers->a = (uint8_t)value; break;
        case SB_REG_F: registers->f = (uint8_t)value; break;
        case SB_REG_B: registers->b = (uint8_t)value; break;
        case SB_REG_C: registers->c = (uint8_t)value; break;
        case SB_REG_D: registers->d = (uint8_t)value; break;
        case SB_REG_E: registers->e = (uint8_t)value; break;
        case SB_REG_H: registers->h = (uint8_t)value; break;
        case SB_REG_L: registers->l = (uint8_t)value; break;
        default: return fail(handle, "unknown register");
    }
    return 0;
}

SB_EXPORT uint64_t sb_get_frames(const sb_handle *handle)
{
    return handle ? handle->frames : 0;
}

SB_EXPORT uint64_t sb_get_instructions(const sb_handle *handle)
{
    return handle ? handle->instructions : 0;
}

SB_EXPORT int sb_run(
    sb_handle *handle,
    uint64_t frames,
    uint64_t max_instructions,
    bool has_until_pc,
    uint16_t until_pc,
    sb_stop *out)
{
    if (!handle || !out || frames == 0 || max_instructions == 0) {
        return fail(handle, "run requires positive frame and instruction limits");
    }

    uint64_t target_frame = handle->frames + frames;
    uint64_t executed = 0;
    handle->stop_reason = SB_STOP_FRAME_LIMIT;
    handle->stop_address = 0;
    handle->stop_value = 0;

    while (executed < max_instructions && handle->frames < target_frame) {
        uint16_t pc = GB_get_registers(handle->gb)->pc;
        if (has_until_pc && pc == until_pc) {
            handle->stop_reason = SB_STOP_UNTIL_PC;
            handle->stop_address = pc;
            break;
        }

        if (handle->skip_breakpoint_once && pc == handle->resume_breakpoint_address) {
            handle->skip_breakpoint_once = false;
        }
        else if (has_breakpoint(handle, pc)) {
            handle->stop_reason = SB_STOP_BREAKPOINT;
            handle->stop_address = pc;
            handle->resume_breakpoint_address = pc;
            handle->skip_breakpoint_once = true;
            break;
        }
        else {
            handle->skip_breakpoint_once = false;
        }

        GB_run(handle->gb);
        handle->instructions++;
        executed++;
        if (handle->stop_reason != SB_STOP_FRAME_LIMIT) break;
    }

    if (executed == max_instructions &&
        handle->frames < target_frame &&
        handle->stop_reason == SB_STOP_FRAME_LIMIT) {
        handle->stop_reason = SB_STOP_INSTRUCTION_LIMIT;
    }
    copy_stop(handle, executed, out);
    return 0;
}

SB_EXPORT int sb_step(sb_handle *handle, sb_stop *out)
{
    if (!handle || !out) return fail(handle, "invalid step arguments");
    handle->stop_reason = SB_STOP_FRAME_LIMIT;
    handle->stop_address = 0;
    handle->stop_value = 0;
    handle->skip_breakpoint_once = false;
    GB_run(handle->gb);
    handle->instructions++;
    copy_stop(handle, 1, out);
    return 0;
}

SB_EXPORT int sb_set_key(sb_handle *handle, uint32_t key, bool pressed)
{
    if (!handle || key > SB_KEY_START) return fail(handle, "unknown key");
    GB_set_key_state(handle->gb, (GB_key_t)key, pressed);
    return 0;
}

SB_EXPORT int sb_read_memory(
    sb_handle *handle, uint16_t address, uint8_t *out, size_t length)
{
    if (!handle || !out || length == 0 || (size_t)address + length > 0x10000) {
        return fail(handle, "invalid memory read");
    }
    handle->suppress_watchpoints = true;
    for (size_t i = 0; i < length; i++) {
        out[i] = GB_read_memory(handle->gb, (uint16_t)(address + i));
    }
    handle->suppress_watchpoints = false;
    return 0;
}

SB_EXPORT int sb_write_memory(
    sb_handle *handle, uint16_t address, const uint8_t *data, size_t length)
{
    if (!handle || !data || length == 0 || (size_t)address + length > 0x10000) {
        return fail(handle, "invalid memory write");
    }
    handle->suppress_watchpoints = true;
    for (size_t i = 0; i < length; i++) {
        GB_write_memory(handle->gb, (uint16_t)(address + i), data[i]);
    }
    handle->suppress_watchpoints = false;
    return 0;
}

SB_EXPORT int sb_add_breakpoint(sb_handle *handle, uint16_t address)
{
    if (!handle) return fail(NULL, "invalid handle");
    if (has_breakpoint(handle, address)) return 0;
    for (size_t i = 0; i < SB_MAX_BREAKPOINTS; i++) {
        if (!handle->breakpoints[i].enabled) {
            handle->breakpoints[i] = (native_breakpoint){
                .address = address,
                .enabled = true,
            };
            return 0;
        }
    }
    return fail(handle, "breakpoint table is full");
}

SB_EXPORT int sb_remove_breakpoint(sb_handle *handle, uint16_t address)
{
    if (!handle) return fail(NULL, "invalid handle");
    for (size_t i = 0; i < SB_MAX_BREAKPOINTS; i++) {
        if (handle->breakpoints[i].enabled &&
            handle->breakpoints[i].address == address) {
            handle->breakpoints[i].enabled = false;
        }
    }
    return 0;
}

SB_EXPORT void sb_clear_breakpoints(sb_handle *handle)
{
    if (handle) memset(handle->breakpoints, 0, sizeof(handle->breakpoints));
}

SB_EXPORT size_t sb_breakpoint_count(const sb_handle *handle)
{
    if (!handle) return 0;
    size_t count = 0;
    for (size_t i = 0; i < SB_MAX_BREAKPOINTS; i++) {
        if (handle->breakpoints[i].enabled) count++;
    }
    return count;
}

SB_EXPORT int sb_get_breakpoint(const sb_handle *handle, size_t index, uint16_t *out)
{
    if (!handle || !out) return fail((sb_handle *)handle, "invalid breakpoint output");
    size_t current = 0;
    for (size_t i = 0; i < SB_MAX_BREAKPOINTS; i++) {
        if (!handle->breakpoints[i].enabled) continue;
        if (current++ == index) {
            *out = handle->breakpoints[i].address;
            return 0;
        }
    }
    return fail((sb_handle *)handle, "breakpoint index is out of range");
}

SB_EXPORT int sb_add_watchpoint(
    sb_handle *handle, uint16_t start, uint16_t end, uint8_t access)
{
    if (!handle || end < start ||
        (access != SB_WATCH_READ &&
         access != SB_WATCH_WRITE &&
         access != SB_WATCH_READ_WRITE)) {
        return fail(handle, "invalid watchpoint");
    }
    for (size_t i = 0; i < SB_MAX_WATCHPOINTS; i++) {
        if (!handle->watchpoints[i].enabled) {
            handle->watchpoints[i] = (native_watchpoint){
                .start = start,
                .end = end,
                .access = access,
                .enabled = true,
            };
            return 0;
        }
    }
    return fail(handle, "watchpoint table is full");
}

SB_EXPORT int sb_remove_watchpoint(sb_handle *handle, uint16_t start, uint16_t end)
{
    if (!handle) return fail(NULL, "invalid handle");
    for (size_t i = 0; i < SB_MAX_WATCHPOINTS; i++) {
        if (handle->watchpoints[i].enabled &&
            handle->watchpoints[i].start == start &&
            handle->watchpoints[i].end == end) {
            handle->watchpoints[i].enabled = false;
        }
    }
    return 0;
}

SB_EXPORT void sb_clear_watchpoints(sb_handle *handle)
{
    if (handle) memset(handle->watchpoints, 0, sizeof(handle->watchpoints));
}

SB_EXPORT size_t sb_watchpoint_count(const sb_handle *handle)
{
    if (!handle) return 0;
    size_t count = 0;
    for (size_t i = 0; i < SB_MAX_WATCHPOINTS; i++) {
        if (handle->watchpoints[i].enabled) count++;
    }
    return count;
}

SB_EXPORT int sb_get_watchpoint(
    const sb_handle *handle, size_t index, sb_watchpoint *out)
{
    if (!handle || !out) return fail((sb_handle *)handle, "invalid watchpoint output");
    size_t current = 0;
    for (size_t i = 0; i < SB_MAX_WATCHPOINTS; i++) {
        if (!handle->watchpoints[i].enabled) continue;
        if (current++ == index) {
            *out = (sb_watchpoint){
                .start = handle->watchpoints[i].start,
                .end = handle->watchpoints[i].end,
                .access = handle->watchpoints[i].access,
            };
            return 0;
        }
    }
    return fail((sb_handle *)handle, "watchpoint index is out of range");
}

SB_EXPORT int sb_evaluate(
    sb_handle *handle, const char *expression, uint16_t *value, uint16_t *bank)
{
    if (!handle || !expression || !value || !bank) {
        return fail(handle, "invalid evaluate arguments");
    }
    handle->suppress_watchpoints = true;
    bool error = GB_debugger_evaluate(handle->gb, expression, value, bank);
    handle->suppress_watchpoints = false;
    return error ? fail(handle, "SameBoy could not evaluate expression") : 0;
}

SB_EXPORT int sb_debug(
    sb_handle *handle, const char *command, char *output, size_t capacity)
{
    if (!handle || !command || !output || capacity == 0) {
        return fail(handle, "invalid debug arguments");
    }
    size_t length = strlen(command);
    char *mutable_command = malloc(length + 1);
    if (!mutable_command) return fail(handle, "could not allocate debugger command");
    memcpy(mutable_command, command, length + 1);

    handle->log_length = 0;
    handle->log[0] = '\0';
    handle->suppress_watchpoints = true;
    GB_debugger_execute_command(handle->gb, mutable_command);
    handle->suppress_watchpoints = false;
    free(mutable_command);

    snprintf(output, capacity, "%s", handle->log);
    return 0;
}

SB_EXPORT int sb_set_call_trace(sb_handle *handle, bool on)
{
    if (!handle) return fail(NULL, "invalid handle");
    handle->call_trace_on = on;
    handle->call_pending = false;
    return 0;
}

SB_EXPORT int sb_clear_call_trace(sb_handle *handle)
{
    if (!handle) return fail(NULL, "invalid handle");
    for (size_t i = 0; i < SB_CALL_TRACE_CAP; i++) handle->call_targets[i] = 0;
    handle->call_target_count = 0;
    handle->call_pending = false;
    return 0;
}

/* Copy the recorded seeds into out as packed (bank<<16 | address) keys,
   compacting the sparse hash table. Returns the number written; pass out=NULL
   to just query the count. */
SB_EXPORT size_t sb_get_call_targets(const sb_handle *handle, uint32_t *out, size_t capacity)
{
    if (!handle) return 0;
    if (!out) return handle->call_target_count;
    size_t n = 0;
    for (size_t i = 0; i < SB_CALL_TRACE_CAP && n < capacity; i++) {
        if (handle->call_targets[i] != 0) out[n++] = handle->call_targets[i];
    }
    return n;
}

SB_EXPORT int sb_load_symbols(sb_handle *handle, const char *path)
{
    if (!handle || !path) return fail(handle, "invalid symbol path");
    FILE *file = fopen(path, "r");
    if (!file) return fail(handle, "symbol file does not exist");
    fclose(file);
    GB_debugger_load_symbol_file(handle->gb, path);
    return 0;
}

SB_EXPORT int sb_copy_frame_rgb(sb_handle *handle, uint8_t *out, size_t length)
{
    if (!handle || !out || length < SB_FRAME_RGB_SIZE) {
        return fail(handle, "frame buffer must hold 69120 bytes");
    }
    for (size_t i = 0; i < SB_SCREEN_WIDTH * SB_SCREEN_HEIGHT; i++) {
        uint32_t pixel = handle->pixels[i];
        out[i * 3] = pixel & 0xff;
        out[i * 3 + 1] = (pixel >> 8) & 0xff;
        out[i * 3 + 2] = (pixel >> 16) & 0xff;
    }
    return 0;
}

SB_EXPORT int sb_save_state(sb_handle *handle, const char *path)
{
    if (!handle || !path) return fail(handle, "invalid state path");
    return GB_save_state(handle->gb, path) == 0 ? 0 : fail(handle, "save state failed");
}

SB_EXPORT int sb_load_state(sb_handle *handle, const char *path)
{
    if (!handle || !path) return fail(handle, "invalid state path");
    return GB_load_state(handle->gb, path) == 0 ? 0 : fail(handle, "load state failed");
}

SB_EXPORT int sb_reset(sb_handle *handle, bool quick)
{
    if (!handle) return fail(NULL, "invalid handle");
    GB_set_key_mask(handle->gb, 0);
    if (quick) GB_quick_reset(handle->gb);
    else GB_reset(handle->gb);
    handle->frames = 0;
    handle->instructions = 0;
    handle->skip_breakpoint_once = false;
    return 0;
}

SB_EXPORT int sb_reload(sb_handle *handle)
{
    if (!handle) return fail(NULL, "invalid handle");
    GB_set_key_mask(handle->gb, 0);
    if (GB_load_boot_rom(handle->gb, handle->boot_path) != 0 ||
        GB_load_rom(handle->gb, handle->rom_path) != 0) {
        return fail(handle, "reload failed");
    }
    handle->frames = 0;
    handle->instructions = 0;
    handle->skip_breakpoint_once = false;
    return 0;
}
