# Apollo3 MikroORM Migration — Project Requirements Document

## Overview

Migration from MongoDB to MikroORM with SQLite (and optional PostgreSQL)
support. The repository pattern abstracts the database layer behind interfaces
in `apollo-common`, with SQL implementations in `apollo-entities`.

## Completed

- [x] Entity definitions using MikroORM v7 `defineEntity` + `p` builders
- [x] Repository interfaces in `apollo-common/src/repositories/`
- [x] SQL repository implementations in `apollo-entities/src/repositories/`
- [x] Raw SQL for performance-critical tree queries (recursive CTEs)
- [x] Unit tests for all repositories (42 tests passing)
- [x] SQL-optimized `searchText` (LIKE + recursive CTE instead of loading all features)
- [x] SQL-optimized `findByIndexedId` (LIKE + recursive CTE instead of loading all features)
- [x] Import benchmark (see benchmark results below)
- [x] Transactional UnitOfWork (BEGIN/COMMIT wrapping all change executions)
- [x] Debug logging cleanup (removed `[DEBUG checkFeature]` and `[DEBUG seed]`)
- [x] WAL mode + synchronous=NORMAL SQLite pragmas
- [x] Check seeding on server startup

## Outstanding Issues (Priority Order)

### P0 — Blocking E2E Tests

1. **showWarnings tests (1/5 passing)** — `changeInProgress` guard prevents
   edits when a prior change hasn't completed. Tests need to wait for
   `changeInProgress=false` before submitting new changes. The
   NumberTextField's `should('not.be.disabled')` wait was added but timing is
   still flaky.

2. **deleteFeature tests (0/3 passing)** — MUI dialog overlay covers Apollo
   menu button during `addAssemblyFromGff`. Cypress `cy.click()` fails because
   `MuiDialog-container` is covering the target element. Consistent across
   runs. Root cause: dialog from login/startup flow not dismissing before
   test proceeds. Not related to transaction changes.

3. **addAssembly tests — session setup failures** — `cy.click()` timeouts on
   session creation. Likely a Cypress session caching issue, not
   transaction-related.

### P1 — Performance

3. **Import speed** — Current: ~8s for volvox test data. Breakdown:
   - GFF3 parsing + file I/O: ~6s (dominant)
   - DB writes: ~2s (already optimized with `insertMany` batching)
   - Transaction wrapping gives ~12% speedup on DB writes (WAL+NORMAL config)
   - **Investigation needed**: Profile GFF3 parsing to find bottlenecks.
     Consider streaming parser improvements or parallel parsing.

4. **`searchText` and `findByIndexedId`** — Now optimized to use SQL LIKE
   filtering + recursive CTE for parent traversal. Previously loaded all
   features into memory. Verified with unit tests (42 passing).

### P1 — Test Infrastructure

5. **Migrate E2E tests from Cypress to Playwright** — Cypress has poor
   command-line debugging: no visibility into what's on screen, opaque session
   caching, silent click failures when dialogs cover elements, and intercept
   timing issues. Playwright provides:
   - Direct screenshots/traces at any point
   - Network request logging built in
   - Explicit visibility checks with auto-waiting
   - `page.evaluate()` for direct DOM inspection
   - Better error messages with element screenshots on failure
   - Trace viewer for post-mortem debugging
   - Strategy: migrate one test suite (deleteFeature) as proof of concept,
     then incrementally convert remaining suites.
   - **Proof of concept started**: `pw-tests/` directory with helpers and
     deleteFeature test. Login flow works, admin role verified, assembly form
     navigation works. Blocked on file upload hanging (see P0 issue below).

6. **File upload hangs** — uploading a 3.3KB GFF3 file via the Add Assembly
   form hangs indefinitely at ~50% progress. Confirmed with both Playwright
   and direct curl. The server-side code in `FileStorageEngine._handleFile`
   uses streaming (`pipeline(stream, gz, fileWriteStream)`) which may have
   issues. The `filesUtil.ts` `writeFileAndCalculateHash` function uses
   `stream.on('data')` for progress + hash calculation, then
   `pipeline(stream, gz, fileWriteStream)` — attaching both a data listener
   and a pipeline to the same stream could cause backpressure issues.
   **Next step**: investigate and fix the streaming code in
   `filesUtil.ts`/`FileStorageEngine.ts`.

### P2 — Architecture

6. **MongoDB repository implementations** — If MongoDB remains a target, need
   separate `MongoFeatureRepository` etc. using `$graphLookup` instead of
   recursive CTEs. Decision needed: commit to SQL-only or maintain dual
   implementations.

7. **QueryBuilder migration** — If MongoDB is dropped, can replace raw SQL
   strings + `RawFeatureRow` mapping with MikroORM QueryBuilder `.execute()`
   mode. Requires `SqlEntityManager` (breaks MongoDB type compatibility).

### P3 — Cleanup

8. **Remaining debug logging** — Standard `logger.debug()` calls exist
   throughout the server (features, changes, auth, files controllers). These
   are appropriate debug-level logging (not `[DEBUG]` prefix misuse) and can
   stay unless noisy. Review if log volume is excessive.

9. **E2E test stability** — Several other test suites have known issues:
   - editFeature: 5/8 (1 MST `addChild` failure, 2 pending)
   - searchFeatures: 7/9 (FIXME quote handling, multi-assembly timing)
   - undo: 2/3 (MST detached node during undo)

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

### Raw SQL for tree queries
Recursive CTEs (`findDescendants`, `findRootParent`, `deleteDescendants`) use
raw SQL via `em.getConnection().execute()`. This avoids ORM hydration overhead
and keeps the constructor accepting generic `EntityManager` (works for any
MikroORM driver). Trade-off: manual `RawFeatureRow` → `FeatureRow` mapping
(~20 lines).

### Transactional UnitOfWork
All change executions are wrapped in a DB transaction (`em.begin()` /
`em.commit()` / `em.rollback()`). This ensures atomicity — a failed import
doesn't leave partial data. The `insertMany` calls participate in the active
transaction via the shared connection.

### Status field convention
- `status: -1` = temporary (pending activation after import)
- `status: 0` = active
- `activateByUser(user)` flips -1 → 0 for a specific user's records
