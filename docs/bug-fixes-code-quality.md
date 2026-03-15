# Bug Fixes & Code Quality Improvements

## Bugs Fixed

### 1. updateChecks iterating check results as features (Pre-existing)

**File**: `assemblies.service.ts:updateChecks()`

When updating an assembly's enabled checks, the code re-ran checks on all
features in the assembly. But `featuresService.findByRange()` returns a
`[features, checkResults]` tuple. The code iterated both arrays, passing check
result IDs to `checkFeature()` as if they were feature IDs. The check-result
iterations silently failed (feature not found).

**Fix**: Split `findByRange` into `findFeaturesByRange` (returns only features)
and removed `findCheckResultsByRange` (check results already have their own
endpoint at `GET /checks/range`). The `getFeatures` API endpoint now returns
only features. The frontend fetches check results separately via
`BackendDriver.getCheckResults()` which calls `GET /checks/range`. This
eliminates the confusing tuple and makes both concepts independently fetchable.

### 2. RefSeqsService.remove() deleted wrong scope (Pre-existing, dead code)

**File**: `refSeqs.service.ts:remove()`

The method looked up a refSeq by ID, then called `deleteByAssembly()` which
deletes ALL reference sequences for the assembly — not just the requested one.
This is dead code (no controller calls it), but would be destructive if ever
used.

**Fix**: Simplified to accept `assemblyId` directly, matching the underlying
`deleteByAssembly()` semantics.

### 3. User location endpoint encoding bug (Pre-existing, fixed earlier)

**File**: `users.controller.ts`, `ApolloInternetAccount/model.ts`

The frontend sent user locations as `URLSearchParams(JSON.stringify(...))`,
producing garbled URL-encoded data. The controller used a fragile
`Object.keys` + `JSON.parse` workaround that produced 500 errors on every
location update.

**Fix**: Frontend sends proper JSON with `Content-Type: application/json`.
Endpoint simplified to accept a single `UserLocationDto | null`.

## Code Deduplication

### GFF3 export hierarchy assembly

**File**: `export.service.ts`

The export service had its own implementation of feature hierarchy assembly
(`buildChildrenMap` + `featureRowToSnapshot`, ~40 lines). This duplicated the
shared `assembleFeatureTrees()` function from `apollo-common`. Replaced with the
shared function.
