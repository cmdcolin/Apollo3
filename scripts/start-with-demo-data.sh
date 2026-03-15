#!/bin/bash
# Start a dev Apollo3 instance with demo assemblies configured.
#
# Usage:
#   ./scripts/start-with-demo-data.sh           # build, start, configure
#   ./scripts/start-with-demo-data.sh --no-build # skip build step
#   ./scripts/start-with-demo-data.sh --reset    # force fresh database
#
# Configures assemblies (no data imported into DB):
#   - volvox (bgzip FASTA served from test_data/ via static dir)
#   - hg38  (remote bgzip FASTA + GFF3 from jbrowse.org)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COLLAB_DIR="$REPO_ROOT/packages/apollo-collaboration-server"
PLUGIN_DIR="$REPO_ROOT/packages/jbrowse-plugin-apollo"
LOG_FILE="$REPO_ROOT/.demo-server.log"
COLLAB_PORT=3999
API_BASE="http://127.0.0.1:$COLLAB_PORT"

# hg38 remote files (hosted by jbrowse.org)
HG38_FA="https://jbrowse.org/genomes/GRCh38/fasta/hg38.prefix.fa.gz"
HG38_FAI="https://jbrowse.org/genomes/GRCh38/fasta/hg38.prefix.fa.gz.fai"
HG38_GZI="https://jbrowse.org/genomes/GRCh38/fasta/hg38.prefix.fa.gz.gzi"

# Cached admin token (set after setup)
ADMIN_TOKEN=""

# --- Parse flags ---
NO_BUILD=false
FORCE_RESET=false
for arg in "$@"; do
  case "$arg" in
    --no-build) NO_BUILD=true ;;
    --reset)    FORCE_RESET=true ;;
    *)          echo "Unknown flag: $arg"; exit 1 ;;
  esac
done

# --- Helpers ---

rand_hex_id() {
  python3 -c "import secrets; print(secrets.token_hex(12))"
}

wait_for_server() {
  local max_wait=60 waited=0
  while [ $waited -lt $max_wait ]; do
    if curl -sf "$API_BASE/health" >/dev/null 2>&1; then
      echo "Server ready (${waited}s)"
      return 0
    fi
    sleep 2
    waited=$((waited + 2))
  done
  echo "ERROR: Server did not start within ${max_wait}s"
  tail -20 "$LOG_FILE" 2>/dev/null
  return 1
}

setup_admin() {
  # Use root login (always admin) for data loading
  echo "Logging in as root user..."
  ADMIN_TOKEN="$(curl -sf -X POST \
    -H "Content-Type: application/json" \
    -d '{"password":"demo-admin-pass"}' \
    "$API_BASE/auth/root" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")"
  echo "Root admin login OK."
}

post_change() {
  local json="$1"
  curl -sf \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$json" \
    "$API_BASE/changes"
}

check_assembly_exists() {
  local name="$1"
  local assemblies
  assemblies="$(curl -sf -H "Authorization: Bearer $ADMIN_TOKEN" "$API_BASE/assemblies")" || true
  if [ -z "$assemblies" ]; then
    echo "no"
    return
  fi
  echo "$assemblies" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for a in data:
    if a.get('name') == '$name':
        print('yes')
        sys.exit(0)
print('no')
"
}

# --- Build ---

if [ "$NO_BUILD" = false ]; then
  echo "=== Building all packages ==="
  cd "$REPO_ROOT"
  echo "Building shared packages..."
  yarn tsc -b
  echo "Building collaboration server..."
  cd "$COLLAB_DIR" && yarn tsc -b
  echo "Building entities..."
  cd "$REPO_ROOT/packages/apollo-entities" && yarn tsc -b
  echo "Building JBrowse plugin..."
  cd "$PLUGIN_DIR" && yarn build
  echo "=== Build complete ==="
else
  echo "Skipping build (--no-build)"
fi

# --- Reset database if requested ---

if [ "$FORCE_RESET" = true ]; then
  echo "Resetting database (--reset)..."
  rm -f "$COLLAB_DIR/apollo-dev.sqlite"
fi

# --- Start server ---

existing_pids=$(lsof -ti:"$COLLAB_PORT" 2>/dev/null) || true
if [ -n "$existing_pids" ]; then
  echo "Stopping existing server on port $COLLAB_PORT..."
  echo "$existing_pids" | xargs kill 2>/dev/null || true
  sleep 1
fi

echo "Starting collaboration server on port $COLLAB_PORT..."
rm -f "$LOG_FILE"

