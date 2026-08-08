SAMEBOY := vendor/SameBoy
SAMEBOY_BUILD := $(SAMEBOY)/build
SAMEBOY_LIB := $(SAMEBOY_BUILD)/lib/libsameboy.a
SAMEBOY_BOOT := $(SAMEBOY_BUILD)/bin/BootROMs/dmg_boot.bin

UNAME_S := $(shell uname -s)
ifeq ($(UNAME_S),Darwin)
NATIVE := bin/libgrokboy.dylib
SHARED_FLAGS := -dynamiclib -Wl,-install_name,@rpath/libgrokboy.dylib
else
NATIVE := bin/libgrokboy.so
SHARED_FLAGS := -shared
endif

CC ?= clang
CFLAGS ?= -O2
CFLAGS += -std=c11 -Wall -Wextra -Werror -fPIC -fvisibility=hidden
CFLAGS += -I$(SAMEBOY_BUILD)/include
LDFLAGS += -flto
LDLIBS += -lm -ldl

.PHONY: all sameboy clean smoke

all: $(NATIVE)

sameboy: $(SAMEBOY_LIB) $(SAMEBOY_BOOT)

$(SAMEBOY_LIB) $(SAMEBOY_BOOT):
	@command -v cppp >/dev/null || { echo "Missing cppp. On macOS: brew install cppp"; exit 1; }
	@command -v rgbasm >/dev/null || { echo "Missing RGBDS. On macOS: brew install rgbds"; exit 1; }
	$(MAKE) -C $(SAMEBOY) lib bootroms CONF=release

$(NATIVE): harness/grokboy.c harness/grokboy.h $(SAMEBOY_LIB) $(SAMEBOY_BOOT)
	@mkdir -p bin
	$(CC) $(CFLAGS) $(LDFLAGS) $(SHARED_FLAGS) harness/grokboy.c \
		$(SAMEBOY_LIB) $(LDLIBS) -o $@

smoke: $(NATIVE)
	python3 agent/breakout_smoke.py

clean:
	rm -f bin/sameboy-harness bin/libgrokboy.dylib bin/libgrokboy.so
	$(MAKE) -C $(SAMEBOY) clean
