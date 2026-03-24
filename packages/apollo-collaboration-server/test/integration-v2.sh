#!/usr/bin/env bash
# Integration test for the MikroORM (v2) backend.
# Starts the server, uploads a GFF3, creates an assembly,
# and verifies that assemblies, refSeqs, features, changes,
# and sequence data are all correct.
#
# Usage: cd packages/apollo-collaboration-server && bash test/integration-v2.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER_DIR="$(dirname "$SCRIPT_DIR")"
BASE_URL="http://localhost:3999"
SERVER_PID=""
PASS=0
FAIL=0
ERRORS=""

cleanup() {
  if [ -n "$SERVER_PID" ]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  rm -f "$SERVER_DIR/apollo-dev.sqlite"
}
trap cleanup EXIT

assert_eq() {
  local label="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo "  PASS: $label"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $label (expected '$expected', got '$actual')"
    FAIL=$((FAIL + 1))
    ERRORS="$ERRORS\n  - $label: expected '$expected', got '$actual'"
  fi
}

assert_ge() {
  local label="$1" expected="$2" actual="$3"
  if [ "$actual" -ge "$expected" ] 2>/dev/null; then
    echo "  PASS: $label"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $label (expected >= $expected, got '$actual')"
    FAIL=$((FAIL + 1))
    ERRORS="$ERRORS\n  - $label: expected >= $expected, got '$actual'"
  fi
}

json_field() {
  python3 -c "import sys,json; print(json.load(sys.stdin)$1)" 2>/dev/null
}

json_len() {
  python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null
}

echo "=== Integration Test: MikroORM (v2) Backend ==="
echo ""

# --- Start server ---
echo "Starting server..."
cd "$SERVER_DIR"
rm -f apollo-dev.sqlite
NODE_ENV=development node dist/main.js > /tmp/apollo-integration-test.log 2>&1 &
SERVER_PID=$!

# Wait for server to be ready
for _ in $(seq 1 15); do
  if curl -sf "$BASE_URL/health" > /dev/null 2>&1; then
    break
  fi
  sleep 1
done

# --- Health ---
echo ""
echo "[1/11] Health check"
HEALTH=$(curl -sf "$BASE_URL/health" | json_field "['status']")
assert_eq "health status" "ok" "$HEALTH"

# --- Auth ---
echo ""
echo "[2/11] Authentication"
TOKEN=$(curl -s -X POST "$BASE_URL/auth/root" \
  -H 'Content-Type: application/json' \
  -d '{"username":"root_user","password":"password"}' | json_field "['token']")
assert_ge "token length" 10 "${#TOKEN}"

