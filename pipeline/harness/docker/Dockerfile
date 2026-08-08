# Agent-in-a-box: the staticre backend (JDK + Ghidra + GhidraBoy + staticre)
# plus the Codex CLI, GBDK-2020, the harness, and the grokboy SameBoy bridge for
# dynamic analysis. A run is fully self-contained: the staticre MCP runs as a
# subprocess *inside* this container (--mcp local). The ROM is a bind-mount
# input; the workspace is written to a mounted /out.

# --- grokboy builder: SameBoy core + boot ROM + the native bridge ---
# SameBoy's build needs rgbds (boot ROM assembly) and cppp (a small C
# preprocessor by the SameBoy author, not packaged in Ubuntu — built from source).
FROM staticre:local AS grokboy-build
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends rgbds \
    && rm -rf /var/lib/apt/lists/*
ARG CPPP_URL=https://www.muppetlabs.com/~breadbox/pub/software/cppp-2.9.tar.gz
ARG CPPP_SHA256=76a95b46c3e36d55c0a98175c0aa72b17b219e68062c2c2c26f971e749951c07
RUN curl -fsSL "$CPPP_URL" -o /tmp/cppp.tar.gz \
    && echo "$CPPP_SHA256  /tmp/cppp.tar.gz" | sha256sum -c - \
    && mkdir /tmp/cppp && tar -xzf /tmp/cppp.tar.gz -C /tmp/cppp --strip-components=1 \
    && make -C /tmp/cppp && install -m 755 /tmp/cppp/cppp /usr/local/bin/cppp \
    && rm -rf /tmp/cppp /tmp/cppp.tar.gz
COPY pipeline/Makefile /build/pipeline/Makefile
COPY pipeline/harness/grokboy.c pipeline/harness/grokboy.h /build/pipeline/harness/
COPY pipeline/vendor/SameBoy /build/pipeline/vendor/SameBoy
RUN make -C /build/pipeline CC=gcc

FROM staticre:local

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
        git ripgrep xz-utils \
    && rm -rf /var/lib/apt/lists/*

# Codex CLI (static musl binary for arm64)
ARG CODEX_VERSION=0.146.0
ARG CODEX_URL=https://github.com/openai/codex/releases/download/rust-v0.146.0/codex-aarch64-unknown-linux-musl.tar.gz
RUN curl -fsSL "$CODEX_URL" -o /tmp/codex.tar.gz \
    && tar -xzf /tmp/codex.tar.gz -C /usr/local/bin \
    && (mv /usr/local/bin/codex-aarch64-unknown-linux-musl /usr/local/bin/codex 2>/dev/null || true) \
    && chmod +x /usr/local/bin/codex \
    && rm /tmp/codex.tar.gz

# GBDK-2020, so the agent can compile its raw-C reconstruction to a ROM
ARG GBDK_URL=https://github.com/gbdk-2020/gbdk-2020/releases/download/4.5.0/gbdk-linux-arm64.tar.gz
RUN curl -fsSL "$GBDK_URL" -o /tmp/gbdk.tar.gz \
    && tar -xzf /tmp/gbdk.tar.gz -C /opt \
    && rm /tmp/gbdk.tar.gz \
    && /opt/gbdk/bin/lcc -v

# staticre project lives at /opt/staticre in the base image; the harness expects
# it at PIPELINE/static, so lay out /opt/pipeline accordingly.
# Build context is the repo root. PIPELINE=/opt/pipeline, REPO=/opt, so the
# skill must land at /opt/.claude/skills/... where the harness resolves it.
RUN mkdir -p /opt/pipeline && ln -s /opt/staticre /opt/pipeline/static
COPY pipeline/harness /opt/pipeline/harness
COPY .claude/skills/static-re /opt/.claude/skills/static-re
COPY .claude/skills/dynamic-re /opt/.claude/skills/dynamic-re

# grokboy emulator bridge: sameboy.py resolves the library at <root>/bin and
# the boot ROM under <root>/vendor/..., with root = /opt/pipeline. No ROM is
# baked in — a named ROM in the image would unblind the agent's runs; the
# smoke test bind-mounts its ROM instead (see smoke.sh).
COPY pipeline/agent /opt/pipeline/agent
COPY pipeline/evaluator /opt/pipeline/evaluator
COPY --from=grokboy-build /build/pipeline/bin/libgrokboy.so /opt/pipeline/bin/libgrokboy.so
COPY --from=grokboy-build /build/pipeline/vendor/SameBoy/build/bin/BootROMs/dmg_boot.bin \
     /opt/pipeline/vendor/SameBoy/build/bin/BootROMs/dmg_boot.bin
COPY --from=grokboy-build /build/pipeline/vendor/SameBoy/build/bin/BootROMs/cgb_boot.bin \
     /opt/pipeline/vendor/SameBoy/build/bin/BootROMs/cgb_boot.bin

ENV STATICRE_ROM=/rom.gb
VOLUME ["/out"]

COPY pipeline/harness/docker/entrypoint.sh /usr/local/bin/agent-entrypoint.sh
RUN chmod +x /usr/local/bin/agent-entrypoint.sh
ENTRYPOINT ["/usr/local/bin/agent-entrypoint.sh"]
