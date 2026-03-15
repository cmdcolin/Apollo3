# Apollo3 MikroORM Migration — Project Requirements Document

## Overview

Migration from MongoDB to MikroORM with multi-database support (SQLite,
PostgreSQL, MongoDB). The repository pattern abstracts the database layer behind
interfaces in `apollo-common`, with implementations in `apollo-entities`.

## Completed

- [x] Entity definitions using MikroORM v7 `defineEntity` + `p` builders
- [x] Repository interfaces in `apollo-common/src/repositories/`
- [x] SQL repository implementations in `apollo-entities/src/repositories/`
- [x] Raw SQL for performance-critical tree queries (recursive CTEs)
- [x] Unit tests for all repositories (44 tests passing)
- [x] SQL-optimized `searchText` (LIKE + recursive CTE instead of loading all features)
- [x] SQL-optimized `findByIndexedId` (LIKE + recursive CTE instead of loading all features)
- [x] Import benchmark (see benchmark results below)
- [x] Transactional change execution via `em.transactional()`
- [x] Debug logging cleanup (removed `[DEBUG checkFeature]` and `[DEBUG seed]`)
- [x] WAL mode + synchronous=NORMAL SQLite pragmas
- [x] Check seeding on server startup
- [x] RequestContext middleware — per-request EM isolation, no manual fork
- [x] Removed dead code: `UnitOfWork`, `CountersService`, `filesService.create/remove` from interface
- [x] Removed `allowGlobalContext: true` — proper RequestContext everywhere
- [x] Desktop driver simplified — `em.transactional()` instead of manual UnitOfWork
- [x] Simple queries migrated from raw SQL to `em.find()`/`em.findOne()`
  (findAll, findById, findByIds, findByRange, findRootsByRange, findChildren)
- [x] PostgreSQL-compatible raw SQL (CAST(attributes AS TEXT) for LIKE on json)
- [x] E2E server script supports `DB_BACKEND=postgresql`
- [x] Dead code cleanup: duplicate `UploadedFile`, `MessagesService`, stub `file.entity.ts`,
  unused `user` field in `CreateFileDto`
- [x] Stale MongoDB comment cleanup
- [x] MongoDB feature repository (`MongoFeatureRepository`) with iterative
  BFS tree traversal — works with any MikroORM driver
- [x] Repository factory pattern — `DatabaseService` selects
  `MikroOrmFeatureRepository` (SQLite/PostgreSQL) or `MongoFeatureRepository`
  (MongoDB) based on `DB_BACKEND` env var
- [x] `DB_BACKEND=mongo` accepted in Joi validation and mikro-orm module
- [x] `docker-compose.yml` with PostgreSQL service for local development/testing

## Outstanding Issues (Priority Order)

### P1 — Playwright E2E Tests

1. **deleteFeature Playwright tests (0/2 passing)** — UI tests timeout
   waiting for the Apollo button. The `loginAsGuest` helper waits for either
   the Apollo button or "Continue as Guest" text, but neither appears within
   15s. Likely a JBrowse plugin loading timing issue.
   - **Action**: Investigate the screenshot/trace artifacts to determine what
     the page shows at timeout. May need to wait for JBrowse to fully
     initialize before looking for the Apollo button.

2. **Playwright test coverage** — Currently only `deleteFeature`,
   `assemblyApi`, `uploadTest`, and `fetchDebug` tests exist in `pw-tests/`.
   Need to port remaining Cypress suites:
   - addAssembly, editFeature, searchFeatures, showWarnings,
     mergeTranscripts, undo, downloadGff, largeAssembly, visualGeneModel

3. **Cypress test issues (pre-existing)** — Several Cypress suites have
   known failures unrelated to MikroORM migration:
   - showWarnings: 1/5 (changeInProgress timing)
   - editFeature: 5/8 (1 MST addChild failure, 2 pending)
   - searchFeatures: 7/9 (FIXME quote handling, multi-assembly timing)
   - undo: 2/3 (MST detached node during undo)