# --- Create assembly ---
echo ""
echo "[3/11] Create assembly via change (using file paths)"
GFF3_PATH="$SCRIPT_DIR/data/tiny.fasta.gff3"
FASTA_PATH="$SCRIPT_DIR/data/tiny.fasta"
FAI_PATH="$SCRIPT_DIR/data/tiny.fasta.fai"
CHANGE_RESULT=$(curl -s -X POST "$BASE_URL/changes" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{
    \"typeName\": \"AddAssemblyAndFeaturesFromFileChange\",
    \"assembly\": \"test_assembly_1\",
    \"assemblyName\": \"tiny_test\",
    \"gff3Path\": \"$GFF3_PATH\",
    \"fastaPath\": \"$FASTA_PATH\",
    \"faiPath\": \"$FAI_PATH\"
  }")
CHANGE_ID=$(echo "$CHANGE_RESULT" | json_field "['_id']")
CHANGE_TYPE=$(echo "$CHANGE_RESULT" | json_field "['typeName']")
assert_ge "change ID length" 10 "${#CHANGE_ID}"
assert_eq "change typeName" "AddAssemblyAndFeaturesFromFileChange" "$CHANGE_TYPE"

# --- Verify assemblies ---
echo ""
echo "[4/11] Verify assemblies"
ASM_COUNT=$(curl -sf "$BASE_URL/assemblies" -H "Authorization: Bearer $TOKEN" | json_len)
ASM_NAME=$(curl -sf "$BASE_URL/assemblies" -H "Authorization: Bearer $TOKEN" | json_field "[0]['name']")
ASM_STATUS=$(curl -sf "$BASE_URL/assemblies" -H "Authorization: Bearer $TOKEN" | json_field "[0]['status']")
assert_eq "assembly count" "1" "$ASM_COUNT"
assert_eq "assembly name" "tiny_test" "$ASM_NAME"
assert_eq "assembly status (activated)" "0" "$ASM_STATUS"

# --- Verify refSeqs ---
echo ""
echo "[5/11] Verify reference sequences"
REFSEQS=$(curl -sf "$BASE_URL/refSeqs" -H "Authorization: Bearer $TOKEN")
RS_COUNT=$(echo "$REFSEQS" | json_len)
RS_NAMES=$(echo "$REFSEQS" | python3 -c "import sys,json; print(','.join(sorted(r['name'] for r in json.load(sys.stdin))))")
RS_STATUS=$(echo "$REFSEQS" | python3 -c "import sys,json; print(set(r['status'] for r in json.load(sys.stdin)))")
assert_eq "refSeq count" "3" "$RS_COUNT"
assert_eq "refSeq names" "ctgA,ctgB,ctgC" "$RS_NAMES"
assert_eq "refSeq status (all activated)" "{0}" "$RS_STATUS"

# --- Verify features ---
echo ""
echo "[6/11] Verify features"
FEATURES=$(curl -sf "$BASE_URL/features" -H "Authorization: Bearer $TOKEN")
F_COUNT=$(echo "$FEATURES" | json_len)
F_WITH_PARENTS=$(echo "$FEATURES" | python3 -c "
import sys,json
print(sum(1 for f in json.load(sys.stdin) if f.get('parentId')))
")
assert_eq "feature count" "14" "$F_COUNT"
assert_eq "features with parents" "7" "$F_WITH_PARENTS"

# --- Verify changes ---
echo ""
echo "[7/11] Verify changes"
CHANGES=$(curl -sf "$BASE_URL/changes" -H "Authorization: Bearer $TOKEN")
CH_COUNT=$(echo "$CHANGES" | json_len)
assert_eq "change count" "1" "$CH_COUNT"

# --- Sequence ---
echo ""
echo "[8/11] Sequence retrieval"
# Get the first refSeq ID (ctgA)
CTGA_ID=$(echo "$REFSEQS" | python3 -c "import sys,json; rs=json.load(sys.stdin); print(next(r['_id'] for r in rs if r['name']=='ctgA'))")
SEQ_RESULT=$(curl -sf "$BASE_URL/sequence?refSeq=$CTGA_ID&start=0&end=10" -H "Authorization: Bearer $TOKEN")
SEQ_LEN=$(echo "$SEQ_RESULT" | python3 -c "import sys; print(len(sys.stdin.read().strip().strip('\"')))")
assert_eq "sequence length for 0-10" "10" "$SEQ_LEN"

SEQ_RESULT2=$(curl -sf "$BASE_URL/sequence?refSeq=$CTGA_ID&start=20&end=30" -H "Authorization: Bearer $TOKEN")
SEQ_LEN2=$(echo "$SEQ_RESULT2" | python3 -c "import sys; print(len(sys.stdin.read().strip().strip('\"')))")
assert_eq "sequence length for 20-30" "10" "$SEQ_LEN2"

# --- Export ---
echo ""
echo "[9/11] GFF3 export"
EXPORT_ID=$(curl -sf "$BASE_URL/export/getID?assembly=test_assembly_1" -H "Authorization: Bearer $TOKEN" | json_field "['exportID']")
assert_ge "export ID length" 5 "${#EXPORT_ID}"

GFF3_OUTPUT=$(curl -sf "$BASE_URL/export?exportID=$EXPORT_ID" -H "Authorization: Bearer $TOKEN")
GFF3_HEADER=$(echo "$GFF3_OUTPUT" | head -1)
GFF3_SEQREGION_COUNT=$(echo "$GFF3_OUTPUT" | grep -c "^##sequence-region" || true)
assert_eq "GFF3 header" "##gff-version 3" "$GFF3_HEADER"
assert_eq "GFF3 sequence-region count" "3" "$GFF3_SEQREGION_COUNT"

# Export with FASTA
GFF3_FASTA=$(curl -sf "$BASE_URL/export?exportID=$EXPORT_ID&includeFASTA=true" -H "Authorization: Bearer $TOKEN")
HAS_FASTA=$(echo "$GFF3_FASTA" | grep -c "^##FASTA" || true)
FASTA_SEQS=$(echo "$GFF3_FASTA" | grep -c "^>" || true)
assert_eq "export includes FASTA section" "1" "$HAS_FASTA"
assert_eq "FASTA sequence count" "3" "$FASTA_SEQS"

# --- Feature queries ---
echo ""
echo "[10/11] Feature queries"
# getFeatures by range
RANGE_FEATURES=$(curl -sf "$BASE_URL/features/getFeatures?refSeq=$CTGA_ID&start=0&end=50" -H "Authorization: Bearer $TOKEN")
RF_COUNT=$(echo "$RANGE_FEATURES" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "error")
assert_ge "features in range 0-50" 1 "$RF_COUNT"

# feature count
FEAT_COUNT=$(curl -sf "$BASE_URL/features/count?assemblyId=test_assembly_1" -H "Authorization: Bearer $TOKEN" | json_field "['count']")
assert_ge "feature count endpoint" 1 "$FEAT_COUNT"

# search (searches type field with LIKE)
SEARCH_RESULT=$(curl -sf "$BASE_URL/features/searchFeatures?term=gene&assemblies=test_assembly_1" -H "Authorization: Bearer $TOKEN")
SEARCH_COUNT=$(echo "$SEARCH_RESULT" | json_len)
assert_ge "search for gene" 1 "$SEARCH_COUNT"

# --- JBrowse config ---
echo ""
echo "[11/11] JBrowse config"
JBROWSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/jbrowse/config.json" -H "Authorization: Bearer $TOKEN")
JB_HTTP_CODE=$(echo "$JBROWSE" | tail -1)
JB_BODY=$(echo "$JBROWSE" | sed '$d')
JB_HAS_CONFIG=$(echo "$JB_BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print('yes' if 'configuration' in d else 'no')" 2>/dev/null || echo "no")
assert_eq "jbrowse config HTTP status" "200" "$JB_HTTP_CODE"
assert_eq "jbrowse config has configuration key" "yes" "$JB_HAS_CONFIG"

# --- Summary ---
echo ""
echo "==============================="
echo "Results: $PASS passed, $FAIL failed"
if [ "$FAIL" -gt 0 ]; then
  echo -e "Failures:$ERRORS"
  exit 1
fi
echo "All tests passed!"
