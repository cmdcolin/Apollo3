#!/bin/bash
set -euo pipefail

JBROWSE_REPO=${JBROWSE_REPO:-~/src/jbrowse-components2}
APOLLO_ROOT=$(cd "$(dirname "$0")/../../.." && pwd)

echo "=== Apollo Desktop E2E Setup ==="
echo "  JBROWSE_REPO: $JBROWSE_REPO"
echo "  APOLLO_ROOT:  $APOLLO_ROOT"

# 1. Build Apollo plugin
echo ""
echo "--- Building Apollo plugin ---"
cd "$APOLLO_ROOT"
pnpm build:shared
pnpm --filter @apollo-annotation/jbrowse-plugin-apollo build

# 2. Build and package JBrowse Desktop
echo ""
echo "--- Building JBrowse Desktop ---"
cd "$JBROWSE_REPO/products/jbrowse-desktop"
pnpm install
pnpm package:linux:no-installer

echo ""
echo "=== Setup complete ==="
echo "  Plugin dist: $APOLLO_ROOT/packages/jbrowse-plugin-apollo/dist/index.esm.js"
echo "  App binary: $JBROWSE_REPO/products/jbrowse-desktop/dist/unpacked/jbrowse-desktop-linux-x64/jbrowse-desktop"
echo ""
echo "  The test script serves the plugin over HTTP and installs it via IPC at runtime."
echo "  No globalPlugins.json pre-configuration is needed."
