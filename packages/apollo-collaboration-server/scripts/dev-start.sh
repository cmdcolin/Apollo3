#!/bin/bash
# Dev start: build everything, set up JBrowse, seed demo data, start server.
#
# Usage:
#   bash scripts/dev-start.sh [--fresh] [--memory]
#
#   --fresh   Delete existing database and re-seed from demo data
#   --memory  Use an in-memory SQLite database (no persistence across restarts)
#   --guest   Enable guest user with admin role
set -euo pipefail
export COREPACK_ENABLE_AUTO_INSTALL=0

FRESH=false
MEMORY=false
GUEST=false
for arg in "$@"; do
  case "$arg" in
    --fresh)  FRESH=true ;;
    --memory) MEMORY=true ;;
    --guest)  GUEST=true ;;
    *) echo "Unknown option: $arg"; exit 1 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
COLLAB_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$COLLAB_DIR/../.." && pwd)"
PLUGIN_DIR="$REPO_ROOT/packages/jbrowse-plugin-apollo"
JBROWSE_DIR="$PLUGIN_DIR/.jbrowse"

cd "$COLLAB_DIR"

# Ensure demo-data/volvox/ symlink exists so evidence track URIs and
# sequenceSource paths resolve correctly at runtime.
VOLVOX_LINK="$REPO_ROOT/demo-data/volvox"
if [ ! -e "$VOLVOX_LINK" ]; then
  echo '[start] Creating demo-data/volvox symlink to test_data/volvox...'
  mkdir -p "$REPO_ROOT/demo-data"
  ln -sf "$JBROWSE_DIR/test_data/volvox" "$VOLVOX_LINK"
fi

# Build server (esbuild, fast)
echo '[start] Building server...'
pnpm dev:build

# Set up JBrowse web app if not present
if [ ! -f "$JBROWSE_DIR/index.html" ]; then
  echo '[start] Installing JBrowse web app...'
  cd "$PLUGIN_DIR"
  pnpm run setup
  cd "$COLLAB_DIR"
fi

# Build plugin and copy into JBrowse dir
if [ ! -f "$JBROWSE_DIR/apollo-plugin.js" ] || [ ! -f "$PLUGIN_DIR/dist/jbrowse-plugin-apollo.umd.development.js" ]; then
  echo '[start] Building JBrowse plugin...'
  cd "$PLUGIN_DIR"
  pnpm build
  cd "$COLLAB_DIR"
fi
cp "$PLUGIN_DIR/dist/jbrowse-plugin-apollo.umd.development.js" "$JBROWSE_DIR/apollo-plugin.js"
cp "$PLUGIN_DIR/test_data/so-v3.1.json" "$JBROWSE_DIR/so-v3.1.json"

# Database setup
if [ "$MEMORY" = true ]; then
  echo '[start] Using in-memory SQLite database (no persistence)'
  export DB_CONNECTION_URL=':memory:'
elif [ "$FRESH" = true ]; then
  echo '[start] Deleting existing database for fresh start...'
  rm -f apollo-dev.sqlite
fi

if [ "$MEMORY" = false ] && [ ! -f apollo-dev.sqlite ]; then
  echo '[start] Seeding demo database...'
  cp "$REPO_ROOT/demo-data/demo.sqlite" apollo-dev.sqlite 2>/dev/null || true
fi

if [ "$GUEST" = true ]; then
  echo '[start] Guest user enabled with admin role'
  export ALLOW_GUEST_USER=true
  export GUEST_USER_ROLE=admin
fi

# In-memory mode: randomize session secret so stale browser cookies are
# automatically invalidated instead of resolving to a missing user.
if [ "$MEMORY" = true ]; then
  SESSION_SECRET="$(head -c 32 /dev/urandom | base64)"
  export SESSION_SECRET
fi

# Auto-detect Tiberius if installed at common location
if [ -z "${TIBERIUS_PATH:-}" ]; then
  for tpath in "$HOME/src/Tiberius/tiberius.py" "$HOME/Tiberius/tiberius.py" "/opt/Tiberius/tiberius.py"; do
    if [ -f "$tpath" ]; then
      export TIBERIUS_PATH="$tpath"
      echo "[start] Auto-detected Tiberius at $tpath"
      break
    fi
  done
fi

# Start NestJS server in background
echo '[start] Starting server...'
JBROWSE_STATIC_DIR="$JBROWSE_DIR" \
  PLUGIN_LOCATION="/jbrowse/apollo-plugin.js" \
  FEATURE_TYPE_ONTOLOGY_LOCATION="/jbrowse/so-v3.1.json" \
  NODE_ENV=development \
  node --watch-path dist dist/main.js &
NODE_PID=$!

cleanup() { kill "$NODE_PID" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

echo '[start] Starting Vite dev server (UI at http://localhost:5173)...'
exec pnpm --filter @apollo-annotation/web-ui dev
