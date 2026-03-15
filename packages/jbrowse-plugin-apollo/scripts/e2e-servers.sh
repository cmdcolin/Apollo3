#!/bin/bash
# E2E test lifecycle management — build, start servers, run tests, stop servers
#
# Usage:
#   ./scripts/e2e-servers.sh test     - Build everything, start servers, run Playwright tests, stop servers
#   ./scripts/e2e-servers.sh start    - Build everything, start servers (for manual test runs)
#   ./scripts/e2e-servers.sh stop     - Stop running servers
#   ./scripts/e2e-servers.sh status   - Check server status
#   ./scripts/e2e-servers.sh logs     - Tail the server log

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PID_FILE="$SCRIPT_DIR/.e2e-pids"
LOG_FILE="$SCRIPT_DIR/.e2e-server.log"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

PLUGIN_PORT=9000
JBROWSE_PORT=8999
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
  for port in $PLUGIN_PORT $JBROWSE_PORT $COLLAB_PORT; do
    local pids
    pids=$(lsof -ti:"$port" 2>/dev/null) || true
    if [ -n "$pids" ]; then
      echo "$pids" | xargs kill 2>/dev/null || true
    fi
  done
  sleep 1
  for port in $PLUGIN_PORT $JBROWSE_PORT $COLLAB_PORT; do
    local pids
    pids=$(lsof -ti:"$port" 2>/dev/null) || true
    if [ -n "$pids" ]; then
      echo "$pids" | xargs kill -9 2>/dev/null || true
    fi
  done
}

stop_servers() {
  echo "Stopping e2e servers..."
  kill_by_pidfile
  kill_by_port
  echo "Servers stopped."
}

check_status() {
  for port_name in "plugin:$PLUGIN_PORT" "jbrowse:$JBROWSE_PORT" "collab:$COLLAB_PORT"; do
    local name="${port_name%%:*}"
    local port="${port_name##*:}"
    if lsof -ti:"$port" >/dev/null 2>&1; then
      echo "$name (port $port): running (pid $(lsof -ti:$port 2>/dev/null | head -1))"
    else
      echo "$name (port $port): stopped"
    fi
  done
}

wait_for_servers() {
  local max_wait=60
  local waited=0
  while [ $waited -lt $max_wait ]; do
    local all_up=true
    for port in $PLUGIN_PORT $JBROWSE_PORT $COLLAB_PORT; do
      if ! lsof -ti:"$port" >/dev/null 2>&1; then
        all_up=false
        break
      fi
    done
    if $all_up; then
      if curl -sf "http://localhost:$COLLAB_PORT/health" >/dev/null 2>&1; then
        echo "All servers ready (${waited}s)"
        return 0
      fi
    fi
    sleep 2
    waited=$((waited + 2))
    if [ $((waited % 10)) -eq 0 ]; then
      echo "Waiting for servers... (${waited}s)"
    fi
  done
  echo "ERROR: Servers did not start within ${max_wait}s"
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

start_servers() {
  stop_servers

  # Fresh database for each test run
  rm -f "$LOG_FILE"
  rm -f "$REPO_ROOT/packages/apollo-collaboration-server/apollo-dev.sqlite"

  echo "Starting e2e servers..."
  echo "Server log: $LOG_FILE"

  cd "$SCRIPT_DIR" || exit 1

  # Plugin serve (port 9000) — serves the built plugin files
  yarn node "$(yarn bin serve)" --no-request-logging --cors --listen $PLUGIN_PORT --no-port-switching . \
    >> "$LOG_FILE" 2>&1 &
  echo $! >> "$PID_FILE"

  # JBrowse browse (port 8999) — serves the JBrowse app
  yarn node "$(yarn bin serve)" --no-request-logging --listen $JBROWSE_PORT --no-port-switching --symlinks .jbrowse \
    >> "$LOG_FILE" 2>&1 &
  echo $! >> "$PID_FILE"

  # Collaboration server (port 3999) — NestJS backend with guest admin access
  cd "$REPO_ROOT/packages/apollo-collaboration-server" || exit 1
  GUEST_USER_ROLE=admin LOG_LEVELS=error,warn,log NODE_ENV=development yarn node dist/main.js \
    >> "$LOG_FILE" 2>&1 &
  echo $! >> "$PID_FILE"

  cd "$SCRIPT_DIR" || exit 1

  if wait_for_servers; then
    echo "E2E servers started."
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
