#!/bin/bash
# Regenerate the pre-built demo SQLite database (demo-data/demo.sqlite).
#
# Run this after schema changes to keep the demo DB in sync.
# Requires a built server (run `pnpm tsc -b` etc. first).
#
# Creates assemblies with external FASTA references:
#   - volvox (local FASTA via static serving)
#   - hg38   (remote bgzip FASTA from jbrowse.org)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COLLAB_DIR="$REPO_ROOT/packages/apollo-collaboration-server"
PLUGIN_DIR="$REPO_ROOT/packages/jbrowse-plugin-apollo"
LOG_FILE="/tmp/apollo-demo-regen.log"
COLLAB_PORT=3998  # Use a different port to avoid conflicts
API_BASE="http://127.0.0.1:$COLLAB_PORT"

HG38_FA="https://jbrowse.org/genomes/GRCh38/fasta/hg38.prefix.fa.gz"
HG38_FAI="https://jbrowse.org/genomes/GRCh38/fasta/hg38.prefix.fa.gz.fai"
HG38_GZI="https://jbrowse.org/genomes/GRCh38/fasta/hg38.prefix.fa.gz.gzi"

cleanup() {
  local pids
  pids=$(lsof -ti:"$COLLAB_PORT" 2>/dev/null) || true
  if [ -n "$pids" ]; then
    echo "$pids" | xargs kill 2>/dev/null || true
  fi
}
trap cleanup EXIT

rand_hex_id() {
  python3 -c "import secrets; print(secrets.token_hex(12))"
}

echo "=== Regenerating demo database ==="

# Clean slate
rm -f "$COLLAB_DIR/apollo-regen.sqlite"
rm -f "$LOG_FILE"

# Copy volvox FASTA for static serving
mkdir -p "$PLUGIN_DIR/.jbrowse/test_data"
cp "$PLUGIN_DIR/test_data/volvox.fa.gz" "$PLUGIN_DIR/.jbrowse/test_data/" 2>/dev/null || true
cp "$PLUGIN_DIR/test_data/volvox.fa.gz.fai" "$PLUGIN_DIR/.jbrowse/test_data/" 2>/dev/null || true
cp "$PLUGIN_DIR/test_data/volvox.fa.gz.gzi" "$PLUGIN_DIR/.jbrowse/test_data/" 2>/dev/null || true

# Start server on alternate port with temporary DB
cd "$COLLAB_DIR"
PORT=$COLLAB_PORT \
  DB_CONNECTION_URL=apollo-regen.sqlite \
  ALLOW_ROOT_USER=true \
  ROOT_USER_PASSWORD=pass \
  ALLOW_GUEST_USER=true \
  DEFAULT_NEW_USER_ROLE=admin \
  JBROWSE_STATIC_DIR="$PLUGIN_DIR/.jbrowse" \
  PLUGIN_LOCATION="/apollo-plugin.js" \
  FEATURE_TYPE_ONTOLOGY_LOCATION="/so-v3.1.json" \
  LOG_LEVELS=error,warn \
  NODE_ENV=development \
  node dist/main.js >> "$LOG_FILE" 2>&1 &

# Wait for server
max_wait=60 waited=0
while [ $waited -lt $max_wait ]; do
  if curl -sf "$API_BASE/health" >/dev/null 2>&1; then
    echo "Server ready (${waited}s)"
    break
  fi
  sleep 2
  waited=$((waited + 2))
done
if [ $waited -ge $max_wait ]; then
  echo "ERROR: Server did not start"
  tail -20 "$LOG_FILE"
  exit 1
fi

# Login as root
TOKEN="$(curl -sf -X POST \
  -H "Content-Type: application/json" \
  -d '{"password":"pass"}' \
  "$API_BASE/auth/root" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")"
echo "Logged in as root."

post_change() {
  curl -sf \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$1" \
    "$API_BASE/changes" > /dev/null
}

# Add volvox
echo "Adding volvox assembly..."
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
}"
echo "  volvox OK."

# Add hg38
echo "Adding hg38 assembly..."
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
}"
echo "  hg38 OK."

# Stop server and save DB
cleanup
sleep 1

mkdir -p "$REPO_ROOT/demo-data"
mv "$COLLAB_DIR/apollo-regen.sqlite" "$REPO_ROOT/demo-data/demo.sqlite"
echo ""
echo "Demo database saved to demo-data/demo.sqlite"
ls -lh "$REPO_ROOT/demo-data/demo.sqlite"
