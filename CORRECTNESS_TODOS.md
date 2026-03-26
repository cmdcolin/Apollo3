# Correctness TODOs

Tracked issues from code review of the repository/service/controller layers.
Priority: H = will cause data bugs or crashes at scale, M = correctness risk, L = cleanup.

## Done

- **M1**: `deleteDescendants` now uses `em.remove()` so FeatureHistorySubscriber fires
- **M4**: `findByRole` returns `UserRow[]` instead of single user
- **H6**: `undoChange` checks `changedBy === user.email` (admin exempt)
- **H5**: `addFeature` checks for duplicate IDs before `createMany` (409 Conflict)
- **H4**: Zod validation on all feature mutation and query DTOs
- Dead DTO files deleted, types consolidated via Zod inference

---

## Remaining

### H1: Post-transaction reads see stale data

**Status**: Downgraded — not a real bug in practice. MikroORM's `em.find()` and
raw SQL always query the DB after the transaction commits. Code quality issue only.

---

### H2: Synchronous check execution blocks every mutation response

**Where**: `FeaturesService.broadcastAndCheck()` → `checksService.checkFeature()`

**Problem**: Every mutation runs checks synchronously before returning the HTTP
response. `ChecksService.checkFeature` has no error handling, so fire-and-forget
is not safe.

**Next step**: Add try/catch + logging inside `checkFeature`, then it becomes
safe to run without awaiting.

---

### H7: N+1 queries in `propagateAncestorBounds`

**Where**: `FeaturesService.propagateAncestorBounds()`

**Problem**: Walks up the tree one level at a time with individual `findById` +
`findChildren` + `updateById`. For a 4-level tree that's 12+ round-trips inside
a transaction.

**Fix**: Move to repository layer. SQL impl: CTE to find ancestor IDs → single
query for children → compute bounds in JS → batch update.

---

### H8: Feature history grows unbounded

**Where**: `feature_history` table, `FeatureHistorySubscriber`

**Problem**: Every mutation creates history records with no retention policy.

**Fix**: Add `FEATURE_HISTORY_RETENTION_DAYS` env var (default 90). Periodic
cleanup job following `AnalysisWorkerService` pattern.

---

### M2: Raw SQL hardcodes MikroORM naming convention

**Where**: `MikroOrmFeatureRepository` — `parent__id`, `ref_seq__id` column names

**Fix**: Resolve column names from `em.getMetadata()` at construction time, or
add an integration test that verifies names match the schema.

---

### M3: No optimistic concurrency on feature updates

**Where**: `FeaturesService.updateFeature()`

**Problem**: Two concurrent edits — last write wins silently. Requires client-side
changes to send version back.

**Fix**: Add `version` property to `FeatureEntity`, accept in `FeatureUpdateDto`,
catch `OptimisticLockError` → 409. Deferred until client protocol supports it.

---

### M5: `mergeFeatureIntoTranscript` logic is fragile

**Where**: `FeaturesService.mergeFeatureIntoTranscript()`

**Fix**: Write tests first (no overlap, partial overlap, multiple overlaps,
different types, grandchild reparenting), then refactor.

---

### M6: `countByRange` counts all features, not just roots

**Where**: `BaseFeatureRepository.countByRange()`

**Fix**: Add a separate `countRootsByRange()` with `parent: null` filter.
Don't change existing `countByRange` semantics.

---

### L1: Mongo `searchText` / `findByIndexedId` load all features into memory

Low priority — Mongo is not the primary backend.

---

### L2: Status fields are untyped strings

**Fix**: Use string literal union types for `AnalysisJobRow.status` etc.

---

### L3: `assemblies` query param is comma-separated string

**Fix**: Accept array query params. Could do via Zod transform now that
validation infra is in place.
