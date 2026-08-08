GBDK_HOME ?= /opt/gbdk
LCC ?= $(GBDK_HOME)/bin/lcc
NPM ?= npm

TARGET := breakout-reconstructed.gb
SOURCES := main.c assets.c
VERIFY_FRAMES ?= 2000
WEB_ROM := web/$(TARGET)
WEB_INSTALL_STAMP := web/node_modules/.package-lock.json
WEB_PORT ?= 8000

.PHONY: all clean verify web build-web serve-web

all: $(TARGET)

$(TARGET): $(SOURCES) assets.h
	@test -x "$(LCC)" || { \
		echo "GBDK compiler not found at $(LCC)"; \
		echo "Set GBDK_HOME or LCC, for example: make GBDK_HOME=/path/to/gbdk"; \
		exit 1; \
	}
	"$(LCC)" -o "$@" $(SOURCES)

verify: $(TARGET)
	$(MAKE) -C .. bin/sameboy-harness
	python3 differential_test.py --frames "$(VERIFY_FRAMES)"

web: $(WEB_ROM) $(WEB_INSTALL_STAMP)

$(WEB_ROM): $(TARGET)
	cp "$<" "$@"

$(WEB_INSTALL_STAMP): web/package.json web/package-lock.json
	$(NPM) --prefix web ci

build-web: web
	$(NPM) --prefix web run build

serve-web: web
	$(NPM) --prefix web run dev -- --port "$(WEB_PORT)"

clean:
	rm -f "$(TARGET)" "$(WEB_ROM)" *.asm *.cdb *.ihx *.lk *.lst *.map *.noi *.o *.sym
