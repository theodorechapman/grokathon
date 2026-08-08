# Agent-in-a-box: the staticre backend (JDK + Ghidra + GhidraBoy + staticre)
# plus the Codex CLI, bun, and the harness. A run is fully self-contained: the
# staticre MCP runs as a subprocess *inside* this container (--mcp local). The
# ROM is a bind-mount input; the workspace is written to a mounted /out.
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

# bun, so the agent can build/serve/test the playable app it writes
RUN curl -fsSL https://bun.sh/install | bash \
    && ln -s /root/.bun/bin/bun /usr/local/bin/bun

# staticre project lives at /opt/staticre in the base image; the harness expects
# it at PIPELINE/static, so lay out /opt/pipeline accordingly.
# Build context is the repo root. PIPELINE=/opt/pipeline, REPO=/opt, so the
# skill must land at /opt/.claude/skills/... where the harness resolves it.
RUN mkdir -p /opt/pipeline && ln -s /opt/staticre /opt/pipeline/static
COPY pipeline/harness /opt/pipeline/harness
COPY .claude/skills/static-re /opt/.claude/skills/static-re

ENV STATICRE_ROM=/rom.gb
VOLUME ["/out"]

COPY pipeline/harness/docker/entrypoint.sh /usr/local/bin/agent-entrypoint.sh
RUN chmod +x /usr/local/bin/agent-entrypoint.sh
ENTRYPOINT ["/usr/local/bin/agent-entrypoint.sh"]