# Copy plugin, ontology, and volvox FASTA into .jbrowse/ for static serving
mkdir -p "$PLUGIN_DIR/.jbrowse/test_data"
cp "$PLUGIN_DIR/dist/jbrowse-plugin-apollo.umd.development.js" "$PLUGIN_DIR/.jbrowse/apollo-plugin.js" 2>/dev/null || true
cp "$PLUGIN_DIR/test_data/so-v3.1.json" "$PLUGIN_DIR/.jbrowse/so-v3.1.json" 2>/dev/null || true
cp "$PLUGIN_DIR/test_data/volvox.fa.gz" "$PLUGIN_DIR/.jbrowse/test_data/" 2>/dev/null || true
cp "$PLUGIN_DIR/test_data/volvox.fa.gz.fai" "$PLUGIN_DIR/.jbrowse/test_data/" 2>/dev/null || true
cp "$PLUGIN_DIR/test_data/volvox.fa.gz.gzi" "$PLUGIN_DIR/.jbrowse/test_data/" 2>/dev/null || true

cd "$COLLAB_DIR"
ALLOW_GUEST_USER=true \
  ALLOW_ROOT_USER=true \
  ROOT_USER_PASSWORD=demo-admin-pass \
  DEFAULT_NEW_USER_ROLE=readOnly \
  JBROWSE_STATIC_DIR="$PLUGIN_DIR/.jbrowse" \
  PLUGIN_LOCATION="/apollo-plugin.js" \
  FEATURE_TYPE_ONTOLOGY_LOCATION="/so-v3.1.json" \
  LOG_LEVELS=error,warn,log \
  NODE_ENV=development \
  yarn node dist/main.js >> "$LOG_FILE" 2>&1 &
SERVER_PID=$!
echo "Server PID: $SERVER_PID"
echo "$SERVER_PID" > "$REPO_ROOT/.demo-server.pid"

if ! wait_for_server; then
  echo "Server failed to start. Check $LOG_FILE"
  exit 1
fi

# --- Set up admin user ---

setup_admin

# --- Configure demo assemblies ---

# ── Volvox (local FASTA served via static dir) ──

if [ "$(check_assembly_exists volvox)" = "yes" ]; then
  echo "Assembly 'volvox' already exists, skipping."
else
  echo ""
  echo "=== Configuring volvox ==="
  VOLVOX_ID="$(rand_hex_id)"
  post_change "{
    \"typeName\": \"AddAssemblyFromFileChange\",
    \"assembly\": \"$VOLVOX_ID\",
    \"assemblyName\": \"volvox\",
    \"sequenceSource\": {
      \"type\": \"external\",
      \"fa\": \"http://127.0.0.1:$COLLAB_PORT/jbrowse/test_data/volvox.fa.gz\",
      \"fai\": \"http://127.0.0.1:$COLLAB_PORT/jbrowse/test_data/volvox.fa.gz.fai\",
      \"gzi\": \"http://127.0.0.1:$COLLAB_PORT/jbrowse/test_data/volvox.fa.gz.gzi\"
    }
  }" > /dev/null
  echo "  volvox configured."
fi

# ── hg38 (remote FASTA from jbrowse.org) ──

if [ "$(check_assembly_exists hg38)" = "yes" ]; then
  echo "Assembly 'hg38' already exists, skipping."
else
  echo ""
  echo "=== Configuring hg38 ==="
  HG38_ID="$(rand_hex_id)"
  post_change "{
    \"typeName\": \"AddAssemblyFromFileChange\",
    \"assembly\": \"$HG38_ID\",
    \"assemblyName\": \"hg38\",
    \"sequenceSource\": {
      \"type\": \"external\",
      \"fa\": \"$HG38_FA\",
      \"fai\": \"$HG38_FAI\",
      \"gzi\": \"$HG38_GZI\"
    }
  }" > /dev/null
  echo "  hg38 configured."
fi

# --- Summary ---

echo ""
echo "============================================"
echo "  Demo instance ready!"
echo "  URL: http://localhost:$COLLAB_PORT"
echo "  Server PID: $SERVER_PID"
echo "  Log: $LOG_FILE"
echo ""
echo "  Assemblies configured:"
echo "    - volvox (local FASTA via static serving)"
echo "    - hg38   (remote FASTA from jbrowse.org)"
echo ""
echo "  To stop: kill $SERVER_PID"
echo "============================================"

# Keep script running so Ctrl+C stops the server
trap "echo 'Stopping server...'; kill $SERVER_PID 2>/dev/null; exit 0" INT TERM
wait $SERVER_PID
