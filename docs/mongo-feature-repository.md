# MongoFeatureRepository

## Status

`MongoFeatureRepository` is the non-SQL fallback for feature tree traversal. It
is used when `DB_BACKEND=mongo` (selected in `DatabaseService`).

Despite the name, it does **not** use the MongoDB driver directly. It uses
MikroORM's generic `EntityManager` API (`em.find`, `em.nativeDelete`) — the same
abstraction used by every other repository. It would work with any MikroORM
driver (SQLite, PostgreSQL, MongoDB).

## Why it exists

The default `MikroOrmFeatureRepository` uses recursive CTEs (SQL
`WITH RECURSIVE`) for tree traversal operations like `findDescendants` and
`findRootParentsOfMany`. These are efficient but require a SQL backend.

`MongoFeatureRepository` provides the same operations using iterative BFS:
walking the tree level-by-level with repeated `em.find()` calls. The total
number of queries equals the tree depth (typically 3-4 levels), not the number
of features.

## Operations

| Method                  | Strategy                                     |
| ----------------------- | -------------------------------------------- |
| `findDescendants`       | Iterative BFS downward via `parent` field    |
| `deleteDescendants`     | BFS to collect IDs, then bulk `nativeDelete` |
| `searchText`            | Load all features for refSeqs, filter in JS  |
| `findByIndexedId`       | Load all features, check attributes in JS    |
| `findRootParentsOfMany` | Walk parent chains upward in batches         |

## Performance considerations

The `searchText` and `findByIndexedId` methods load all features for the given
refSeqs into memory and filter in JavaScript. This works for small-to-medium
datasets but does not scale to large assemblies. The SQL-backed repository uses
database-level queries for these operations.

## Possible future changes

- Rename to `IterativeFeatureRepository` or `BfsFeatureRepository` to reflect
  that it is not MongoDB-specific
- If MongoDB support is eventually dropped, this class could be removed entirely
