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
- [x] Unit tests for all repositories (40 tests passing)
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

2. **addAssembly tests — session setup failures** — `cy.click()` timeouts on
   session creation. Likely a Cypress session caching issue, not
   transaction-related.

### P1 — Performance

3. **Import speed** — Current: ~8s for volvox test data. Breakdown:
   - GFF3 parsing + file I/O: ~6s (dominant)
   - DB writes: ~2s (already optimized with `insertMany` batching)
   - Transaction wrapping gives ~12% speedup on DB writes (WAL+NORMAL config)
   - **Investigation needed**: Profile GFF3 parsing to find bottlenecks.
     Consider streaming parser improvements or parallel parsing.

4. **`searchText` loads all features into memory** — Currently fetches all
   features for given refSeqs, tokenizes in JS. Should push filtering to SQL
   with `LIKE` or `json_extract` for scalability.

5. **`findByIndexedId` loads all features into memory** — Same pattern as
   searchText. Needs SQL-side attribute value search.

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