### P1 — Performance

4. **Import speed** — Current: ~8s for volvox test data. Breakdown:
   - GFF3 parsing + file I/O: ~6s (dominant)
   - DB writes: ~2s (already optimized with `insertMany` batching)
   - Transaction wrapping gives ~12% speedup on DB writes (WAL+NORMAL config)
   - **Investigation needed**: Profile GFF3 parsing to find bottlenecks.

### P2 — Architecture

5. **PostgreSQL E2E CI pipeline** — E2E script supports PostgreSQL and
   `docker-compose.yml` provides a local PostgreSQL service, but no CI
   pipeline runs tests against PostgreSQL yet.
   - **Action**: Add a CI job that starts PostgreSQL via docker-compose and
     runs unit tests + E2E against it.

6. **MongoDB E2E testing** — `MongoFeatureRepository` exists but has no
   test coverage beyond type-checking. Unit tests run only against SQLite
   (and optionally PostgreSQL).
   - **Action**: Add a MongoDB test configuration and test the
     `MongoFeatureRepository` against a real MongoDB instance.

### P3 — Cleanup

7. **Remaining debug logging** — Standard `logger.debug()` calls exist
   throughout the server (features, changes, auth, files controllers). These
   are appropriate debug-level logging and can stay unless noisy.

8. **`[DEBUG ...]` console.log lines** — Several debug log lines in
   `AddAssemblyAndFeaturesFromFileChange`, `LocationStartChange`,
   `DeleteFeature.tsx`, and `ApolloInternetAccount/model.ts` use raw
   `console.log` with `[DEBUG ...]` prefixes instead of proper loggers.
   Should be reviewed and either removed or converted to logger calls.

## Benchmark Results

Import simulation: 3 refSeqs × (100 chunks + 1500 features)

| SQLite Config         | Without TX | With TX | Speedup |
|-----------------------|-----------|---------|---------|
| WAL + NORMAL (prod)   | 259ms     | 228ms   | 12%     |
| WAL + FULL            | 231ms     | 212ms   | 8%      |
| DELETE + FULL          | 322ms     | 262ms   | 19%     |

Primary win from transactions is **atomicity** (failed imports roll back
cleanly), not raw speed.

## Architecture Decisions

### Multi-database support
SQLite for development/small deployments, PostgreSQL for production,
MongoDB for existing users. Repository factory pattern selects the correct
implementation based on `DB_BACKEND`:
- SQLite/PostgreSQL → `MikroOrmFeatureRepository` (raw SQL with recursive CTEs)
- MongoDB → `MongoFeatureRepository` (iterative BFS via generic EntityManager)
All other repositories use the standard `MikroOrm*Repository` implementations
which work with any MikroORM driver.

### Raw SQL for tree queries
Recursive CTEs (`findDescendants`, `findRootParent`, `deleteDescendants`) use
raw SQL via `em.getConnection().execute()`. Uses `CAST(attributes AS TEXT)`
for LIKE queries on json columns (compatible with both SQLite and PostgreSQL).
MongoDB uses iterative BFS traversal via the generic EntityManager API.

### No `root_id` denormalization (unless proven necessary)
A `root_id` column on `FeatureEntity` has been proposed to enable single-query
gene tree loading. However, this denormalizes the data and introduces a
maintenance burden (must be kept in sync on reparenting). The current recursive
CTE approach is correct and performant for typical workloads. Only add `root_id`
if profiling proves that tree loading is a real bottleneck in production.

### Transactional change execution
All change executions are wrapped in `em.transactional()` which auto-commits
on success and auto-rolls-back on error. RequestContext middleware provides
per-request EM isolation.

### Status field convention
- `status: -1` = temporary (pending activation after import)
- `status: 0` = active
- `activateByUser(user)` flips -1 → 0 for a specific user's records
