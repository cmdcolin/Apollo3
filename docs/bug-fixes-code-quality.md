# Bug Fixes & Code Quality

## Bugs Fixed

### 1. updateChecks iterating check results as features

`assemblies.service.ts` — `findByRange()` returned `[features, checkResults]`.
The code iterated both arrays, passing check result IDs to `checkFeature()`.
**Fix**: Split into `findFeaturesByRange` (features only). Check results
fetched separately via `GET /checks/range`.

### 2. RefSeqsService.remove() deleted wrong scope (dead code)

Looked up one refSeq by ID, then called `deleteByAssembly()` which deletes ALL
refSeqs for the assembly. **Fix**: Simplified to accept `assemblyId` directly.

### 3. User location endpoint encoding bug

Frontend sent `URLSearchParams(JSON.stringify(locations))` — garbled data, 500
errors on every location update. **Fix**: Proper JSON with
`Content-Type: application/json`.

## Code Simplification

| Change | Before | After |
|--------|--------|-------|
| API separation | `getFeatures` returned `[features, checkResults]` tuple | Separate endpoints, parallel fetch |
| Export service | 111-line monolith | Focused helpers (`writeGFF3Header`, `writeGFF3Features`, etc.) |
| GFF3 export | Duplicate hierarchy assembly (~40 lines) | Shared `assembleFeatureTrees()` |
| ServerDataStore | Anonymous function wrappers around `filesService` methods | Direct `filesService` reference |
| findByFeatureIds | Set-based dedup after `SELECT DISTINCT` | DB handles it |
| RefSeqsService.update | 12-line manual property mapping | Spread operator (4 lines) |
