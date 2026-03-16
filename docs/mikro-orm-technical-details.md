# Technical Details: Relational Migration

Worked examples, tradeoff analysis, and schema assessment.

## Worked Example: Changing an Exon Boundary

When an annotator moves an exon boundary outward, up to three rows may change:
the exon, the transcript (if exon extends beyond it), and the gene.

- **MongoDB**: Scan `allIds` → load entire gene document (all 50 exons to change
  1. → walk nested structure → modify one field → write everything back
- **Relational**: Three targeted single-row updates. Nothing else read or
  written. No risk of overwriting a concurrent edit to a different exon.

**Open question**: Both models rely on the client to send correct parent
boundary updates. A server-side parent boundary verification after child
coordinate changes would make the system defensively correct.

## Where Relational Is Harder

### Gene tree loading for range queries

The most common read: "get all features overlapping this viewport."

- **MongoDB**: One query returns complete nested gene trees.
- **Relational**: Two steps: (1) find root features by range (indexed, fast),
  (2) load all descendants via recursive CTE.

`findDescendantsOfMany` already batches all roots into one CTE query. A
`root_id` denormalization column has been proposed but introduces a sync burden
— **defer unless profiling proves this is a bottleneck**.

### Text search

Current `LIKE`-based search is weaker than MongoDB's text indexes. SQLite FTS5
and PostgreSQL tsvector are both mature built-in replacements requiring no
architectural changes.

### Tradeoff summary

| Operation                     | Status     | Notes                                    |
| ----------------------------- | ---------- | ---------------------------------------- |
| Gene tree loading             | Acceptable | Recursive CTEs batch efficiently         |
| Gene/assembly deletion        | **Fixed**  | `ON DELETE CASCADE` on all FKs           |
| Bulk queries (search, export) | **Fixed**  | Batched `IN` filters                     |
| N+1 query patterns            | **Fixed**  | Level-batched BFS, in-memory parent maps |
| Feature counting              | **Fixed**  | `em.count()` instead of load-all         |
| Full-text search              | Fixable    | FTS5 / tsvector                          |
| Single-feature edits          | Faster     | One row vs full document                 |
| Concurrent edits              | Safer      | Separate rows, no contention             |
| Large imports                 | Better     | Streaming, transactions, no size limit   |

## Schema Assessment

### What is solid

- One row per feature with parent FK, coordinate columns, composite index on
  `(refSeq, min, max)`
- 13 entities in ~330 lines, each mapping to a table with typed columns
- Clean separation: entities define structure, repositories handle queries,
  change classes contain business logic

### Implemented improvements

1. **CASCADE deletes** on all FKs — assembly deletion is a single `deleteById`
2. **Index on `FeatureEntity.parent`** — tree traversal uses indexed queries
3. **Index on `RefSeqEntity.assembly`** — assembly lookups indexed
4. **Index on `CheckResultEntity.name`** — check filtering indexed
5. **Batched descendant queries** — BFS with `IN` filters (D queries per tree
   depth, typically 3-4, vs N queries per node)
6. **In-memory parent map for search** — eliminates per-match DB queries

### Remaining improvements

- **(Deferred) `root_id` column** — single-query tree loading, but requires sync
  on reparent. Only if profiling justifies it.

### Schema relationships

```
AssemblyEntity
  └─ RefSeqEntity (FK: assembly)
       ├─ FeatureEntity (FK: refSeq; FK: parent → self)
       ├─ RefSeqChunkEntity (FK: refSeq)
       └─ CheckResultEntity (FK: refSeq)

ChangeEntity (FK: reverts → self, for undo chain)
ExportEntity (FK: assembly)
UserEntity, FileEntity, CheckEntity, JBrowseConfigEntity, CounterEntity (standalone)
```

All FKs have CASCADE delete.

## Schema Migrations

MongoDB has no formal migration system. MikroORM provides timestamped migration
files (like Liquibase/Rails) that are committed to the repo, run in order on
deploy, and can be rolled back.

Currently using `SchemaGenerator.updateSchema()` at startup (appropriate for
development). Production should transition to explicit committed migration files
for auditability.

## Multi-Database Repository Factory

| `DB_BACKEND`       | Feature Repository          | Tree Strategy                           |
| ------------------ | --------------------------- | --------------------------------------- |
| `sqlite` (default) | `MikroOrmFeatureRepository` | Recursive CTEs                          |
| `postgresql`       | `MikroOrmFeatureRepository` | Recursive CTEs                          |
| `mongo`            | `MongoFeatureRepository`    | Iterative BFS via generic EntityManager |

All other repositories use `MikroOrm*Repository` implementations with the
generic `EntityManager` API (works with any driver).
