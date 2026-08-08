#!/usr/bin/env bash
# Build the staticre analysis image. Run from anywhere.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
context="$(dirname "$here")"   # pipeline/static
tag="${1:-staticre:local}"
echo "building $tag from $context ..."
exec docker build -f "$here/Dockerfile" -t "$tag" "$context"
