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

# 5. Database setup
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

# 6. Start server
echo '[start] Starting server...'
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
# 7. Auto-detect Tiberius if installed at common location
if [ -z "${TIBERIUS_PATH:-}" ]; then
  for tpath in "$HOME/src/Tiberius/tiberius.py" "$HOME/Tiberius/tiberius.py" "/opt/Tiberius/tiberius.py"; do
    if [ -f "$tpath" ]; then
      export TIBERIUS_PATH="$tpath"
      echo "[start] Auto-detected Tiberius at $tpath"
      break
    fi
  done
fi

JBROWSE_STATIC_DIR="$JBROWSE_DIR" \
  PLUGIN_LOCATION="/jbrowse/apollo-plugin.js" \
  FEATURE_TYPE_ONTOLOGY_LOCATION="/jbrowse/so-v3.1.json" \
  NODE_ENV=development \
  exec node --watch-path dist dist/main.js
