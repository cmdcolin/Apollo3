# Technical Notes

Deep technical analysis of the flat-row data model, migration cleanup, and
remaining improvement opportunities.

## Flat Rows vs Nested Documents: Operation-by-Operation

### Single-feature edits (most common)

All single-feature operations (change coordinates, type, strand, attributes)
follow the same pattern:

- **MongoDB**: Load entire gene doc → walk tree → modify → save whole doc (~70 lines)
- **Flat rows**: Look up one row → update → done (2 queries, ~15 lines)

**Verdict**: Unambiguously better with flat rows.

### Adding features

| Operation | MongoDB | Flat rows | Verdict |
|-----------|---------|-----------|---------|
| New top-level gene | Create one nested doc | Flatten snapshot, batch insert | Roughly equal |
| Add exon to existing mRNA | Load gene, insert child, update `allIds`, save whole doc | Insert one row with `parentId`. Existing rows untouched. | Simpler |
| GFF3 import | One doc at a time, no transactions (16MB limit), OOM on large files | Flatten to rows, batch insert, full transaction support | Much simpler |

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

### Undo operations

Delete what forward created, re-insert what forward deleted. No tree navigation
or `allIds` bookkeeping. **Simpler** across the board.

### Read operations

| Operation | MongoDB | Flat rows | Verdict |
|-----------|---------|-----------|---------|
| Features in coordinate range | Returns full nested trees (loads more than needed) | Returns exactly matching features | More precise |
| Find feature by ID | `findOne({allIds: id})` + tree walk | Primary key lookup | Much simpler |
| Find all CDS on a chromosome | Load all genes, walk all trees | `WHERE type='CDS' AND refSeq=?` | Much simpler |
| Count features by type | Load all, count in app code | `GROUP BY type` | Much simpler |
| Export to GFF3 | Data already nested | Rows map to GFF3 lines directly | Could be simpler |
| Run validation checks | Data already nested | Fetch descendants + assemble tree (one extra step) | Slightly harder |
| Text search | `$text` index (slow writes) | Currently `LIKE` only. Fixable with FTS5/tsvector. | Currently worse, fixable |

### Operations MongoDB couldn't do well

- **Reparent a feature**: Flat rows: `UPDATE SET parent = :new WHERE _id = :id`.
  MongoDB: load both source/destination gene docs, move between nested Maps,
  update both `allIds`, save both docs.
- **Query across hierarchy**: "genes with exons < 50bp?" — just a WHERE clause
  with flat rows. MongoDB: load all gene docs, walk every tree.
- **Stream imports**: Flat rows stream to DB with bounded memory. MongoDB
  required building nested trees in memory first; OOM on large files.

### The bottom line

Simple edits (the vast majority of operations) are cheaper with flat rows.
Complex structural edits (transcript merges) cost more but are rare and fixable
with batch queries. Read operations gain precise indexed queries at the cost of
a cheap tree-assembly step when the full hierarchy is needed.

## Migration Cleanup

### Unified execution path

Removed dual `executeOnServer()` / `executeOnServerV2()` implementations from
all 23 Change classes and 2 Operation classes. Removed `ServerDataStoreV2`.
Single code path.

### Eliminated FeatureChange helpers

Five MongoDB-specific tree navigation methods (`getFeatureFromId`,
`getChildFeatureIds`, `generateNewIds`, `addChild`,
`findAndDeleteChildFeature`) are unnecessary with flat rows and were deleted.

### Removed dead code

- `backendPostValidate()` — never called from active code path. Entire
  validation layer (`ParentChildValidation`, `ValidationSet`) removed.
- `LocalGFF3DataStore` / `executeOnLocalGFF3` — never implemented (all threw
  "not implemented"). Removed from all Operations and Changes.
- `allIds` on `AddFeatureChangeDetails` — carried forward as dead weight in
  serialized change format. Removed from interface and all client code.
- `@apollo-annotation/schemas` dependency — Mongoose schema types removed from
  `apollo-common` and `apollo-shared`.

## Potential Optimizations

### R-tree spatial indexes

Current B-tree on `(refSeq, min, max)` narrows on one bound at a time. R-tree
indexes (SQLite native, PostgreSQL GiST) prune on both bounds simultaneously —
useful for dense feature regions.

### Bulk import via COPY

PostgreSQL's `COPY FROM` inserts millions of rows/second from flat files. A
GFF3 → CSV → COPY pipeline would be dramatically faster than ORM-level
insertion.

### Explicit migrations

Currently using `SchemaGenerator.updateSchema()` at startup. Transitioning to
committed migration files would provide auditable, reversible schema evolution —
restoring the discipline Apollo2 had with Liquibase.

## NestJS Code Issues Found

| Issue | Location | Fix |
|-------|----------|-----|
| OAuth client ID file-read bug (file contents overwritten by path) | `authentication.service.ts:81-83` | Use `microsoftClientID?.trim()` on the value, not the path |
| No DTO validation (invalid data reaches service layer) | 7 DTO files | Add `class-validator` decorators, enable `ValidationPipe` |
| ChangesService has too many responsibilities | `changes.service.ts` | Extract WebSocket notification to EventEmitter2 |
| Duplicated ServerDataStore factory | `changes.service.ts`, `operations.service.ts` | Extract to shared injectable |
| Silent auth failures (generic 403) | `validation.guards.ts` | Throw `ForbiddenException` with message |
| Duplicate OAuth guards | `google.guard.ts`, `microsoft.guard.ts` | Generic `OAuthGuard` factory |
| Inefficient admin check on login | `authentication.service.ts` | `countByRole()` instead of `findAll()` |
