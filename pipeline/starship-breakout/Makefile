GBDK_HOME ?= /opt/gbdk
LCC ?= $(GBDK_HOME)/bin/lcc

TARGET := starship-breakout.gb
SOURCES := main.c assets.c

.PHONY: all clean

all: $(TARGET)

$(TARGET): $(SOURCES) assets.h
	@test -x "$(LCC)" || { \
		echo "GBDK compiler not found at $(LCC)"; \
		echo "Set GBDK_HOME or LCC, for example: make GBDK_HOME=/path/to/gbdk"; \
		exit 1; \
	}
	"$(LCC)" -o "$@" $(SOURCES)

clean:
	rm -f "$(TARGET)" *.asm *.cdb *.ihx *.lk *.lst *.map *.noi *.o *.sym
