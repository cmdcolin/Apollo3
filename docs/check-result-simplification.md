# CheckResult Data Model Simplification

## Change

Replaced `ids: string[]` JSON array on `CheckResultEntity` with a single
indexed `featureId: string` column.

## Why

The JSON array was over-engineered — both check implementations always produce
exactly one feature ID per result. The array existed for a hypothetical
multi-feature check that was never implemented.

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
