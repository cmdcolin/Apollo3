#!/bin/bash
# Regenerate the pre-built demo SQLite database (demo-data/demo.sqlite).
#
# Run this after schema changes to keep the demo DB in sync.
# Requires a built server: pnpm -C packages/apollo-collaboration-server dev:build
#
# Creates:
#   - volvox assembly with GFF3 annotations (chunked sequence in DB)
#   - Evidence tracks: BAM alignments, VCF variants, BigWig, CRAM
#
# Usage:
#   bash scripts/regenerate-demo-db.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COLLAB_DIR="$REPO_ROOT/packages/apollo-collaboration-server"
LOG_FILE="/tmp/apollo-demo-regen.log"
COLLAB_PORT=3998
API_BASE="http://127.0.0.1:$COLLAB_PORT"
GFF3_FILE="$DEMO_DATA_DIR/volvox/volvox-genes.gff3"
DEMO_DATA_DIR="$REPO_ROOT/demo-data"
VOLVOX_DATA_DIR="$DEMO_DATA_DIR/volvox"

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

# Verify prerequisites
if [ ! -f "$COLLAB_DIR/dist/main.js" ]; then
  echo "ERROR: Server not built. Run: pnpm -C packages/apollo-collaboration-server dev:build"
  exit 1
fi
if [ ! -f "$GFF3_FILE" ]; then
  echo "ERROR: GFF3 file not found at $GFF3_FILE"
  exit 1
fi

# Clean slate
rm -f "$COLLAB_DIR/apollo-regen.sqlite"
rm -f "$LOG_FILE"

# Start server on alternate port with temporary DB
cd "$COLLAB_DIR"
PORT=$COLLAB_PORT \
  URL="http://127.0.0.1:$COLLAB_PORT" \
  DB_CONNECTION_URL=apollo-regen.sqlite \
  ALLOW_ROOT_USER=true \
  ROOT_USER_PASSWORD=pass \
  ALLOW_GUEST_USER=true \
  GUEST_USER_ROLE=readOnly \
  DEFAULT_NEW_USER_ROLE=none \
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

# Get auth token via root login (root is always admin)
TOKEN="$(curl -sf -X POST -H 'Content-Type: application/json' \
  -d '{"password":"pass"}' "$API_BASE/auth/root" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")"
echo "Authenticated as root."

AUTH_HEADER="Authorization: Bearer $TOKEN"

# --- Upload GFF3 and create volvox assembly with annotations ---

echo "Uploading volvox GFF3..."
FILE_ID="$(curl -sf \
  -H "$AUTH_HEADER" \
  -F "file=@$GFF3_FILE" \
  "$API_BASE/files?type=text/x-gff3" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['_id'])")"
echo "  File uploaded: $FILE_ID"

VOLVOX_ID="$(rand_hex_id)"
echo "Adding volvox assembly with features (id=$VOLVOX_ID)..."
curl -sf \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  -d "{
    \"typeName\": \"AddAssemblyAndFeaturesFromFileChange\",
    \"assembly\": \"$VOLVOX_ID\",
    \"assemblyName\": \"volvox\",
    \"sequenceSource\": { \"type\": \"chunked\", \"fa\": \"$FILE_ID\" }
  }" \
  "$API_BASE/changes" > /dev/null
echo "  volvox assembly created."

# Set volvox as public so it's visible without login
echo "Setting volvox assembly to public visibility..."
curl -sf \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  -X PATCH \
  -d '{"visibility": "public"}' \
  "$API_BASE/assemblies/$VOLVOX_ID/visibility" > /dev/null
echo "  visibility set to public."

# Create a default organism and assign volvox to it
echo "Creating Volvox carteri organism..."
ORGANISM_ID="$(curl -sf \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  -d '{"genus": "Volvox", "species": "carteri", "commonName": "Volvox", "description": "Multicellular green alga"}' \
  -X POST \
  "$API_BASE/organisms" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['_id'])")"
echo "  organism created: $ORGANISM_ID"

echo "Assigning volvox assembly to organism..."
curl -sf \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  -X PATCH \
  -d "{\"organism\": \"$ORGANISM_ID\"}" \
  "$API_BASE/assemblies/$VOLVOX_ID/organism" > /dev/null
echo "  assembly assigned to organism."

# --- Add evidence tracks ---

# All track data files are served from demo-data/volvox/ via JBROWSE_STATIC_DIR
# when running the demo. The URIs here use relative paths that resolve against
# the JBrowse static root.

add_track() {
  local TRACK_ID="$1"
  local CONFIG="$2"
  echo "  Adding track: $TRACK_ID"
  curl -sf \
    -H "$AUTH_HEADER" \
    -H "Content-Type: application/json" \
    -d "{
      \"trackId\": \"$TRACK_ID\",
      \"assemblyIds\": [\"$VOLVOX_ID\"],
      \"config\": $CONFIG
    }" \
    "$API_BASE/tracks" > /dev/null
}

echo "Adding evidence tracks..."

add_track "volvox_alignments" '{
  "type": "AlignmentsTrack",
  "trackId": "volvox_alignments",
  "name": "volvox-sorted.bam",
  "category": ["Alignments"],
  "assemblyNames": ["volvox"],
  "adapter": {
    "type": "BamAdapter",
    "bamLocation": { "uri": "volvox/volvox-sorted.bam", "locationType": "UriLocation" },
    "index": { "location": { "uri": "volvox/volvox-sorted.bam.bai", "locationType": "UriLocation" } }
  }
}'

