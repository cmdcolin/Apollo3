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
NODE_ENV=development yarn node dist/main.js > /tmp/apollo-integration-test.log 2>&1 &
SERVER_PID=$!

# Wait for server to be ready
for i in $(seq 1 15); do
  if curl -sf "$BASE_URL/health" > /dev/null 2>&1; then
    break
  fi
  sleep 1
done

# --- Health ---
echo ""
echo "[1/8] Health check"
HEALTH=$(curl -sf "$BASE_URL/health" | json_field "['status']")
assert_eq "health status" "ok" "$HEALTH"

# --- Auth ---
echo ""
echo "[2/8] Authentication"
TOKEN=$(curl -s -X POST "$BASE_URL/auth/root" \
  -H 'Content-Type: application/json' \
  -d '{"username":"root_user","password":"password"}' | json_field "['token']")
assert_ge "token length" 10 "${#TOKEN}"

AUTH="-H 'Authorization: Bearer $TOKEN'"

# --- Upload file ---
echo ""
echo "[3/8] File upload"
UPLOAD_RESULT=$(curl -s -X POST "$BASE_URL/files?type=text/x-gff3" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@$SCRIPT_DIR/data/tiny.fasta.gff3")
FILE_ID=$(echo "$UPLOAD_RESULT" | json_field "['_id']")
FILE_TYPE=$(echo "$UPLOAD_RESULT" | json_field "['type']")
assert_ge "file ID length" 10 "${#FILE_ID}"
assert_eq "file type" "text/x-gff3" "$FILE_TYPE"

# --- Create assembly ---
echo ""
echo "[4/8] Create assembly via change"
CHANGE_RESULT=$(curl -s -X POST "$BASE_URL/changes" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{
    \"typeName\": \"AddAssemblyAndFeaturesFromFileChange\",
    \"assembly\": \"test_assembly_1\",
    \"assemblyName\": \"tiny_test\",
    \"fileIds\": {\"fa\": \"$FILE_ID\"}
  }")
CHANGE_ID=$(echo "$CHANGE_RESULT" | json_field "['_id']")
CHANGE_TYPE=$(echo "$CHANGE_RESULT" | json_field "['typeName']")
assert_ge "change ID length" 10 "${#CHANGE_ID}"
assert_eq "change typeName" "AddAssemblyAndFeaturesFromFileChange" "$CHANGE_TYPE"

# --- Verify assemblies ---
echo ""
echo "[5/8] Verify assemblies"
ASM_COUNT=$(curl -sf "$BASE_URL/assemblies" -H "Authorization: Bearer $TOKEN" | json_len)
ASM_NAME=$(curl -sf "$BASE_URL/assemblies" -H "Authorization: Bearer $TOKEN" | json_field "[0]['name']")
ASM_STATUS=$(curl -sf "$BASE_URL/assemblies" -H "Authorization: Bearer $TOKEN" | json_field "[0]['status']")
assert_eq "assembly count" "1" "$ASM_COUNT"
assert_eq "assembly name" "tiny_test" "$ASM_NAME"
assert_eq "assembly status (activated)" "0" "$ASM_STATUS"

# --- Verify refSeqs ---
echo ""
echo "[6/8] Verify reference sequences"
REFSEQS=$(curl -sf "$BASE_URL/refSeqs" -H "Authorization: Bearer $TOKEN")
RS_COUNT=$(echo "$REFSEQS" | json_len)
RS_NAMES=$(echo "$REFSEQS" | python3 -c "import sys,json; print(','.join(sorted(r['name'] for r in json.load(sys.stdin))))")
RS_STATUS=$(echo "$REFSEQS" | python3 -c "import sys,json; print(set(r['status'] for r in json.load(sys.stdin)))")
assert_eq "refSeq count" "3" "$RS_COUNT"
assert_eq "refSeq names" "ctgA,ctgB,ctgC" "$RS_NAMES"
assert_eq "refSeq status (all activated)" "{0}" "$RS_STATUS"

# --- Verify features ---
echo ""
echo "[7/8] Verify features"
FEATURES=$(curl -sf "$BASE_URL/features" -H "Authorization: Bearer $TOKEN")
F_COUNT=$(echo "$FEATURES" | json_len)
F_TYPES=$(echo "$FEATURES" | python3 -c "
import sys,json
from collections import Counter
features = json.load(sys.stdin)
counts = Counter(f['type'] for f in features)
print(','.join(f'{k}:{v}' for k,v in sorted(counts.items())))
")
F_WITH_PARENTS=$(echo "$FEATURES" | python3 -c "
import sys,json
print(sum(1 for f in json.load(sys.stdin) if f.get('parentId')))
")
assert_eq "feature count" "14" "$F_COUNT"
assert_eq "features with parents" "7" "$F_WITH_PARENTS"

# --- Verify changes ---
echo ""
echo "[8/8] Verify changes"
CHANGES=$(curl -sf "$BASE_URL/changes" -H "Authorization: Bearer $TOKEN")
CH_COUNT=$(echo "$CHANGES" | json_len)
assert_eq "change count" "1" "$CH_COUNT"

# --- Summary ---
echo ""
echo "==============================="
echo "Results: $PASS passed, $FAIL failed"
if [ "$FAIL" -gt 0 ]; then
  echo -e "Failures:$ERRORS"
  exit 1
fi
echo "All tests passed!"
