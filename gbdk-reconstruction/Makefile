GBDK_HOME ?= /opt/gbdk
LCC ?= $(GBDK_HOME)/bin/lcc

TARGET := breakout-reconstructed.gb
SOURCES := main.c assets.c
VERIFY_FRAMES ?= 2000

.PHONY: all clean verify

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

clean:
	rm -f "$(TARGET)" *.asm *.cdb *.ihx *.lk *.lst *.map *.noi *.o *.sym
