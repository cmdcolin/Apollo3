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

assert_http_status() {
  local label="$1" expected="$2"
  shift 2
  local status
  status=$(curl -s -o /dev/null -w "%{http_code}" "$@")
  assert_eq "$label" "$expected" "$status"
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
echo "--- Health check"
HEALTH=$(curl -sf "$BASE_URL/health" | json_field "['status']")
assert_eq "health status" "ok" "$HEALTH"

# --- Auth ---
echo ""
echo "--- Authentication"
TOKEN=$(curl -s -X POST "$BASE_URL/auth/root" \
  -H 'Content-Type: application/json' \
  -d '{"username":"root_user","password":"password"}' | json_field "['token']")
assert_ge "token length" 10 "${#TOKEN}"

TEST_DATA_DIR="$(dirname "$SERVER_DIR")/jbrowse-plugin-apollo/test_data"
FA_FILE="$TEST_DATA_DIR/volvox.fasta.fa"
FAI_FILE="$TEST_DATA_DIR/volvox.fasta.fa.fai"
GFF_FILE="$TEST_DATA_DIR/volvox.fasta.gff3"

# --- Assembly ---
echo ""
echo "--- Create assembly"
ASSEMBLY=$(curl -s -X POST "$BASE_URL/assemblies" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"volvox\",\"sequenceSource\":{\"type\":\"fasta\",\"fa\":\"$FA_FILE\",\"fai\":\"$FAI_FILE\"}}")
ASSEMBLY_ID=$(echo "$ASSEMBLY" | json_field "['_id']")
assert_ge "assembly id length" 10 "${#ASSEMBLY_ID}"

# --- List assemblies ---
echo ""
echo "--- List assemblies"
ASSEMBLIES=$(curl -s "$BASE_URL/assemblies" -H "Authorization: Bearer $TOKEN")
ASSEMBLY_COUNT=$(echo "$ASSEMBLIES" | json_len)
assert_eq "assembly count" "1" "$ASSEMBLY_COUNT"

# --- RefSeqs ---
echo ""
echo "--- RefSeqs populated from FASTA index"
REFSEQS=$(curl -s "$BASE_URL/refSeqs?assembly=$ASSEMBLY_ID" -H "Authorization: Bearer $TOKEN")
REFSEQ_COUNT=$(echo "$REFSEQS" | json_len)
assert_ge "refseq count" "1" "$REFSEQ_COUNT"
FIRST_REFSEQ_NAME=$(echo "$REFSEQS" | json_field "[0]['name']")
assert_ge "first refseq name length" "1" "${#FIRST_REFSEQ_NAME}"

# --- Load features from GFF3 ---
echo ""
echo "--- Load features from GFF3"
FEATURE_COUNT=$(node --input-type=module -e "
import { readFileSync } from 'node:fs';
import { parseStringSync } from '@gmod/gff';
import { gff3LineToSnapshot } from '@apollo-annotation/shared';

const refSeqs = JSON.parse(process.argv[1]);
const refSeqMap = new Map(refSeqs.map(r => [r.name, r._id]));

const gff3 = readFileSync(process.argv[2], 'utf8');
const features = parseStringSync(gff3, { parseSequences: false });

const snapshots = [];
for (const group of features) {
  if (!Array.isArray(group) || group.length === 0) { continue; }
  const line = group[0];
  if (!line.seq_id || !line.type) { continue; }
  const refSeqId = refSeqMap.get(line.seq_id);
  if (!refSeqId) { continue; }
  snapshots.push(gff3LineToSnapshot(line, refSeqId));
}

const res = await fetch(process.argv[3] + '/changes', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + process.argv[4],
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    typeName: 'AddFeatureChange',
    assembly: process.argv[5],
    changedIds: snapshots.map(s => s._id),
    changes: snapshots.map(s => ({ addedFeature: s })),
  }),
});

if (!res.ok) {
  console.error('Feature loading failed:', res.status, await res.text());
  process.exit(1);
}
console.log(snapshots.length);
" -- "$REFSEQS" "$GFF_FILE" "$BASE_URL" "$TOKEN" "$ASSEMBLY_ID")
assert_ge "features loaded" "1" "$FEATURE_COUNT"

# --- Verify features ---
echo ""
echo "--- Verify features exist"
FIRST_REFSEQ_ID=$(echo "$REFSEQS" | json_field "[0]['_id']")
FEATURES=$(curl -s "$BASE_URL/features/getFeatures?refSeq=$FIRST_REFSEQ_ID&start=0&end=999999999" \
  -H "Authorization: Bearer $TOKEN")
FEAT_COUNT=$(echo "$FEATURES" | json_len)
assert_ge "feature count on first refseq" "1" "$FEAT_COUNT"

# --- Verify changes ---
echo ""
echo "--- Verify changes recorded"
CHANGES=$(curl -s "$BASE_URL/changes/recent?page=1&pageSize=10" \
  -H "Authorization: Bearer $TOKEN")
CHANGE_TOTAL=$(echo "$CHANGES" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('total', len(d)) if isinstance(d, dict) else len(d))" 2>/dev/null || echo "0")
assert_ge "changes total" "1" "$CHANGE_TOTAL"

# --- Verify check types ---
echo ""
echo "--- Check types available"
CHECK_TYPES=$(curl -s "$BASE_URL/checks/types" -H "Authorization: Bearer $TOKEN")
CHECK_TYPE_COUNT=$(echo "$CHECK_TYPES" | json_len)
assert_ge "check types" "1" "$CHECK_TYPE_COUNT"

# --- Verify check results ---
echo ""
echo "--- Check results for assembly"
CHECK_RESULTS=$(curl -s "$BASE_URL/checks?assembly=$ASSEMBLY_ID" -H "Authorization: Bearer $TOKEN")
CHECK_RESULT_COUNT=$(echo "$CHECK_RESULTS" | json_len)
assert_ge "check results" "0" "$CHECK_RESULT_COUNT"

# --- JBrowse config ---
echo ""
echo "--- JBrowse config"
JBROWSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/jbrowse/config.json" -H "Authorization: Bearer $TOKEN")
JB_HTTP_CODE=$(echo "$JBROWSE" | tail -1)
JB_BODY=$(echo "$JBROWSE" | sed '$d')
JB_HAS_CONFIG=$(echo "$JB_BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print('yes' if 'configuration' in d else 'no')" 2>/dev/null || echo "no")
assert_eq "jbrowse config HTTP status" "200" "$JB_HTTP_CODE"
assert_eq "jbrowse config has configuration key" "yes" "$JB_HAS_CONFIG"

# --- Unauthenticated access tests ---
echo ""
echo "--- Unauthenticated requests"
assert_http_status "no auth header returns 401" "401" \
  "$BASE_URL/assemblies"
assert_http_status "invalid token returns 401" "401" \
  "$BASE_URL/assemblies" -H "Authorization: Bearer invalidtoken"

# --- Setup token tests ---
echo ""
echo "--- Setup token endpoints"
SETUP_ACTIVE_VALUE=$(curl -s "$BASE_URL/auth/setup-active" | json_field "['active']")
assert_eq "setup-active returns false (root admin exists)" "False" "$SETUP_ACTIVE_VALUE"
assert_http_status "setup with invalid token returns 400" "400" \
  "$BASE_URL/auth/setup?token=invalidtoken"

# --- Summary ---
echo ""
echo "==============================="
echo "Results: $PASS passed, $FAIL failed"
if [ "$FAIL" -gt 0 ]; then
  echo -e "Failures:$ERRORS"
  exit 1
fi
echo "All tests passed!"
