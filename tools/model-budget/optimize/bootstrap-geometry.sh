#!/usr/bin/env bash
#
# bootstrap-geometry.sh — install the geometry-decimation dependencies IN
# ISOLATION, so the offline optimiser's --geometry stage can run without adding
# anything to the workspace.
#
# WHY ISOLATED. @gltf-transform/core, @gltf-transform/functions and meshoptimizer
# are NOT workspace dependencies. Adding them to any package.json would rewrite
# pnpm-lock.yaml — which several sessions share — and would break
# `pnpm install --frozen-lockfile` in CI until the lockfile was regenerated. So
# they go into tools/model-budget/.optvendor via plain npm (its own node_modules
# + package-lock), which pnpm neither sees nor manages. A symlink from
# optimize/node_modules makes Node resolve them for optimize/decimate.mjs.
#
# The packages are pure JS/wasm (no native build) and install in a few seconds.
# Everything here is under node_modules / a git-ignored vendor dir, so it never
# reaches the shipping tree.
#
# Usage:  bash tools/model-budget/optimize/bootstrap-geometry.sh
set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"   # tools/model-budget
VENDOR="$HERE/.optvendor"

mkdir -p "$VENDOR"
if [ ! -f "$VENDOR/package.json" ]; then
  printf '{\n  "name": "model-budget-optvendor",\n  "private": true,\n  "description": "Isolated geometry-decimation deps for the offline optimiser. Not a workspace member."\n}\n' > "$VENDOR/package.json"
fi

# Pinned to the versions the tool was verified against; fall back to the majors.
if ! npm install --prefix "$VENDOR" --no-audit --no-fund --loglevel=error \
      @gltf-transform/core@4.4.1 @gltf-transform/functions@4.4.1 meshoptimizer@1.2.0 ; then
  echo "pinned install failed — trying the current majors" >&2
  npm install --prefix "$VENDOR" --no-audit --no-fund --loglevel=error \
      "@gltf-transform/core@^4" "@gltf-transform/functions@^4" meshoptimizer
fi

# Make Node resolve the vendored deps for optimize/decimate.mjs.
ln -sfn ../.optvendor/node_modules "$HERE/optimize/node_modules"

echo "geometry deps installed in $VENDOR (isolated; pnpm-lock.yaml untouched)."
echo "the optimiser's --geometry stage is now available."
