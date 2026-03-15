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

## Outstanding Issues (Priority Order)

### P0 — Multi-database Support

1. **MongoDB repository implementations** — MongoDB remains a supported
   backend. Need MongoDB-specific repository implementations using
   `$graphLookup` for tree traversal instead of recursive CTEs. The current
   raw SQL queries will fail on MongoDB.
   - **Action**: Create `MongoFeatureRepository` with `$graphLookup` for
     `findDescendants`, `findRootParent`, `searchText`, `findByIndexedId`,
     `deleteDescendants`.
   - The repository factory/selection should be driven by `DB_BACKEND` config.

2. **PostgreSQL E2E testing** — E2E script supports PostgreSQL but no CI
   pipeline or local Docker setup exists yet.
   - **Action**: Add docker-compose.yml with PostgreSQL service for local
     E2E testing. Run unit tests + E2E against PostgreSQL to catch
     SQL dialect issues.

### P1 — Playwright E2E Tests

3. **deleteFeature Playwright tests (0/2 passing)** — UI tests timeout
   waiting for the Apollo button. The `loginAsGuest` helper waits for either
   the Apollo button or "Continue as Guest" text, but neither appears within
   15s. Likely a JBrowse plugin loading timing issue.
   - **Action**: Investigate the screenshot/trace artifacts to determine what
     the page shows at timeout. May need to wait for JBrowse to fully
     initialize before looking for the Apollo button.

4. **Playwright test coverage** — Currently only `deleteFeature`,
   `assemblyApi`, `uploadTest`, and `fetchDebug` tests exist in `pw-tests/`.
   Need to port remaining Cypress suites:
   - addAssembly, editFeature, searchFeatures, showWarnings,
     mergeTranscripts, undo, downloadGff, largeAssembly, visualGeneModel

5. **Cypress test issues (pre-existing)** — Several Cypress suites have
   known failures unrelated to MikroORM migration:
   - showWarnings: 1/5 (changeInProgress timing)
   - editFeature: 5/8 (1 MST addChild failure, 2 pending)
   - searchFeatures: 7/9 (FIXME quote handling, multi-assembly timing)
   - undo: 2/3 (MST detached node during undo)

### P1 — Performance

6. **Import speed** — Current: ~8s for volvox test data. Breakdown:
   - GFF3 parsing + file I/O: ~6s (dominant)
   - DB writes: ~2s (already optimized with `insertMany` batching)
   - Transaction wrapping gives ~12% speedup on DB writes (WAL+NORMAL config)
   - **Investigation needed**: Profile GFF3 parsing to find bottlenecks.

### P2 — Architecture

7. **Raw SQL MongoDB fallback** — The 5 remaining raw SQL queries use
   recursive CTEs (SQLite/PostgreSQL only). For MongoDB, these need
   `$graphLookup` equivalents. Options:
   a. Separate repository implementations per driver
   b. Runtime driver detection with fallback to iterative JS traversal
   c. Accept that MongoDB won't support these operations as efficiently

8. **Repository factory pattern** — Currently repositories are instantiated
   inline in `DatabaseService` and `createLocalDataStore`. Need a factory
   that selects the correct implementation based on `DB_BACKEND`:
   - SQLite/PostgreSQL → `MikroOrmFeatureRepository` (with raw SQL CTEs)
   - MongoDB → `MongoFeatureRepository` (with `$graphLookup`)

### P3 — Cleanup

9. **Remaining debug logging** — Standard `logger.debug()` calls exist
   throughout the server (features, changes, auth, files controllers). These
   are appropriate debug-level logging and can stay unless noisy.

10. **`[DEBUG AddAssembly]` log lines** — Several debug log lines in
    AddAssemblyAndFeaturesFromFileChange still use `[DEBUG AddAssembly]`
    prefix convention instead of NestJS logger. Should be reviewed.

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
MongoDB for existing users. All repository implementations use the generic
`EntityManager` from `@mikro-orm/core` to remain driver-agnostic.

### Raw SQL for tree queries
Recursive CTEs (`findDescendants`, `findRootParent`, `deleteDescendants`) use
raw SQL via `em.getConnection().execute()`. Uses `CAST(attributes AS TEXT)`
for LIKE queries on json columns (compatible with both SQLite and PostgreSQL).
MongoDB will need separate implementations.

### Transactional change execution
All change executions are wrapped in `em.transactional()` which auto-commits
on success and auto-rolls-back on error. RequestContext middleware provides
per-request EM isolation.

### Status field convention
- `status: -1` = temporary (pending activation after import)
- `status: 0` = active
- `activateByUser(user)` flips -1 → 0 for a specific user's records
