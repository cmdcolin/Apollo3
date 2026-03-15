# Apollo3 Development Guide

## Package Manager

This repo uses **pnpm** with workspaces. Dependencies are in `node_modules/`.

**NEVER use `npx`**. Always use `pnpm` (or `pnpm exec`) to invoke commands.

## Building

```bash
# Fast dev build — esbuild, no type checking (~3s for all packages)
pnpm -C packages/apollo-collaboration-server dev:build

# Full production build (includes web UI client)
pnpm -C packages/apollo-collaboration-server build

# Type-check only (no emit) — run separately or in CI
pnpm tsc -b

# Build JBrowse plugin
pnpm -C packages/jbrowse-plugin-apollo build
```

### esbuild and @Inject()

The dev build uses esbuild instead of tsc. Because esbuild does not support
`emitDecoratorMetadata`, all NestJS constructor parameters **must** have
explicit `@Inject()` decorators. Omitting `@Inject()` causes a runtime DI error
(not a build error). Example:

```typescript
constructor(
  @Inject(MyService) private readonly myService: MyService,
) {}
```

## Running Tests

### Unit tests (apollo-entities)

```bash
cd packages/apollo-entities && NODE_OPTIONS='--experimental-vm-modules' pnpm jest
```

### E2E tests (Playwright)

The `test:e2e` script builds everything, starts servers, runs tests, and stops
servers in one command:

```bash
# Full E2E run (build + start + test + stop)
pnpm -C packages/jbrowse-plugin-apollo test:e2e

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
  NODE_OPTIONS='--experimental-vm-modules' pnpm jest
```

### Running the collaboration server

```bash
pnpm -C packages/apollo-collaboration-server start
# Or for e2e: pnpm -C packages/apollo-collaboration-server e2e:start
```

## Linting

```bash
pnpm lint
```

## Database Compatibility

The MikroORM layer must remain compatible with **SQLite, MongoDB, and
PostgreSQL**. Some users will continue to use MongoDB after the MikroORM
migration; others may prefer PostgreSQL for production deployments. This means:

- Repository implementations use the generic `EntityManager` from
  `@mikro-orm/core`, **not** driver-specific types like `SqlEntityManager`
- The `@mikro-orm/mongodb` and `@mikro-orm/postgresql` packages must remain as
  dependencies
- Do **not** delete the MongoDB migration script
  (`packages/apollo-collaboration-server/scripts/migrate-mongo-to-mikroorm.ts`)
  — existing users need it to migrate from MongoDB
- Raw SQL (recursive CTEs) is acceptable where necessary for performance, but
  must be commented, benchmarked, and ideally have a fallback path for non-SQL
  drivers
- `MongoFeatureRepository` provides the MongoDB fallback for tree traversal
  (iterative BFS instead of recursive CTEs); `DatabaseService` selects the right
  implementation based on `DB_BACKEND`
- Local PostgreSQL testing: `docker compose up -d` then set
  `DB_BACKEND=postgresql DB_CONNECTION_URL=postgresql://apollo:apollo@localhost:5432/apollo`

## Authentication & Authorization

Auth was simplified from a 5-file indirection chain down to a single file
(`src/utils/roles.guard.ts`). Every controller must have a class-level
decorator — just pick one of three:

- `@Public()` — no login needed (auth endpoints, health, config.json)
- `@Authenticated()` — logged in, any role (even pending users)
- `@Roles(Role.ReadOnly | Role.User | Role.Admin)` — logged in with a specific
  role or higher (admin > user > readOnly)

Missing auth returns 401; insufficient role returns 403. The frontend redirects
to the login page on 401.

## Monorepo Structure

- `packages/apollo-collaboration-server` - NestJS backend
- `packages/apollo-entities` - MikroORM entities + repositories
- `packages/apollo-common` - Shared interfaces (repository interfaces, check
  registry)
- `packages/apollo-mst` - MobX State Tree models
- `packages/apollo-shared` - Shared utilities
- `packages/jbrowse-plugin-apollo` - JBrowse 2 plugin (frontend + Playwright e2e
  tests)
