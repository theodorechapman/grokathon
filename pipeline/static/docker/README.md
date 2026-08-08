# staticre container

Reproducible, host-independent staticre backend: JDK 21 + Ghidra 11.4.2 +
GhidraBoy + the staticre package. The ROM is **not** baked in — it is a
runtime input via a bind mount, so one image analyzes any Game Boy ROM.

## Build

```sh
pipeline/static/docker/build.sh          # tags staticre:local
```

First build downloads Ghidra (~456 MB) and pins GhidraBoy; the image is ~2.7 GB.

## Run

Modes are chosen by the trailing argument (`mcp` is the default):

```sh
# stdio MCP server — what the agent spawns (note -i for stdio)
docker run --rm -i \
  -v /abs/path/rom.gb:/rom.gb:ro \
  -v /abs/path/ghidra_work:/work \
  staticre:local mcp

# one-shot: exercise every op against the ROM
docker run --rm -v /abs/path/rom.gb:/rom.gb:ro staticre:local smoke

# JSON-lines backend
docker run --rm -i -v /abs/path/rom.gb:/rom.gb:ro staticre:local serve
```

- `/rom.gb` — the ROM (read-only mount). Override the path with
  `-e STATICRE_ROM=/somewhere.gb` if you mount elsewhere.
- `/work` — persists the Ghidra project + evidence sidecar across runs.

## Use from the harness

```sh
python pipeline/harness/run_agent.py --rom <rom> --mcp docker
```

The harness blinds the ROM on the host, then wires the agent's MCP config to
`docker run` this image with the blinded ROM mounted read-only and the
per-workspace `ghidra_work/` mounted at `/work`. The agent stays on the host
(its auth lives there); only the heavy Ghidra backend is containerized.
