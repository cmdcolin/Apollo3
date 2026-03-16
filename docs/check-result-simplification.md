# CheckResult Data Model Simplification

## Change

Replaces `ids: string[]` JSON array on `CheckResultEntity` with a single
indexed `featureId: string` column.

## Why

On origin/main, both existing check implementations produce exactly one feature
ID per result. The array is designed for a multi-feature check scenario that has
not been needed. If that scenario arises, a junction table would be a better fit
than a JSON array.

The `LIKE`-based query on the JSON blob on origin/main has a false-positive
matching bug (`"feat-1"` can match `"feat-123"`), requires a two-stage
query+filter pattern, and prevents indexing.

## Impact

| Aspect | Current (origin/main) | Proposed |
|--------|--------|-------|
| Query | `LIKE '%"id"%'` + in-memory filter (full table scan) | Indexed `WHERE featureId = ?` (O(log n)) |
| Entity | `ids: p.json<string[]>()` | `featureId: p.string()` + index |
| MST | `types.array(types.safeReference(...))` | `types.safeReference(...)` |
| Repository | 121 lines, 17-line two-stage delete | 96 lines, 3-line direct delete |

## Also Done: Repository Instance Caching

On origin/main, `DatabaseService` creates new repository instances on every
getter call. This change creates them once in the constructor and reuses them —
eliminates ~12 object allocations per HTTP request. Safe because
`RequestContext` middleware provides per-request EM isolation via
`AsyncLocalStorage`.
