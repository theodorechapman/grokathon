#pragma once

#define GB_likely(x)   __builtin_expect((bool)(x), 1)
#define GB_unlikely(x) __builtin_expect((bool)(x), 0)
#define GB_inline_const(type, ...) (*({static const typeof(type) _= __VA_ARGS__; &_;}))

#if !defined(typeof)
#if defined(__cplusplus) || __STDC_VERSION__ < 202311
#define typeof __typeof__
#endif
#endif


struct GB_gameboy_s;
typedef struct GB_gameboy_s GB_gameboy_t;
