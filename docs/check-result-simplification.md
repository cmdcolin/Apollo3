# CheckResult Data Model Simplification

## Summary

Replaced the `ids: string[]` JSON array on `CheckResultEntity` with a single
indexed `featureId: string` column. This eliminates a data integrity risk,
simplifies the code, and improves query performance.

## Data Integrity Issue (Fixed)

The previous implementation had a **false-positive matching bug** in the
`findByFeatureId` and `deleteByFeatureIdsAndName` methods:

```sql
-- Old query: LIKE with leading wildcard on JSON blob
WHERE ids LIKE '%"feat-1"%'
```

This could match `"feat-1"` inside `["feat-1", "feat-2"]` (correct), but also
`"feat-123"` inside `["feat-123"]` (incorrect — partial ID match). The code
mitigated this with a second in-memory `Array.includes()` filter, but:

1. **Race condition risk**: Between the SQL query and in-memory filter, other
   processes could modify the data, leading to stale results being filtered
2. **Silent false negatives**: If the LIKE query returned no candidates (despite
   valid matches existing due to JSON encoding edge cases), the in-memory filter
   had nothing to work with
3. **Deletion integrity**: `deleteByFeatureIdsAndName` used the same two-stage
   approach — if the in-memory filter missed a match, orphaned check results
   would accumulate in the database

These risks were low in practice because feature IDs are long hex strings
(ObjectID format), but the pattern was architecturally unsound.

## Root Cause Analysis

The JSON array was over-engineered. Both check implementations (CDSCheck,
TranscriptCheck) always produce exactly one feature ID per check result — the
mRNA/transcript being checked. The array existed to support a hypothetical
multi-feature check that was never implemented.

## Solution

Replaced `ids: string[]` with `featureId: string` throughout the full stack:

| Layer       | Before                                  | After                                 |
| ----------- | --------------------------------------- | ------------------------------------- |
| Entity      | `ids: p.json<string[]>()`               | `featureId: p.string()` + index       |
| Repository  | LIKE + in-memory filter                 | Direct indexed `{ featureId }` lookup |
| MST model   | `types.array(types.safeReference(...))` | `types.safeReference(...)`            |
| Check impls | `ids: [feature._id]`                    | `featureId: feature._id`              |
| Frontend    | `[feature] = checkResult.ids`           | `feature = checkResult.featureId`     |

### Performance improvement

- **Before**: Full table scan (LIKE with leading wildcard) + deserialization of
  every matching JSON blob + in-memory filtering
- **After**: Single indexed lookup on `featureId` column — O(log n) via B-tree

### Code reduction

The `MikroOrmCheckResultRepository` was reduced from 121 lines to 96 lines. The
`deleteByFeatureIdsAndName` method went from a 17-line two-stage query to a
3-line direct delete.

## Files Changed

- `packages/apollo-entities/src/entities/CheckResultEntity.ts`
- `packages/apollo-entities/src/repositories/MikroOrmCheckResultRepository.ts`
- `packages/apollo-common/src/repositories/CheckResultRepository.ts`
- `packages/apollo-mst/src/CheckResult.ts`
- `packages/apollo-shared/src/Checks/CDSCheck.ts`
- `packages/apollo-shared/src/Checks/TranscriptCheck.ts`
- `packages/apollo-collaboration-server/src/checks/checks.service.ts`
- `packages/jbrowse-plugin-apollo/src/util/displayUtils.ts`
- `packages/jbrowse-plugin-apollo/src/LinearApolloDisplay/components/CheckResultWarnings.tsx`
- `packages/jbrowse-plugin-apollo/src/LinearApolloSixFrameDisplay/components/LinearApolloSixFrameDisplay.tsx`
- `packages/jbrowse-plugin-apollo/src/session/session.ts`

## Migration

Existing SQLite databases will need schema recreation (`orm.schema.refresh()` on
server startup handles this automatically). The old `ids` JSON column is dropped
and replaced with `featureId`.

## Also Done: Repository Instance Caching

`DatabaseService` previously created a new repository instance on every property
access (getter). Repository instances are now created once in the constructor
and reused as `readonly` properties. This is safe because the injected
`EntityManager` uses `AsyncLocalStorage` (via `RequestContext` middleware) for
per-request isolation — the same EM reference routes to different request
contexts automatically.

This eliminates ~12 object allocations per HTTP request (one per repository
type).
