#!/bin/bash
# Fast dev build using esbuild for all workspace packages.
# Skips type checking entirely — use `yarn tsc -b` separately for that.
set -e

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
SERVER="$ROOT/packages/apollo-collaboration-server"

COMMON_OPTS="--format=esm --platform=node --target=es2023 --sourcemap --packages=external --log-level=warning"

build_pkg() {
  local pkg_dir="$ROOT/packages/$1"
  cd "$SERVER"
  yarn esbuild $(find "$pkg_dir/src" -name '*.ts' ! -name '*.test.ts' ! -name '*.spec.ts') \
    --outdir="$pkg_dir/dist" --outbase="$pkg_dir/src" $COMMON_OPTS
}

# Build in dependency order
# apollo-common and apollo-mst have no internal deps
build_pkg apollo-common
build_pkg apollo-mst
# apollo-entities depends on apollo-common
build_pkg apollo-entities
# apollo-shared depends on apollo-common, apollo-mst
build_pkg apollo-shared
# server depends on all of the above
build_pkg apollo-collaboration-server
