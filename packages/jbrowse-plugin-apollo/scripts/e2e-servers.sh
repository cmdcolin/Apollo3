#!/bin/bash
# E2E test lifecycle management — build, start servers, run tests, stop servers
#
# Usage:
#   ./scripts/e2e-servers.sh test     - Build everything, start server, run Playwright tests, stop server
#   ./scripts/e2e-servers.sh start    - Build everything, start server (for manual test runs)
#   ./scripts/e2e-servers.sh stop     - Stop running server
#   ./scripts/e2e-servers.sh status   - Check server status
#   ./scripts/e2e-servers.sh logs     - Tail the server log
#
# Database backend (default: sqlite):
#   DB_BACKEND=postgresql DB_CONNECTION_URL=postgresql://user:pass@localhost:5432/apollo_e2e \
#     ./scripts/e2e-servers.sh test

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PID_FILE="$SCRIPT_DIR/.e2e-pids"
LOG_FILE="$SCRIPT_DIR/.e2e-server.log"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

COLLAB_PORT=3999

kill_by_pidfile() {
  if [ -f "$PID_FILE" ]; then
    while read -r pid; do
      if kill -0 "$pid" 2>/dev/null; then
        kill "$pid" 2>/dev/null
      fi
    done < "$PID_FILE"
    sleep 1
    while read -r pid; do
      if kill -0 "$pid" 2>/dev/null; then
        kill -9 "$pid" 2>/dev/null
      fi
    done < "$PID_FILE"
    rm -f "$PID_FILE"
  fi
}

kill_by_port() {
  local pids
  pids=$(lsof -ti:"$COLLAB_PORT" 2>/dev/null) || true
  if [ -n "$pids" ]; then
    echo "$pids" | xargs kill 2>/dev/null || true
    sleep 1
    pids=$(lsof -ti:"$COLLAB_PORT" 2>/dev/null) || true
    if [ -n "$pids" ]; then
      echo "$pids" | xargs kill -9 2>/dev/null || true
    fi
  fi
}

stop_servers() {
  echo "Stopping e2e servers..."
  kill_by_pidfile
  kill_by_port
  echo "Servers stopped."
}

check_status() {
  if lsof -ti:"$COLLAB_PORT" >/dev/null 2>&1; then
    echo "collab (port $COLLAB_PORT): running (pid $(lsof -ti:$COLLAB_PORT 2>/dev/null | head -1))"
  else
    echo "collab (port $COLLAB_PORT): stopped"
  fi
}

wait_for_servers() {
  local max_wait=60
  local waited=0
  while [ $waited -lt $max_wait ]; do
    if curl -sf "http://localhost:$COLLAB_PORT/health" >/dev/null 2>&1; then
      echo "Server ready (${waited}s)"
      return 0
    fi
    sleep 2
    waited=$((waited + 2))
    if [ $((waited % 10)) -eq 0 ]; then
      echo "Waiting for server... (${waited}s)"
    fi
  done
  echo "ERROR: Server did not start within ${max_wait}s"
  echo "--- Server log ---"
  tail -20 "$LOG_FILE" 2>/dev/null
  echo "--- End server log ---"
  check_status
  return 1
}

build_all() {
  echo "=== Building all packages ==="
  cd "$REPO_ROOT"

  echo "Building shared packages (apollo-common, apollo-entities, apollo-shared)..."
  yarn tsc -b --force

  echo "Building collaboration server..."
  cd "$REPO_ROOT/packages/apollo-collaboration-server"
  yarn tsc -b --force

  echo "Building entities (separate tsconfig)..."
  cd "$REPO_ROOT/packages/apollo-entities"
  yarn tsc -b --force

  echo "Building JBrowse plugin..."
  cd "$REPO_ROOT/packages/jbrowse-plugin-apollo"
  yarn build

  echo "=== Build complete ==="
}

reset_database() {
  local db_backend="${DB_BACKEND:-sqlite}"
  if [ "$db_backend" = "postgresql" ]; then
    local url="${DB_CONNECTION_URL:?DB_CONNECTION_URL required for postgresql}"
    echo "Resetting PostgreSQL database..."
    psql "$url" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" 2>/dev/null || true
  else
    rm -f "$REPO_ROOT/packages/apollo-collaboration-server/apollo-dev.sqlite"
  fi
}

start_servers() {
  stop_servers

  rm -f "$LOG_FILE"
  reset_database

  echo "Starting e2e server..."
  echo "Server log: $LOG_FILE"

  cd "$SCRIPT_DIR" || exit 1

  # Copy built plugin and ontology into .jbrowse/ so they're served from
  # the same origin as JBrowse
  cp dist/jbrowse-plugin-apollo.umd.development.js .jbrowse/apollo-plugin.js
  cp test_data/so-v3.1.json .jbrowse/so-v3.1.json

  # Copy test data files so remote URL tests can reference them
  mkdir -p .jbrowse/test_data
  cp test_data/volvox.fa.gz .jbrowse/test_data/
  cp test_data/volvox.fa.gz.fai .jbrowse/test_data/
  cp test_data/volvox.fa.gz.gzi .jbrowse/test_data/

  # Single server: NestJS serves both the API and JBrowse static files.
  # JBROWSE_STATIC_DIR tells the server where to find the JBrowse web app.
  cd "$REPO_ROOT/packages/apollo-collaboration-server" || exit 1
  DB_BACKEND="${DB_BACKEND:-sqlite}" DB_CONNECTION_URL="${DB_CONNECTION_URL:-apollo-dev.sqlite}" \
    JBROWSE_STATIC_DIR="$SCRIPT_DIR/.jbrowse" \
    PLUGIN_LOCATION="/jbrowse/apollo-plugin.js" \
    FEATURE_TYPE_ONTOLOGY_LOCATION="/jbrowse/so-v3.1.json" \
    GUEST_USER_ROLE=admin LOG_LEVELS=error,warn,log NODE_ENV=development yarn node dist/main.js \
    >> "$LOG_FILE" 2>&1 &
  echo $! >> "$PID_FILE"

  cd "$SCRIPT_DIR" || exit 1

  if wait_for_servers; then
    echo "E2E server started."
    check_status
  else
    echo "Server startup failed. Cleaning up..."
    stop_servers
    exit 1
  fi
}

run_tests() {
  build_all
  start_servers

  echo ""
  echo "=== Running Playwright tests ==="
  local exit_code=0
  cd "$SCRIPT_DIR"
  yarn playwright test "$@" || exit_code=$?

  echo ""
  stop_servers

  if [ $exit_code -eq 0 ]; then
    echo "All tests passed."
  else
    echo "Tests failed (exit code $exit_code). Server log: $LOG_FILE"
  fi
  exit $exit_code
}

show_logs() {
  if [ -f "$LOG_FILE" ]; then
    tail -f "$LOG_FILE"
  else
    echo "No log file found at $LOG_FILE"
  fi
}

case "${1:-status}" in
  test)   shift; run_tests "$@" ;;
  start)  build_all; start_servers ;;
  stop)   stop_servers ;;
  status) check_status ;;
  logs)   show_logs ;;
  *)      echo "Usage: $0 {test|start|stop|status|logs}" ;;
esac
