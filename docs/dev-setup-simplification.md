# Developer Setup Simplification

## Change

From multi-process, multi-repository setup to single-server:
`pnpm install && pnpm start`.

## Before

4 processes required: `start:shared` (watch/rebuild), `start:server` (NestJS),
`start:plugin` (JBrowse dev server on separate port), `run-jbrowse` (separate
JBrowse from sibling jbrowse-components clone via justfile).

## After

One NestJS server on port 3999 serves API, WebSocket, and JBrowse static files
(via `JBROWSE_STATIC_DIR`). Builds shared packages automatically before start.

## Removed Dependencies

- `jbrowse-components` sibling clone
- `npm-run-all`, `concurrently`, `serve` packages
- `justfile` (just wrapped `pnpm install` + `pnpm start`)

## Also

Dev Container updated: removed MongoDB extension + `mongosh`, forwarded port
changed from 27017 to 5432 (PostgreSQL).
