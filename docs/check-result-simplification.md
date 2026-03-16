# CheckResult Data Model Simplification

## Change

Replaced `ids: string[]` JSON array on `CheckResultEntity` with a single
indexed `featureId: string` column.

## Why

Both existing check implementations produce exactly one feature ID per result.
The array was designed for a multi-feature check scenario that has not been
needed. If that scenario arises in the future, a junction table would be a
better fit than a JSON array.

The `LIKE`-based query on the JSON blob had a false-positive matching bug
(`"feat-1"` could match `"feat-123"`), required a two-stage query+filter
pattern, and prevented indexing.

## Impact

| Aspect | Before | After |
|--------|--------|-------|
| Query | `LIKE '%"id"%'` + in-memory filter (full table scan) | Indexed `WHERE featureId = ?` (O(log n)) |
| Entity | `ids: p.json<string[]>()` | `featureId: p.string()` + index |
| MST | `types.array(types.safeReference(...))` | `types.safeReference(...)` |
| Repository | 121 lines, 17-line two-stage delete | 96 lines, 3-line direct delete |

## Also Done: Repository Instance Caching

`DatabaseService` previously created new repository instances on every getter
call. Now created once in constructor and reused — eliminates ~12 object
allocations per HTTP request. Safe because `RequestContext` middleware provides
per-request EM isolation via `AsyncLocalStorage`.
