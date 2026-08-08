# staticre analysis backend: JDK 21 + Ghidra 11.4.2 + GhidraBoy + the staticre
# package. Reproducible, host-independent. The ROM is NOT baked in — it is a
# runtime input via a bind mount + STATICRE_ROM (see entrypoint.sh).
FROM eclipse-temurin:21-jdk AS base

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 python3-venv curl unzip ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# uv for reproducible Python deps
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# --- Ghidra 11.4.2 + GhidraBoy (pinned; GhidraBoy supports up to 11.4.2) ---
ARG GHIDRA_URL=https://github.com/NationalSecurityAgency/ghidra/releases/download/Ghidra_11.4.2_build/ghidra_11.4.2_PUBLIC_20250826.zip
ARG GHIDRABOY_URL=https://github.com/Gekkio/GhidraBoy/releases/download/20250830/ghidra_11.4.2_PUBLIC_20250830_GhidraBoy.zip
RUN curl -fsSL "$GHIDRA_URL" -o /tmp/ghidra.zip \
    && unzip -q /tmp/ghidra.zip -d /opt \
    && curl -fsSL "$GHIDRABOY_URL" -o /tmp/ghidraboy.zip \
    && unzip -q /tmp/ghidraboy.zip -d /opt/ghidra_11.4.2_PUBLIC/Ghidra/Extensions/ \
    && rm /tmp/ghidra.zip /tmp/ghidraboy.zip
ENV GHIDRA_INSTALL_DIR=/opt/ghidra_11.4.2_PUBLIC

# --- staticre package + pinned deps ---
WORKDIR /opt/staticre
COPY pyproject.toml uv.lock README.md ./
COPY src ./src
RUN uv sync --frozen

# Runtime input defaults (override at `docker run` time)
ENV STATICRE_ROM=/rom.gb \
    STATICRE_WORKDIR=/work
VOLUME ["/work"]

COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["mcp"]
