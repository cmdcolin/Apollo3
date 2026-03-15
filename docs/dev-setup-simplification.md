# Developer Setup Simplification

## Summary

The local development setup has been simplified from a multi-process,
multi-repository architecture to a single-server model. Starting Apollo for
development now requires only `yarn install` and `yarn start`.

## What changed

### Single-server architecture

Previously, running Apollo locally required starting three or four processes in
parallel:

1. `start:shared` — watched and rebuilt the shared package
2. `start:server` — ran the NestJS collaboration server
3. `start:plugin` — ran the JBrowse plugin dev server on a separate port
4. (via justfile) `run-jbrowse` — ran a separate JBrowse web app from a sibling
   clone of jbrowse-components

Now, the collaboration server handles everything: it serves the API, WebSocket
connections, and JBrowse static files from a single port (3999). The server's
start script also builds shared packages automatically before starting.

### Removed dependencies

- **jbrowse-components sibling clone**: no longer needed for local development.
  The server serves JBrowse static files directly via `JBROWSE_STATIC_DIR`.
- **npm-run-all**: was used to orchestrate parallel process startup; no longer
  needed with a single process.
- **concurrently**: was used in the plugin package for the old multi-server E2E
  setup; replaced by `scripts/e2e-servers.sh`.
- **serve**: was used to serve static files from the plugin directory; the
  NestJS server now handles this.
- **justfile**: the `just` command runner recipes only wrapped `yarn install`
  and `yarn start`, adding no value over calling yarn directly.

### MongoDB to PostgreSQL in dev container

The VS Code Dev Container configuration was updated to reflect the migration
from MongoDB to MikroORM:

- Removed MongoDB VS Code extension and `mongosh` initialization
- Forwarded port changed from 27017 (MongoDB) to 5432 (PostgreSQL)
- The `compose.yml` already used PostgreSQL; the `devcontainer.json` now matches

### Updated documentation

- **README.md**: updated package table (removed `apollo-schemas`, added
  `apollo-entities`), simplified startup instructions
- **CONTRIBUTING.md**: removed jbrowse-components setup steps and justfile
  section, simplified to quick-start instructions

## Impact

- Fewer moving parts for new contributors to understand and debug
- No need to clone or maintain a sibling jbrowse-components repository
- Single port to manage instead of three or four
- Faster onboarding: `yarn install && yarn start` is the complete setup
