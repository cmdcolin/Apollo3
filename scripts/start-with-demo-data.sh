#!/bin/bash
# Start a dev Apollo3 instance with pre-loaded demo assemblies.
#
# Usage:
#   ./scripts/start-with-demo-data.sh           # build + start
#   ./scripts/start-with-demo-data.sh --no-build # skip build step
#
# Assemblies (configured with external FASTA, no data in DB):
#   - volvox (bgzip FASTA served locally from test_data/)
#   - hg38   (remote bgzip FASTA from jbrowse.org)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COLLAB_DIR="$REPO_ROOT/packages/apollo-collaboration-server"
PLUGIN_DIR="$REPO_ROOT/packages/jbrowse-plugin-apollo"
LOG_FILE="$REPO_ROOT/.demo-server.log"
COLLAB_PORT=3999

# --- Parse flags ---
NO_BUILD=false
for arg in "$@"; do
  case "$arg" in
    --no-build) NO_BUILD=true ;;
    *)          echo "Unknown flag: $arg"; exit 1 ;;
  esac
done

# --- Build ---

if [ "$NO_BUILD" = false ]; then
  echo "=== Building all packages ==="
  cd "$REPO_ROOT"
  echo "Building shared packages..."
  pnpm tsc -b
  echo "Building collaboration server..."
  cd "$COLLAB_DIR" && pnpm tsc -b
  echo "Building entities..."
  cd "$REPO_ROOT/packages/apollo-entities" && pnpm tsc -b
  echo "Building JBrowse plugin..."
  cd "$PLUGIN_DIR" && pnpm build
  echo "=== Build complete ==="
else
  echo "Skipping build (--no-build)"
fi

# --- Copy pre-built demo database ---

DEMO_DB="$REPO_ROOT/demo-data/demo.sqlite"
TARGET_DB="$COLLAB_DIR/apollo-dev.sqlite"

if [ ! -f "$DEMO_DB" ]; then
  echo "ERROR: Demo database not found at $DEMO_DB"
  echo "Run 'scripts/regenerate-demo-db.sh' to create it."
  exit 1
fi

cp "$DEMO_DB" "$TARGET_DB"
echo "Copied demo database to $TARGET_DB"

# --- Start server ---

existing_pids=$(lsof -ti:"$COLLAB_PORT" 2>/dev/null) || true
if [ -n "$existing_pids" ]; then
  echo "Stopping existing server on port $COLLAB_PORT..."
  echo "$existing_pids" | xargs kill 2>/dev/null || true
  sleep 1
fi

rm -f "$LOG_FILE"

# Copy plugin, ontology, and volvox FASTA into .jbrowse/ for static serving
mkdir -p "$PLUGIN_DIR/.jbrowse/test_data"
cp "$PLUGIN_DIR/dist/jbrowse-plugin-apollo.umd.development.js" "$PLUGIN_DIR/.jbrowse/apollo-plugin.js" 2>/dev/null || true
cp "$PLUGIN_DIR/test_data/so-v3.1.json" "$PLUGIN_DIR/.jbrowse/so-v3.1.json" 2>/dev/null || true
cp "$PLUGIN_DIR/test_data/volvox.fa.gz" "$PLUGIN_DIR/.jbrowse/test_data/" 2>/dev/null || true
cp "$PLUGIN_DIR/test_data/volvox.fa.gz.fai" "$PLUGIN_DIR/.jbrowse/test_data/" 2>/dev/null || true
cp "$PLUGIN_DIR/test_data/volvox.fa.gz.gzi" "$PLUGIN_DIR/.jbrowse/test_data/" 2>/dev/null || true

echo "Starting collaboration server on port $COLLAB_PORT..."
cd "$COLLAB_DIR"
ALLOW_GUEST_USER=true \
  ALLOW_ROOT_USER=true \
  ROOT_USER_PASSWORD=pass \
  DEFAULT_NEW_USER_ROLE=admin \
  JBROWSE_STATIC_DIR="$PLUGIN_DIR/.jbrowse" \
  PLUGIN_LOCATION="/apollo-plugin.js" \
  FEATURE_TYPE_ONTOLOGY_LOCATION="/so-v3.1.json" \
  LOG_LEVELS=error,warn,log \
  NODE_ENV=development \
  node dist/main.js >> "$LOG_FILE" 2>&1 &
SERVER_PID=$!
echo "$SERVER_PID" > "$REPO_ROOT/.demo-server.pid"

# Wait for server to be ready
max_wait=60 waited=0
while [ $waited -lt $max_wait ]; do
  if curl -sf "http://127.0.0.1:$COLLAB_PORT/health" >/dev/null 2>&1; then
    break
  fi
  sleep 2
  waited=$((waited + 2))
done

if [ $waited -ge $max_wait ]; then
  echo "ERROR: Server did not start within ${max_wait}s"
  tail -20 "$LOG_FILE" 2>/dev/null
  exit 1
fi

echo ""
echo "============================================"
echo "  Demo instance ready!"
echo "  URL: http://localhost:$COLLAB_PORT"
echo "  Server PID: $SERVER_PID"
echo "  Log: $LOG_FILE"
echo ""
echo "  Assemblies:"
echo "    - volvox (synthetic test organism)"
echo "    - hg38   (Human GRCh38, NCBI RefSeq)"
echo ""
echo "  Login: guest (auto-admin) or root/pass"
echo "  To stop: kill $SERVER_PID"
echo "============================================"

trap "echo 'Stopping server...'; kill $SERVER_PID 2>/dev/null; exit 0" INT TERM
wait $SERVER_PID
