# Correctness TODOs

Tracked issues from code review of the repository/service/controller layers.
Priority: H = will cause data bugs or crashes at scale, M = correctness risk, L = cleanup.

## H1: Post-transaction reads see stale data

**Where**: `FeaturesService` — all mutation methods (`updateFeature`, `deleteFeature`, `addFeature`, etc.)

**Problem**: After `db.transactional()` completes, `getRootFeatureTrees()` and
`broadcastAndCheck()` read via `this.db.feature` which uses the non-transactional
EntityManager. The broadcast can send pre-mutation state to clients.

**Fix**: Return the data needed for broadcast from inside the transaction, or
fork the EM after commit so reads see committed state.

---

## H2: Synchronous check execution blocks every mutation response

**Where**: `FeaturesService.broadcastAndCheck()` → `checksService.checkFeature()`

**Problem**: Every mutation runs checks synchronously before returning the HTTP
response. For a gene with many children, this adds hundreds of ms of latency to
every single edit.

**Fix**: Emit checks to an async queue (e.g. BullMQ or in-process event emitter)
and return the mutation result immediately. Checks can broadcast their own
results when done.

---

## H3: `GET /features` returns every feature in the database

**Where**: `FeaturesController.getAll()` → `findAll()`

**Problem**: No pagination, no limit. A genome with millions of features will OOM
the server.

**Fix**: Either remove this endpoint entirely (clients use `getFeatures` by
range) or add mandatory pagination with a reasonable max page size.

---

## H4: No runtime validation on request DTOs

**Where**: All controllers — `FeatureUpdateDto`, `AddFeatureDto`, `MergeExonsDto`,
`SplitExonDto`, `MergeTranscriptsDto`, `SplitTranscriptDto`, body of `/undo`

**Problem**: These are plain TypeScript interfaces, not classes with
`class-validator` decorators. NestJS `ValidationPipe` has nothing to validate.
Malformed input passes through silently.

**Fix**: Convert DTOs to classes with `class-validator` decorators and enable
`ValidationPipe` globally (or per-controller).

---

## H5: Client-controlled `_id` with no conflict detection

**Where**: `FeaturesService.addFeature()` trusts `addedFeature._id` from the
client.

**Problem**: A client can send a duplicate `_id` (collision or malicious) and
the `createMany` call will either silently overwrite or throw an opaque DB error
depending on the driver.

**Fix**: Either generate IDs server-side, or check for existence before insert
and return a clear 409 Conflict.

---

## H6: Undo has no authorization check

**Where**: `FeaturesService.undoChange()` and `POST /features/undo`

**Problem**: Any User-role user can undo any other user's change by posting
`{ sequence: N }`. No check that the requester authored the original change or
has admin privileges.

**Fix**: Verify `historyRecord.changedBy === user.email` or require Admin role
for undoing other users' changes.

---

## H7: N+1 queries in `propagateAncestorBounds`

**Where**: `FeaturesService.propagateAncestorBounds()`

**Problem**: Walks up the tree one level at a time with individual `findById` +
`findChildren` + `updateById`. For a 4-level tree that's 12+ round-trips inside
a transaction holding locks.

**Fix**: Use a single recursive CTE to collect the ancestor chain, then batch
the bound recalculations.

---

## H8: Feature history grows unbounded

**Where**: `feature_history` table, `FeatureHistorySubscriber`

**Problem**: Every mutation creates history records with no retention policy.
Over time this becomes the largest table and slows down undo lookups.

**Fix**: Add a configurable retention policy (e.g. keep N days or N records per
feature). Implement a periodic cleanup job.

---

## M1: `deleteDescendants` bypasses ORM cascade and history subscriber

**Where**: `MikroOrmFeatureRepository.deleteDescendants()` uses `nativeDelete`
after collecting IDs via CTE.

**Problem**: `nativeDelete` skips MikroORM lifecycle hooks, so the
`FeatureHistorySubscriber` does NOT record these deletions. The `cascade`
deleteRule on the entity is also redundant/misleading since manual deletion is
always used.

**Fix**: Either route deletes through `em.remove()` so the subscriber fires, or
record history explicitly in the CTE-based delete path. Document which strategy
is canonical.

---

## M2: Raw SQL hardcodes MikroORM naming convention

**Where**: `MikroOrmFeatureRepository` — `parent__id`, `ref_seq__id` column names

**Problem**: These names come from MikroORM's default `UnderscoreNamingStrategy`.
If the naming strategy or entity mapping changes, raw SQL silently breaks with no
compile-time or startup error.

**Fix**: Add an integration test that verifies raw SQL column names match the
actual schema. Or extract column names from entity metadata at startup.

---

## M3: No optimistic concurrency on feature updates

**Where**: `FeaturesService.updateFeature()`

**Problem**: Two users editing the same feature simultaneously — last write wins.
The `updatedAt` field exists but isn't used as a version check.

**Fix**: Add a `@Version()` or `updatedAt`-based optimistic lock check. Return
409 Conflict when the version doesn't match.

---

## M4: `UserRepository.findByRole` returns single user

**Where**: `UserRepository` interface

**Problem**: `findByRole(role: string): Promise<UserRow | undefined>` — but
multiple users can have the same role. Should return an array.

**Fix**: Change return type to `Promise<UserRow[]>`.

---

## M5: `mergeFeatureIntoTranscript` logic is fragile

**Where**: `FeaturesService.mergeFeatureIntoTranscript()` (lines 598-680)

**Problem**: The `merged`/`mrgChild`/`toDelete` state machine iterates through
`firstChildren` with unclear invariants. Edge cases with multiple overlapping
exons of the same type are hard to reason about. No tests cover these edge cases.

**Fix**: Add comprehensive unit tests for merge scenarios (no overlap, partial
overlap, multiple overlaps, different types). Refactor the loop to make the
state transitions explicit.

---

## M6: `countByRange` counts all features, not just roots

**Where**: `BaseFeatureRepository.countByRange()`

**Problem**: Returns count of ALL features in range (including children). But
the UI shows assembled trees from root features. The count doesn't match what
the user sees, making it unreliable for pagination or density display.

**Fix**: Add a `countRootsByRange()` that filters `parent IS NULL`, or document
that the count includes descendants.

---

## L1: Mongo `searchText` / `findByIndexedId` load all features into memory

**Where**: `MongoFeatureRepository.searchText()`, `MongoFeatureRepository.findByIndexedId()`

**Problem**: Loads every feature for the given refSeqs (or all features if no
refSeqIds) into memory, then filters in JS. A single chromosome can have
hundreds of thousands of features.

**Fix**: Use MongoDB's `$text` index or `$regex` for server-side filtering.
Lower priority since Mongo is not the primary backend right now.

---

## L2: Status fields are untyped strings

**Where**: `AnalysisJobRow.status`, `AnalysisDbRow.status`

**Problem**: Plain `string` type — easy to typo in service code with no
compile-time safety.

**Fix**: Use string literal union types (`'pending' | 'running' | 'completed' | 'failed'`).

---

## L3: `assemblies` query param is comma-separated string

**Where**: `searchFeatures`, `getByIndexedId` endpoints

**Problem**: Comma-separated strings instead of proper array query params. Fragile
parsing (`assemblies.split(',')`) with no validation.

**Fix**: Use NestJS `@Query('assemblies', new ParseArrayPipe())` or accept
repeated query params (`?assemblies=a&assemblies=b`).