add_track "volvox_cram" '{
  "type": "AlignmentsTrack",
  "trackId": "volvox_cram",
  "name": "volvox-sorted-altname.cram",
  "category": ["Alignments"],
  "assemblyNames": ["volvox"],
  "adapter": {
    "type": "CramAdapter",
    "cramLocation": { "uri": "volvox/volvox-sorted-altname.cram", "locationType": "UriLocation" },
    "craiLocation": { "uri": "volvox/volvox-sorted-altname.cram.crai", "locationType": "UriLocation" }
  }
}'

add_track "volvox_long_reads" '{
  "type": "AlignmentsTrack",
  "trackId": "volvox_long_reads",
  "name": "volvox long reads (CRAM)",
  "category": ["Alignments"],
  "assemblyNames": ["volvox"],
  "adapter": {
    "type": "CramAdapter",
    "cramLocation": { "uri": "volvox/volvox-long-reads-sv.cram", "locationType": "UriLocation" },
    "craiLocation": { "uri": "volvox/volvox-long-reads-sv.cram.crai", "locationType": "UriLocation" }
  }
}'

add_track "volvox_vcf" '{
  "type": "VariantTrack",
  "trackId": "volvox_vcf",
  "name": "volvox variants",
  "category": ["Variants"],
  "assemblyNames": ["volvox"],
  "adapter": {
    "type": "VcfTabixAdapter",
    "vcfGzLocation": { "uri": "volvox/volvox.test.vcf.gz", "locationType": "UriLocation" },
    "index": { "location": { "uri": "volvox/volvox.test.vcf.gz.tbi", "locationType": "UriLocation" } }
  }
}'

add_track "volvox_filtered_vcf" '{
  "type": "VariantTrack",
  "trackId": "volvox_filtered_vcf",
  "name": "volvox filtered variants",
  "category": ["Variants"],
  "assemblyNames": ["volvox"],
  "adapter": {
    "type": "VcfTabixAdapter",
    "vcfGzLocation": { "uri": "volvox/volvox.filtered.vcf.gz", "locationType": "UriLocation" },
    "index": { "location": { "uri": "volvox/volvox.filtered.vcf.gz.tbi", "locationType": "UriLocation" } }
  }
}'

add_track "volvox_bigwig" '{
  "type": "QuantitativeTrack",
  "trackId": "volvox_bigwig",
  "name": "volvox microarray",
  "category": ["Quantitative"],
  "assemblyNames": ["volvox"],
  "adapter": {
    "type": "BigWigAdapter",
    "bigWigLocation": { "uri": "volvox/volvox_microarray.bw", "locationType": "UriLocation" }
  }
}'

add_track "volvox_paired_rnaseq" '{
  "type": "AlignmentsTrack",
  "trackId": "volvox_paired_rnaseq",
  "name": "volvox paired RNA-seq",
  "category": ["RNA-seq"],
  "assemblyNames": ["volvox"],
  "adapter": {
    "type": "BamAdapter",
    "bamLocation": { "uri": "volvox/paired_rnaseq.bam", "locationType": "UriLocation" },
    "index": { "location": { "uri": "volvox/paired_rnaseq.bam.bai", "locationType": "UriLocation" } }
  }
}'

add_track "volvox_stranded_rnaseq" '{
  "type": "AlignmentsTrack",
  "trackId": "volvox_stranded_rnaseq",
  "name": "volvox stranded RNA-seq",
  "category": ["RNA-seq"],
  "assemblyNames": ["volvox"],
  "adapter": {
    "type": "BamAdapter",
    "bamLocation": { "uri": "volvox/paired_end_stranded_rnaseq.bam", "locationType": "UriLocation" },
    "index": { "location": { "uri": "volvox/paired_end_stranded_rnaseq.bam.bai", "locationType": "UriLocation" } }
  }
}'

add_track "volvox_gtf" '{
  "type": "FeatureTrack",
  "trackId": "volvox_gtf",
  "name": "volvox GTF",
  "category": ["Annotations"],
  "assemblyNames": ["volvox"],
  "adapter": {
    "type": "GtfAdapter",
    "gtfLocation": { "uri": "volvox/volvox.sorted.gtf.gz", "locationType": "UriLocation" },
    "index": { "location": { "uri": "volvox/volvox.sorted.gtf.gz.tbi", "locationType": "UriLocation" } }
  }
}'

add_track "volvox_bed12" '{
  "type": "FeatureTrack",
  "trackId": "volvox_bed12",
  "name": "volvox BED12",
  "category": ["Annotations"],
  "assemblyNames": ["volvox"],
  "adapter": {
    "type": "BedTabixAdapter",
    "bedGzLocation": { "uri": "volvox/volvox-bed12.bed.gz", "locationType": "UriLocation" },
    "index": { "location": { "uri": "volvox/volvox-bed12.bed.gz.tbi", "locationType": "UriLocation" } }
  }
}'

echo "  10 evidence tracks added."

# --- Checkpoint WAL and save DB ---

# Checkpoint WAL to merge data into main database file before copying
sqlite3 "$COLLAB_DIR/apollo-regen.sqlite" "PRAGMA wal_checkpoint(TRUNCATE);" 2>/dev/null || true

cleanup
sleep 1

rm -f "$COLLAB_DIR/apollo-regen.sqlite-wal" "$COLLAB_DIR/apollo-regen.sqlite-shm"
mv "$COLLAB_DIR/apollo-regen.sqlite" "$DEMO_DATA_DIR/demo.sqlite"
echo ""
echo "Demo database saved to demo-data/demo.sqlite"
ls -lh "$DEMO_DATA_DIR/demo.sqlite"
