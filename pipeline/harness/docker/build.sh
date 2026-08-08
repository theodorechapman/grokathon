#!/usr/bin/env bash
# Build the agent-in-a-box image. Requires the staticre:local base image
# (build it first: pipeline/static/docker/build.sh). Build context is the repo
# root so the Dockerfile can COPY both pipeline/harness and .claude/skills.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$here/../../.." && pwd)"
tag="${1:-staticre-agent:local}"

docker image inspect staticre:local >/dev/null 2>&1 || {
    echo "base image staticre:local missing; building it first..."
    "$repo/pipeline/static/docker/build.sh"
}

echo "building $tag from $repo ..."
exec docker build -f "$here/Dockerfile" -t "$tag" "$repo"
