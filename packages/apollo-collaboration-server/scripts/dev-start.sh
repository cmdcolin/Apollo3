#!/bin/bash
# Dev start: build everything, set up JBrowse, seed demo data, start server.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
COLLAB_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$COLLAB_DIR/../.." && pwd)"
PLUGIN_DIR="$REPO_ROOT/packages/jbrowse-plugin-apollo"
JBROWSE_DIR="$PLUGIN_DIR/.jbrowse"

cd "$COLLAB_DIR"

# 1. Build server (esbuild, fast)
echo '[start] Building server...'
pnpm dev:build

# 2. Build client pages (Vite)
echo '[start] Building client pages...'
pnpm build:client

# 3. Set up JBrowse web app if not present
if [ ! -f "$JBROWSE_DIR/index.html" ]; then
  echo '[start] Installing JBrowse web app...'
  cd "$PLUGIN_DIR"
  pnpm setup
  cd "$COLLAB_DIR"
fi

# 4. Build plugin and copy into JBrowse dir
if [ ! -f "$JBROWSE_DIR/apollo-plugin.js" ] || [ ! -f "$PLUGIN_DIR/dist/jbrowse-plugin-apollo.umd.development.js" ]; then
  echo '[start] Building JBrowse plugin...'
  cd "$PLUGIN_DIR"
  pnpm build
  cd "$COLLAB_DIR"
fi
cp "$PLUGIN_DIR/dist/jbrowse-plugin-apollo.umd.development.js" "$JBROWSE_DIR/apollo-plugin.js"
cp "$PLUGIN_DIR/test_data/so-v3.1.json" "$JBROWSE_DIR/so-v3.1.json"

# 5. Seed demo database if none exists
if [ ! -f apollo-dev.sqlite ]; then
  echo '[start] Seeding demo database...'
  cp "$REPO_ROOT/demo-data/demo.sqlite" apollo-dev.sqlite 2>/dev/null || true
fi

# 6. Start server
echo '[start] Starting server...'
JBROWSE_STATIC_DIR="$JBROWSE_DIR" \
  PLUGIN_LOCATION="/jbrowse/apollo-plugin.js" \
  FEATURE_TYPE_ONTOLOGY_LOCATION="/jbrowse/so-v3.1.json" \
  NODE_ENV=development \
  exec node --watch-path dist dist/main.js
