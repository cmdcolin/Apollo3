# Apollo3 Development Guide

## Package Manager

This repo uses **Yarn PnP** (Plug'n'Play). There is no `node_modules` directory.

**NEVER use `npx`**. Always use `yarn` to invoke commands. With PnP, `npx`
cannot resolve packages.

## Building

```bash
# Build shared TypeScript packages (apollo-common, apollo-mst, apollo-shared)
yarn tsc -b

# Build collaboration server (has its own tsconfig, not included in root tsc -b)
cd packages/apollo-collaboration-server && yarn tsc -b

# Build entities package
cd packages/apollo-entities && yarn tsc -b

# Build JBrowse plugin
yarn --cwd packages/jbrowse-plugin-apollo build
```

## Running Tests

### Unit tests (apollo-entities)

```bash
cd packages/apollo-entities && NODE_OPTIONS='--experimental-vm-modules' yarn jest
```

### E2E tests (Playwright)

The `test:e2e` script builds everything, starts servers, runs tests, and stops
servers in one command:

```bash
# Full E2E run (build + start + test + stop)
yarn --cwd packages/jbrowse-plugin-apollo test:e2e

# Or use the script directly for more control:
cd packages/jbrowse-plugin-apollo
bash scripts/e2e-servers.sh test
bash scripts/e2e-servers.sh start             # build + start servers only
bash scripts/e2e-servers.sh stop              # stop servers
bash scripts/e2e-servers.sh status            # check server status
bash scripts/e2e-servers.sh logs              # tail server log

# Run E2E tests against PostgreSQL instead of SQLite:
DB_BACKEND=postgresql DB_CONNECTION_URL=postgresql://user:pass@localhost:5432/apollo_e2e \
  bash scripts/e2e-servers.sh test
```

### Unit tests with PostgreSQL

```bash
# Run entity tests against PostgreSQL (defaults to in-memory SQLite)
cd packages/apollo-entities
DB_BACKEND=postgresql DB_CONNECTION_URL=postgresql://user:pass@localhost:5432/apollo_test \
  NODE_OPTIONS='--experimental-vm-modules' yarn jest
```

### Running the collaboration server

```bash
yarn --cwd packages/apollo-collaboration-server start
# Or for e2e: yarn --cwd packages/apollo-collaboration-server e2e:start
```

The server must be run via `yarn node dist/main.js` (not bare `node`) for PnP
resolution.

## Linting

```bash
yarn lint
```

## Database Compatibility

The MikroORM layer must remain compatible with **SQLite, MongoDB, and
PostgreSQL**. Some users will continue to use MongoDB after the MikroORM
migration; others may prefer PostgreSQL for production deployments. This means:

- Repository implementations use the generic `EntityManager` from
  `@mikro-orm/core`, **not** driver-specific types like `SqlEntityManager`
- The `@mikro-orm/mongodb` and `@mikro-orm/postgresql` packages must remain
  as dependencies
- Do **not** delete the MongoDB migration script
  (`packages/apollo-collaboration-server/scripts/migrate-mongo-to-mikroorm.ts`)
  — existing users need it to migrate from MongoDB
- Raw SQL (recursive CTEs) is acceptable where necessary for performance, but
  must be commented, benchmarked, and ideally have a fallback path for
  non-SQL drivers
- `MongoFeatureRepository` provides the MongoDB fallback for tree traversal
  (iterative BFS instead of recursive CTEs); `DatabaseService` selects the
  right implementation based on `DB_BACKEND`
- Local PostgreSQL testing: `docker compose up -d` then set
  `DB_BACKEND=postgresql DB_CONNECTION_URL=postgresql://apollo:apollo@localhost:5432/apollo`

## Monorepo Structure

- `packages/apollo-collaboration-server` - NestJS backend
- `packages/apollo-entities` - MikroORM entities + repositories
- `packages/apollo-common` - Shared interfaces (repository interfaces, check
  registry)
- `packages/apollo-mst` - MobX State Tree models
- `packages/apollo-shared` - Shared utilities
- `packages/jbrowse-plugin-apollo` - JBrowse 2 plugin (frontend + Playwright e2e
  tests)
