# Technical Notes

Deep technical analysis of the flat-row data model, migration cleanup, and
remaining improvement opportunities.

## Flat Rows vs Nested Documents: Operation-by-Operation

### Single-feature edits (most common)

All single-feature operations (change coordinates, type, strand, attributes)
follow the same pattern:

- **MongoDB**: Load entire gene doc → walk tree → modify → save whole doc (~70 lines)
- **Flat rows**: Look up one row → update → done (2 queries, ~15 lines)

Flat rows produce shorter code, fewer database reads/writes, and less risk of
unrelated data being touched. The tradeoff is that features are now on separate
rows, so operations that need the full gene tree (like validation checks) require
an extra assembly step — a recursive query to collect descendants. For single
edits this cost doesn't apply.

### Adding features

| Operation | MongoDB | Flat rows | Verdict |
|-----------|---------|-----------|---------|
| New top-level gene | Create one nested doc | Flatten snapshot, batch insert | Roughly equal |
| Add exon to existing mRNA | Load gene, insert child, update `allIds`, save whole doc | Insert one row with `parentId`. Existing rows untouched. | Simpler |
| GFF3 import | One doc at a time, no transactions (16MB limit), OOM on large files | Flatten to rows, batch insert, full transaction support | Simpler, with transaction safety |

### Deleting features

| Operation | MongoDB | Flat rows | Verdict |
|-----------|---------|-----------|---------|
| Delete top-level gene | Delete one document | `ON DELETE CASCADE` handles children | Equal |
| Delete exon from mRNA | Load gene, find exon in tree, remove, update `allIds`, save | Delete one row | Simpler |

### Structural edits

| Operation | MongoDB | Flat rows | Verdict |
|-----------|---------|-----------|---------|
| Split exon | Load gene, create two children, update `allIds`, save | Insert two rows, delete old row | Simpler |
| Merge exons | Load gene, merge in memory, save | Update first exon bounds, delete second | Simpler |
| Merge transcripts | All in-memory on one document, single save | Query children separately, reparent, delete. N+1 issue. | More complex (fixable with batch UPDATE) |

Merging transcripts is the clearest case where nested documents have an
advantage — all children are already in memory. With flat rows, this requires
separate queries and reparenting, though batching can reduce the overhead.

### Undo operations

Delete what forward created, re-insert what forward deleted. No tree navigation
or `allIds` bookkeeping. Simpler in the flat model.

### Read operations

| Operation | MongoDB | Flat rows | Verdict |
|-----------|---------|-----------|---------|
| Features in coordinate range | Returns full nested trees (loads more than needed) | Returns exactly matching features | More precise |
| Find feature by ID | `findOne({allIds: id})` + tree walk | Primary key lookup | Simpler (direct indexed lookup vs array scan) |
| Find all CDS on a chromosome | Load all genes, walk all trees | `WHERE type='CDS' AND refSeq=?` | Simpler (SQL filter vs in-memory traversal) |
| Count features by type | Load all, count in app code | `GROUP BY type` | Simpler (database-level aggregation) |
| Export to GFF3 | Data already nested | Rows map to GFF3 lines directly | Could be simpler |
| Run validation checks | Data already nested | Fetch descendants + assemble tree (one extra step) | Harder (requires recursive query) |
| Text search on attributes | `$text` index (ranked, stemmed) | `LIKE` on JSON column (no ranking, no stemming, false-positive risk) | Currently worse. Fixable with FTS5/tsvector, or a normalized `feature_attribute` table |

For targeted queries (by ID, by type, by range), the relational model benefits
from standard database indexing. For operations that need the full gene tree
(validation, client display), there is an extra step to collect and reassemble
descendants. MongoDB returns these pre-assembled, which is convenient. The cost of
reassembly is modest (one recursive CTE query + O(n) in-memory pass), but it is
a real tradeoff.

### Operations MongoDB does not do well

- **Reparent a feature**: Flat rows: `UPDATE SET parent = :new WHERE _id = :id`.
  MongoDB: load both source/destination gene docs, move between nested Maps,
  update both `allIds`, save both docs.
- **Query across hierarchy**: "genes with exons < 50bp?" — a WHERE clause
  with flat rows. MongoDB: load all gene docs, walk every tree.
- **Stream imports**: Flat rows stream to DB with bounded memory. MongoDB
  requires building nested trees in memory first; OOM on large files.

### Summary

Simple edits (the majority of annotation work) are shorter code, faster, and
touch less data with flat rows. Complex structural edits like transcript merges
require more database round-trips, though this is addressable with batch
queries. Read operations gain precise indexed queries at the cost of a
tree-assembly step when the full hierarchy is needed. The nested document model avoids that assembly step, but at the cost of
loading and rewriting entire genes for every operation — including simple ones.

## Migration Cleanup

### Unified execution path

Removes the dual `executeOnServer()` / `executeOnServerV2()` implementations
from all 23 Change classes and 2 Operation classes. Removes `ServerDataStoreV2`.
Single code path.

### Eliminated FeatureChange helpers

Five tree navigation methods (`getFeatureFromId`, `getChildFeatureIds`,
`generateNewIds`, `addChild`, `findAndDeleteChildFeature`) are specific to the
nested document model and are no longer needed with flat rows. The MongoDB
backend retains its own tree traversal via `MongoFeatureRepository`.

### Removed dead code

- `backendPostValidate()` — never called from the active code path. Entire
  validation layer (`ParentChildValidation`, `ValidationSet`) removed.
- `LocalGFF3DataStore` / `executeOnLocalGFF3` — never implemented (all throw
  "not implemented"). Removed from all Operations and Changes.
- `allIds` on `AddFeatureChangeDetails` — carried forward as dead weight in
  the serialized change format. Removed from interface and all client code.
- `@apollo-annotation/schemas` dependency — Mongoose schema types removed from
  `apollo-common` and `apollo-shared`.

## Potential Optimizations

### R-tree spatial indexes

Current B-tree on `(refSeq, min, max)` narrows on one bound at a time. R-tree
indexes (SQLite native, PostgreSQL GiST) prune on both bounds simultaneously —
useful for dense feature regions.

### Bulk import via COPY

PostgreSQL's `COPY FROM` inserts millions of rows/second from flat files. A
GFF3 → CSV → COPY pipeline would be faster than ORM-level insertion.

### Explicit migrations

Currently using `SchemaGenerator.updateSchema()` at startup. Transitioning to
committed migration files would provide auditable, reversible schema evolution —
restoring the discipline Apollo2 had with Liquibase.

## NestJS Code Issues Found

| Issue | Location | Fix |
|-------|----------|-----|
| No DTO validation (invalid data reaches service layer) | 7 DTO files | Add `class-validator` decorators, enable `ValidationPipe` |
| ChangesService has too many responsibilities | `changes.service.ts` | Extract WebSocket notification to EventEmitter2 |
| Duplicated ServerDataStore factory | `changes.service.ts`, `operations.service.ts` | Extract to shared injectable |
| Silent auth failures (generic 403) | `validation.guards.ts` | Throw `ForbiddenException` with message |
| Duplicate OAuth guards | `google.guard.ts`, `microsoft.guard.ts` | Generic `OAuthGuard` factory |
| Inefficient admin check on login | `authentication.service.ts` | `countByRole()` instead of `findAll()` |

Security issues (OAuth file-read bug, open redirect, etc.) are tracked in the
*Authentication & Security Audit* section.
