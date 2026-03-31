#!/bin/bash
# Dev start: build everything, set up JBrowse, seed demo data, start server.
#
# Usage:
#   bash scripts/dev-start.sh [--persist] [--fresh]
#
#   (default) Use a fresh in-memory SQLite database, seeded with volvox data
#   --persist Use a persistent apollo-dev.sqlite file (copied from demo.sqlite if absent)
#   --fresh   Delete existing persistent database and re-seed from demo data
set -euo pipefail
export COREPACK_ENABLE_AUTO_INSTALL=0

PERSIST=false
FRESH=false
for arg in "$@"; do
  case "$arg" in
    --persist) PERSIST=true ;;
    --fresh)   FRESH=true ;;
    *) echo "Unknown option: $arg"; exit 1 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
COLLAB_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$COLLAB_DIR/../.." && pwd)"
PLUGIN_DIR="$REPO_ROOT/packages/jbrowse-plugin-apollo"
JBROWSE_DIR="$PLUGIN_DIR/.jbrowse"
VOLVOX_DIR="$JBROWSE_DIR/test_data/volvox"

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
pnpm --silent dev:build

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
if [ "$PERSIST" = true ]; then
  if [ "$FRESH" = true ]; then
    echo '[start] Deleting existing database for fresh start...'
    rm -f apollo-dev.sqlite
  fi
  if [ ! -f apollo-dev.sqlite ]; then
    echo '[start] Seeding demo database...'
    cp "$REPO_ROOT/demo-data/demo.sqlite" apollo-dev.sqlite 2>/dev/null || true
  fi
else
  echo '[start] Using in-memory SQLite database (fresh on every start)'
  export DB_CONNECTION_URL=':memory:'
  # Randomize secrets so stale browser cookies/JWTs don't resolve to missing users
  SESSION_SECRET="$(head -c 32 /dev/urandom | base64)"
  export SESSION_SECRET
  JWT_SECRET="$(head -c 32 /dev/urandom | base64)"
  export JWT_SECRET
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

SERVER_PORT="${PORT:-3999}"
VITE_PORT="${VITE_PORT:-5173}"
API_BASE="http://127.0.0.1:$SERVER_PORT"
SERVER_LOG=$(mktemp)

# Start NestJS server in background, tee output so we can extract the setup token
echo '[start] Starting server...'
JBROWSE_STATIC_DIR="$JBROWSE_DIR" \
  PLUGIN_LOCATION="/jbrowse/apollo-plugin.js" \
  FEATURE_TYPE_ONTOLOGY_LOCATION="/jbrowse/so-v3.1.json" \
  NODE_ENV=development \
  node --env-file=.development.env --no-warnings=ExperimentalWarning --watch-path dist dist/main.js 2>&1 \
  | tee "$SERVER_LOG" | grep -v -e '^SETUP_TOKEN=' -e 'Setup URL' &
NODE_PID=$!

cleanup() { kill "$NODE_PID" 2>/dev/null || true; rm -f "$SERVER_LOG"; }
trap cleanup EXIT INT TERM

# Seed volvox data into in-memory DB after server is ready
if [ "$PERSIST" = false ]; then
  # Wait for our server's SETUP_TOKEN to appear in the log — this proves *our*
  # new process is up, not a stale server that might be on the same port.
  max_wait=60 waited=0
  while [ $waited -lt $max_wait ]; do
    if grep -q 'SETUP_TOKEN=' "$SERVER_LOG" 2>/dev/null; then
      break
    fi
    sleep 1
    waited=$((waited + 1))
  done
  if [ $waited -ge $max_wait ]; then
    echo '[start] ERROR: server did not become ready in time'
  else
    # Create a dev admin account via the setup flow so the seed script can authenticate
    DEV_ADMIN_EMAIL="admin@apollo-dev.example"
    DEV_ADMIN_PASSWORD="devpass1"
    SETUP_TOKEN=$(grep -oP 'SETUP_TOKEN=\K.*' "$SERVER_LOG")
    curl -sf "$API_BASE/auth/setup?token=$SETUP_TOKEN" -o /dev/null
    curl -sf -X POST "$API_BASE/auth/setup-account" \
      -H 'Content-Type: application/json' \
      -d "{\"email\":\"$DEV_ADMIN_EMAIL\",\"username\":\"admin\",\"password\":\"$DEV_ADMIN_PASSWORD\"}" \
      -o /dev/null
    echo "[start] You can login as admin with: $DEV_ADMIN_EMAIL / $DEV_ADMIN_PASSWORD"
    echo "[start] Server ready (${waited}s), seeding volvox assembly..."
    ADMIN_EMAIL="$DEV_ADMIN_EMAIL" ADMIN_PASSWORD="$DEV_ADMIN_PASSWORD" \
      PORT="$SERVER_PORT" node --no-warnings=ExperimentalWarning --experimental-strip-types \
      "$SCRIPT_DIR/seed-volvox.ts" \
      "$VOLVOX_DIR/volvox.sort.gff3" \
      "$VOLVOX_DIR/volvox.fa" \
      "$VOLVOX_DIR/volvox.fa.fai"
  fi
fi

echo "[start] Starting Vite dev server (UI at http://localhost:$VITE_PORT)..."
exec pnpm --silent --filter @apollo-annotation/web-ui dev
