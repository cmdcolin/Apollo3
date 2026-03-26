# Bug Fixes, Simplifications & Code Quality

## Bugs Fixed

### 1. updateChecks iterating check results as features

`assemblies.service.ts` — on origin/main, `findByRange()` returns
`[features, checkResults]`. The code iterates both arrays, passing check result
IDs to `checkFeature()`. **Fix**: Split into `findFeaturesByRange` (features
only). Check results fetched separately via `GET /checks/range`.

### 2. RefSeqsService.remove() deletes wrong scope (dead code)

On origin/main, this looks up one refSeq by ID, then calls `deleteByAssembly()`
which deletes ALL refSeqs for the assembly. **Fix**: Simplified to accept
`assemblyId` directly.

### 3. User location endpoint encoding bug

On origin/main, frontend sends `URLSearchParams(JSON.stringify(locations))` —
garbled data, 500 errors on every location update. **Fix**: Proper JSON with
`Content-Type: application/json`. Also simplified from array of all visible
regions to single primary region (users view one region at a time).

## Architectural Simplifications

### Developer setup

On origin/main, development requires 4 parallel processes (shared watch + NestJS

- plugin dev server + sibling jbrowse-components clone via justfile). This
  change reduces it to a single NestJS server on port 3999. Removes
  `npm-run-all`, `concurrently`, `serve`, justfile. Setup becomes
  `pnpm install && pnpm start`.

### WebSocket channels

On origin/main, WebSocket uses per-refSeq channels
(`${assemblyId}-${refSeqName}`). This change consolidates to a single `COMMON`
channel. Removes 12 lines of DB queries per change (feature→refSeq→name
lookups), `ensureAssemblySocket()` (25 lines), `haveDataForChange()` (12 lines).
Safe because annotation edit volume is human-speed. Channel name constants
extracted to shared `Messages.ts`.

### InternetAccount removal

Removes the `ApolloInternetAccount` JBrowse abstraction (~500 lines, 6 files).
Cookie auth makes it redundant — `credentials: 'same-origin'` handles
everything. WebSocket and change tracking move to session model. `baseURL`,
`role`, `userId` now come from `ApolloPlugin` config instead of JWT decode.

### 4. deleteDescendants bypasses history subscriber

`MikroOrmFeatureRepository.deleteDescendants()` and the Mongo equivalent used
`nativeDelete()`, which skips MikroORM lifecycle hooks. The
`FeatureHistorySubscriber` never recorded descendant deletions, so undoing a
delete that had children silently lost them. **Fix**: Load entities and remove
through the unit-of-work so the subscriber fires for every row.

### 5. findByRole returns single user

`UserRepository.findByRole()` used `em.findOne()`, returning only the first
matching user. The `GET /users/admin` endpoint returned one admin when there
could be many. **Fix**: Changed to `em.find()` returning `UserRow[]`.

### 6. Undo has no authorization check

Any User-role user could undo any other user's change by posting
`{ sequence: N }`. **Fix**: Check `changedBy === user.email` on history records.
Admin users are exempt.

### 7. addFeature duplicate ID causes 500

Client-controlled `_id` with no conflict detection. A duplicate ID caused an
opaque primary key violation (500). **Fix**: Pre-check with `findByIds()` and
return 409 Conflict.

### 8. No runtime DTO validation

All feature DTOs were plain TypeScript interfaces. Malformed requests reached
the database layer unchecked. **Fix**: Zod schemas with `ZodValidationPipe` on
all feature mutation and query endpoints.

### 9. GFF3-specific attribute stripping in split operations

`splitExon` and `splitTranscript` deleted `gff_id`/`gff_name` from attributes
when creating new features. This hardcoded GFF3 format knowledge into the
feature model. **Fix**: Attributes are copied as-is — they're just data.

## Code Simplification

| Change                | Current                                                   | Proposed                                                       |
| --------------------- | --------------------------------------------------------- | -------------------------------------------------------------- |
| API separation        | `getFeatures` returns `[features, checkResults]` tuple    | Separate endpoints, parallel fetch                             |
| Export service        | 111-line monolith                                         | Focused helpers (`writeGFF3Header`, `writeGFF3Features`, etc.) |
| GFF3 export           | Duplicate hierarchy assembly (~40 lines)                  | Shared `assembleFeatureTrees()`                                |
| ServerDataStore       | Anonymous function wrappers around `filesService` methods | Direct `filesService` reference                                |
| findByFeatureIds      | Set-based dedup after `SELECT DISTINCT`                   | DB handles it                                                  |
| RefSeqsService.update | 12-line manual property mapping                           | Spread operator (4 lines)                                      |
| Dev Container         | MongoDB extension + `mongosh` + port 27017                | PostgreSQL + port 5432                                         |
