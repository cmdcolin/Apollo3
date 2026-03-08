# Migrating from MongoDB to the New Database Backend

Apollo3 has moved from MongoDB to a relational database (SQLite or PostgreSQL)
using MikroORM. This guide covers why we made the change, what got better, what
got worse, and how to migrate your data.

## Why We Made the Change

The original MongoDB design stored an entire gene — with all its mRNAs, exons,
and CDS features — inside a single nested document. This seemed like a natural
fit for hierarchical gene models, but it caused real problems as datasets grew.

### What Was Wrong with the MongoDB Approach

#### Editing one exon rewrote the entire gene

In MongoDB, changing a single exon's coordinates required loading the full gene
document (including every child feature) into memory, modifying the exon, then
writing the entire document back. For a gene with hundreds of exons, this meant
reading and writing hundreds of kilobytes of data to change a single number.

The new approach stores each feature as its own database row. Editing an exon
updates one row. Nothing else is touched.

#### The `allIds` hack

Because children were embedded inside their parent document, there was no way to
ask the database "which gene contains exon X?" MongoDB can only search top-level
documents, not their nested contents. To work around this, every gene document
maintained a flat list called `allIds` containing the ID of every descendant:

```
allIds: ["mRNA_1", "exon_1", "exon_2", "CDS_1", "CDS_2", ...]
```

This list had to be kept in sync manually. Every time a child was added,
deleted, or moved, the root document's `allIds` array had to be updated and the
entire document saved. If the list got out of sync with the actual children,
features became unfindable — a silent data corruption.

Even after finding the root document via `allIds`, the code still had to walk
the entire nested tree in memory to locate the actual feature.

The new approach eliminates `allIds` entirely. Every feature has a primary key.
Finding any feature is a direct lookup — no scanning, no tree walking.

#### Two users editing the same gene blocked each other

When two users edited different exons of the same gene at the same time, both
had to load, modify, and save the same root document. MongoDB's document-level
locking serialized these writes. In the worst case, the second user's save would
overwrite the first user's changes with no warning.

In the new schema, each exon is its own row. Two users editing different exons
write to different rows. There is no contention and no risk of lost edits.

#### MongoDB's 16MB document size limit

MongoDB enforces a hard 16MB limit per document. Since the entire gene hierarchy
lived in one document, a gene with thousands of exons carrying many attributes
could approach or exceed this limit.

The new schema has no such constraint. Each feature is a separate row with no
size dependency on its siblings.

#### The wildcard text index slowed down writes

The MongoDB schema created a text index on every string field in every nested
child:

```typescript
FeatureSchema.index({ '$**': 'text' })
```

For a gene with hundreds of descendants, this created an enormous index that had
to be updated on every write. The new schema does not carry this overhead.

#### `markModified()` bugs

Mongoose (the MongoDB library) cannot detect changes to nested Map objects.
Every operation that modified a child feature had to explicitly call
`markModified('children')` before saving. Forgetting this meant the change
silently failed to persist. This was a recurring source of bugs.

The new schema has no equivalent footgun. Each row tracks its own state.

#### MongoDB required a replica set even for development

MongoDB transactions only work with a replica set. Even for local development,
Apollo's Docker setup had to configure multiple MongoDB nodes with replica set
initialization scripts. This added operational complexity for something that
should be simple.

SQLite (the default new backend) is a single file. No server, no configuration.

#### Large imports could not use transactions

MongoDB has a 16MB limit on transaction size. The code explicitly documented
this limitation with comments like "We cannot use Mongo 'session' / transaction
here because Mongo has 16 MB limit for transaction." Large GFF3 imports had to
work around this using a `status: -1` soft-delete pattern: features were created
in a "hidden" state, then activated in bulk if the import succeeded, or deleted
if it failed. This was fragile and complex.

The new relational backend has no transaction size limit. An entire GFF3 import
can be wrapped in a single transaction that either commits completely or rolls
back completely.

## What Got Better (Improvements)

These are things that are strictly better in the new approach.

### Direct feature lookup

Any feature — whether it's a top-level gene or a deeply nested exon — can be
found by its ID with a single database query. No `allIds` array, no tree
traversal. This replaces what was previously a three-step process (array index
scan, full document load, recursive tree walk).

### Editing is surgical

Changing a single field on a single feature updates one database row. In
MongoDB, the same operation required loading and rewriting the entire gene tree.

### No write contention between users

Two users editing different parts of the same gene no longer compete for the
same document lock. Each feature is an independent row.

### Simpler deployment

SQLite requires no database server at all. PostgreSQL requires one server but no
replica set. Either way, the deployment is dramatically simpler than MongoDB's
minimum viable setup.

### Reliable transactions for large imports

GFF3 file imports can now be fully transactional regardless of size. If the
import fails partway through, everything rolls back cleanly. No `status: -1`
workaround needed.

### Bulk import potential

Because features are independent rows, they can be inserted in bulk.
PostgreSQL's `COPY FROM` can load millions of rows in seconds. SQLite's batch
insert is similarly fast. MongoDB required one-at-a-time insertion into nested
documents, with each insert rewriting the parent document.

### Standard SQL tooling

Data can be inspected with any SQL tool (DB Browser for SQLite, psql, DBeaver)
instead of requiring MongoDB-specific tools like mongosh or Compass.

### Range queries can return individual features

The composite index on `(refSeq, min, max)` allows querying for features in a
coordinate range and getting back exactly the features in that range — including
individual exons — without loading their parent genes. In MongoDB, a range query
returned entire gene trees, and filtering to specific children had to happen in
application code.

## Holistic Assessment: Is "One Row Per Feature" Actually Better?

The single biggest architectural change in this migration is how feature
hierarchies are stored. In MongoDB, a gene and all its children (mRNAs, exons,
CDS features) lived inside one document. In the new schema, each of those is its
own row in a flat table, linked by a `parent` column.

This section walks through the real editing operations that users perform and
honestly assesses which model makes each one simpler, faster, or harder. The
operations are grouped by type to show the pattern clearly.

### Single-feature edits (the most common operations)

These are the bread and butter of annotation — a user clicks on a feature and
changes something about it. They happen far more often than any structural
operation.

| Operation                                 | MongoDB (old)                                                                                                          | Flat rows (new)                                           | Verdict          |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ---------------- |
| Change an exon's start or end coordinate  | Load entire gene doc, walk tree to find exon, modify in memory, `markModified('children')`, save whole doc (~70 lines) | Look up one row, update one column (2 queries, ~15 lines) | **Much simpler** |
| Change a feature's type (e.g. exon → CDS) | Same full-document load/traverse/save cycle                                                                            | Look up row, verify old value, update (2 queries)         | **Much simpler** |
| Change strand                             | Same full-document cycle                                                                                               | Same 2-query pattern                                      | **Much simpler** |
| Change attributes (Name, Dbxref, etc.)    | Same full-document cycle                                                                                               | Same 2-query pattern                                      | **Much simpler** |

The pattern is clear: any operation that touches a single feature is
unambiguously better with flat rows. The code is shorter, there are fewer places
for bugs, and the database work is proportional to what actually changed — one
row, not an entire gene tree.

### Adding features

| Operation                        | MongoDB (old)                                                                                                                                               | Flat rows (new)                                                                             | Verdict           |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------- |
| Add a new top-level gene         | Create one nested document                                                                                                                                  | Flatten snapshot into rows, batch insert                                                    | **Roughly equal** |
| Add an exon to an existing mRNA  | Load gene doc, navigate to mRNA's children Map, insert child, update `allIds`, sort children, save whole doc                                                | Set `parentId` on new row, batch insert. No existing rows touched.                          | **Simpler**       |
| Import features from a GFF3 file | Insert nested documents one at a time. Cannot use transactions for large files (16MB limit). Required `status: -1` workaround. Caused OOM on large imports. | Flatten each feature to rows, batch insert. Full transaction support. Naturally streamable. | **Much simpler**  |

Adding child features to existing parents is where the flat model really helps.
In MongoDB, adding one exon required loading and rewriting the entire gene. In
the flat model, the existing gene row is not touched at all — the new exon is
just a new row that happens to point at the mRNA as its parent.

### Deleting features

| Operation                   | MongoDB (old)                                                                                                                   | Flat rows (new)                                                                | Verdict                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------- |
| Delete a top-level gene     | Delete the whole document (one operation)                                                                                       | Delete the row, then BFS to find and delete all descendants (multiple queries) | **Slightly more complex** |
| Delete an exon from an mRNA | Load gene doc, navigate tree to find exon, remove from parent's children Map, update `allIds`, `markModified('children')`, save | Look up row, delete descendants, delete row (3+ queries)                       | **Roughly equal**         |

Deleting is the one area where nested documents had a natural advantage for
top-level features — deleting one document automatically deleted all its
children. With flat rows, descendants must be found and deleted explicitly. In
practice, the BFS deletion loop is simple and fast (one indexed query per
nesting level), and it could be replaced with a single recursive CTE or an
`ON DELETE CASCADE` foreign key constraint.

### Structural edits (splitting and merging)

These operations change the shape of the feature hierarchy itself.

| Operation              | MongoDB (old)                                                                                 | Flat rows (new)                                                                                                                          | Verdict          |
| ---------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Split an exon into two | Load gene doc, navigate to exon, create two children, update `allIds`, sort, save whole doc   | Create two new rows with parent set, batch insert, delete old row (3 operations)                                                         | **Simpler**      |
| Merge two exons        | Load gene doc, find both exons in tree, merge in memory, update `allIds`, save                | Look up first exon, update its bounds, delete second exon (3-4 queries)                                                                  | **Simpler**      |
| Merge two transcripts  | Load gene doc (both transcripts in same tree), merge children Maps in memory, single `save()` | Query each transcript's children separately, match overlaps, reparent grandchildren one by one, delete. Currently has N+1 query problem. | **More complex** |

Merging transcripts is the one operation that is genuinely harder with flat
rows. It needs to compare children across two parents and reparent
grandchildren, which generates many small queries. The MongoDB version could do
all of this in memory on JavaScript Maps with a single document save at the end.

However, the current N+1 query problem is a code issue, not a schema limitation.
Caching the children list and batching reparenting into a single
`UPDATE ... WHERE parent IN (...)` would reduce the query count dramatically.

### Undo operations

| Operation    | MongoDB (old)                                                                                  | Flat rows (new)                                                            | Verdict     |
| ------------ | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ----------- |
| Undo a merge | Load gene doc, navigate tree, reconstruct original children Maps and `allIds`, save            | Delete the merged result row, re-insert original rows from stored snapshot | **Simpler** |
| Undo a split | Load gene doc, navigate tree, remove split children, re-insert original, update `allIds`, save | Delete the two split rows, re-insert the original row                      | **Simpler** |

Undo operations follow a clean pattern with flat rows: delete what the forward
operation created, then re-create what the forward operation deleted. The stored
snapshots flatten directly into rows. No tree navigation or `allIds` bookkeeping
needed.

### Read operations (queries, export, checks)

| Operation                             | MongoDB (old)                                                                         | Flat rows (new)                                                                                                                                                           | Verdict                      |
| ------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Get features in a coordinate range    | One query returns nested gene docs. Must load full trees even if you only need exons. | One query returns exactly the features in the range, including individual exons.                                                                                          | **Better (more precise)**    |
| Find a feature by ID                  | `findOne({allIds: id})` + recursive tree walk to locate it                            | Direct primary key lookup (one query)                                                                                                                                     | **Much simpler**             |
| Find all CDS features on a chromosome | Load every gene doc, walk each tree filtering by type                                 | `SELECT * FROM feature WHERE type='CDS' AND refSeq=?`                                                                                                                     | **Much simpler**             |
| Count features by type                | Load all docs, walk all trees, count in application code                              | `SELECT type, COUNT(*) FROM feature GROUP BY type`                                                                                                                        | **Much simpler**             |
| Export to GFF3                        | Data already nested, format directly                                                  | Rows map almost directly to GFF3 lines (one line per feature with `Parent=` attribute). Current code unnecessarily reassembles trees first, but this could be simplified. | **Could be simpler**         |
| Run validation checks                 | Data already nested, pass tree to check function                                      | Fetch descendants, assemble tree, pass to check function (one extra step)                                                                                                 | **Slightly more complex**    |
| Search features by text               | `$text` search across all nested fields (slow writes due to wildcard index)           | Currently only `LIKE` on `type` field. Can be improved with FTS5/tsvector.                                                                                                | **Currently worse, fixable** |

Read operations show a clear split. For targeted queries — "find this feature,"
"get features in this range," "count features by type" — flat rows are strictly
better because the database can answer these questions directly with indexes
instead of loading and scanning entire document trees. For operations that need
the full tree structure (checks, client display), there is a small assembly cost
that was not present with nested documents.

### Operations that MongoDB could not do well

Some useful operations were impractical or impossible with the nested document
model. Flat rows make them straightforward.

**Move a feature to a different parent.** Reparenting an exon from one mRNA to
another is a single column update:
`UPDATE feature SET parent = :newParent WHERE _id = :featureId`. In MongoDB,
this required loading both the source and destination gene documents, removing
the child from one nested Map, inserting it into another, updating `allIds` on
both, and saving both documents. If the source and destination were in different
documents, that was two full document rewrites.

Apollo3 does not currently have a dedicated "move feature" operation, but the
flat-row schema makes it trivial to add one.

**Query across the hierarchy.** Questions like "which genes have exons shorter
than 50bp?" or "find all features with a specific Dbxref attribute" required
loading every gene document and scanning every nested child in application code.
With flat rows these are just WHERE clauses.

**Stream features during import.** MongoDB required building nested document
trees in memory before inserting them, and could not use transactions for large
imports due to the 16MB transaction size limit. The server ran out of memory on
large GFF3 files (commit `80a4c9eb`). With flat rows, features can be streamed
directly to the database one row at a time with bounded memory usage, and the
entire import can be wrapped in a single transaction regardless of size.

### Data integrity

In MongoDB, a child could not exist outside its parent document — nesting
enforced structural integrity automatically. With flat rows, a child row can
point to a parent that does not exist (an "orphan"). The application prevents
this by always deleting descendants before deleting a feature, but it is not
currently enforced at the database level.

Adding `ON DELETE CASCADE` to the foreign key would enforce this automatically —
something that was not possible with MongoDB's nested documents.

### Coordinate consistency

In both models, a gene's stored `min` and `max` may temporarily be stale after a
child edit. Neither model automatically updates parent coordinates when a child
changes — both rely on the client to submit separate coordinate-update
operations for affected ancestors.

The UI handles this correctly by computing bounds from children dynamically, so
users never see incorrect coordinates. If automated consistency were ever
needed, the flat model makes it easier: a database trigger or post-operation
hook could query a feature's children and update its bounds. In MongoDB, this
would have required loading and rewriting the entire document.

### The wire format is unchanged

The client still receives nested trees. The `GetFeaturesOperation` fetches flat
rows, then calls `assembleFeatureTrees()` to rebuild the nested structure. This
is a cheap O(n) in-memory conversion. The client has no awareness that the
storage model changed.

### The bottom line

For the operations users perform most often — editing coordinates, changing
types, modifying attributes — the flat-row model is clearly simpler and more
efficient. The code is shorter, there are fewer things that can go wrong, and
each operation touches only the data it needs to.

For complex structural operations like merging transcripts, the flat model
requires more database round-trips and the code is more verbose. But these
operations are infrequent compared to simple edits, and the performance issues
are fixable with straightforward optimizations (batch queries, recursive CTEs,
caching child lists).

For read operations, flat rows enable precise queries (by type, by range, by ID)
that were impossible or expensive with nested documents. The only cost is a
cheap tree-assembly step for operations that need the full hierarchy.

The MongoDB model's main advantage was that complex tree operations could happen
entirely in memory. But this came at the cost of making every operation — even
simple ones — pay the price of loading and saving entire gene trees. The flat
model inverts this trade-off: simple operations are cheap, and complex
operations pay for their complexity explicitly.

Given that simple edits vastly outnumber complex structural changes in a typical
annotation workflow, this is the right trade-off.

## What Got Worse (Problems) and Whether They Can Be Overcome

These are things that are currently worse or different in the new approach. Each
one is assessed for severity and fixability.

### Loading a full gene tree takes multiple queries instead of one

**The problem:** In MongoDB, a single query returned a complete nested gene
tree. In the new schema, fetching a gene with all its descendants requires
multiple queries — one per level of nesting (typically 3-4 for gene → mRNA →
exon/CDS).

**How serious is it?** Not very. Each query is fast (indexed lookups), the total
data transferred is the same, and the queries are to a local SQLite file or a
nearby PostgreSQL server. Typical genomic features are only 3-4 levels deep, so
this means 3-4 fast queries instead of one slower query that loads a large
nested document.

**Can it be overcome?** Yes, fully. Both PostgreSQL and modern SQLite support
recursive queries that can fetch an entire subtree in a single round-trip:

```sql
WITH RECURSIVE tree AS (
  SELECT * FROM feature WHERE _id = :rootId
  UNION ALL
  SELECT f.* FROM feature f
  JOIN tree t ON f.parent_id = t._id
)
SELECT * FROM tree;
```

Alternatively, the current BFS approach can be improved by batching children by
level — querying all children of multiple parents in a single
`WHERE parent IN (...)` query. This reduces round-trips to one per nesting level
regardless of how many features are at each level.

### Text search is less capable

**The problem:** MongoDB had a built-in full-text search engine. The `$text`
operator could search across all string fields (including nested children's
attributes) with tokenization and relevance scoring. The current implementation
uses simple `LIKE '%pattern%'` matching on the feature `type` field only. This
means searching for a gene by its Name attribute does not work yet.

**How serious is it?** Moderate. Users who relied on searching features by
attribute values (Name, gene_biotype, Dbxref, etc.) will find the current search
less useful.

**Can it be overcome?** Yes. Both databases have mature full-text search:

- **SQLite FTS5** is a built-in extension that supports tokenized search with
  ranking. A virtual table alongside the feature table provides fast full-text
  search.
- **PostgreSQL tsvector/tsquery** provides full-text search with GIN indexes and
  relevance ranking.

Both can search across multiple fields including JSON attribute values. And
unlike MongoDB's wildcard text index (which indexed every string field in every
nested child and slowed down every write), a targeted full-text index on
specific fields would be faster for both reads and writes.

### Check result lookups load too much data

**The problem:** In MongoDB, you could efficiently ask "find all check results
that mention feature X" using `db.checkresults.find({ ids: featureId })` because
MongoDB natively indexes array contents. In the new schema, the `ids` field is
stored as a JSON array, which cannot be indexed the same way. The current code
works around this by loading all check results into memory and filtering in
application code.

**How serious is it?** Depends on dataset size. For small to medium annotations,
it's fine. For very large genomes with many active checks, it could become a
bottleneck because every check result row is loaded and scanned.

We investigated whether any other JSON array fields have this problem. They do
not — fields like `changedIds`, `aliases`, `checks` on assemblies, and `causes`
on checks are never queried by containment. They are only read after the entity
is already loaded by primary key or other indexed fields.

**Can it be overcome?** Yes, in multiple ways:

- **Normalize the relationship.** Create a junction table with
  `(check_result_id, feature_id)` columns. This converts the JSON array into a
  proper indexed relational structure.
- **Use database JSON functions.** SQLite's `json_each()` and PostgreSQL's
  `jsonb` containment operators can push the filtering into the database without
  loading everything into memory.
- **Query by coordinates instead.** Check results already have indexed `refSeq`,
  `start`, and `end` fields. For the common case of finding check results in a
  visible region, coordinate-based queries are efficient and don't need the
  `ids` array at all.

### Automatic export cleanup is gone

**The problem:** MongoDB had TTL indexes that automatically deleted export
records after 5 minutes:

```typescript
ExportSchema.index({ createdAt: 1 }, { expires: 300 })
```

The relational backend has no built-in equivalent.

**How serious is it?** Minor. Exports are small records. Even without cleanup,
they don't accumulate to problematic levels quickly.

**Can it be overcome?** Yes, trivially. A NestJS scheduled task can run every
few minutes to delete old exports. Or the export service can clean up expired
records opportunistically whenever a new export is created. Either approach is
simple and more explicit than a database-level TTL index.

### Counter increment is not truly atomic

**The problem:** MongoDB provided an atomic "increment and return" operation
(`$inc`) for the sequence counter. The relational backend reads the counter,
increments it in application code, and writes it back. If two increments ran at
exactly the same time, they could read the same value.

**How serious is it?** Not a problem in practice. Apollo processes changes
sequentially, so counter increments never happen concurrently. This would only
matter if the architecture changed to process changes in parallel.

**Can it be overcome?** Yes. SQL databases support
`UPDATE counter SET sequenceValue = sequenceValue + 1 RETURNING sequenceValue`,
which is fully atomic. MikroORM's `nativeUpdate()` can execute this.

### No MongoDB change streams

**The problem:** MongoDB change streams allow subscribing to real-time
notifications when documents are modified.

**How serious is it?** Not a problem at all. Apollo never used change streams.
Real-time collaboration is handled through WebSocket events via NestJS gateways,
which are independent of the database.

If this were ever needed, PostgreSQL's LISTEN/NOTIFY provides equivalent
functionality, and NestJS's EventEmitter module can broadcast events from
service methods.

## Potential Future Optimizations

The relational schema opens up optimization possibilities that were not feasible
with MongoDB's nested document model.

### R-tree spatial indexes for faster range queries

The current composite B-tree index on `(refSeq, min, max)` is good for range
overlap queries, but it works by narrowing on one bound at a time. For a query
like "find all features overlapping coordinates 10000-20000," the B-tree
efficiently finds features where `min <= 20000`, then scans those results to
check `max >= 10000`.

R-tree indexes are purpose-built for this kind of interval overlap query. They
can prune on both bounds simultaneously, which is faster when a region is dense
with features.

SQLite supports R-tree indexes natively:

```sql
CREATE VIRTUAL TABLE feature_rtree USING rtree(rowid, min_val, max_val);
```

PostgreSQL supports GiST range indexes:

```sql
CREATE INDEX ON feature USING GIST (int4range(min, max));
```

For genome browsers, where range overlap queries are the dominant access
pattern, R-tree indexes could meaningfully reduce query time in feature-dense
regions. For typical datasets the B-tree composite index is already efficient,
so this is an optimization for large-scale deployments.

### Recursive queries for single-round-trip tree loading

As described in the trade-offs section, both PostgreSQL and SQLite support
`WITH RECURSIVE` queries that can load an entire feature subtree in a single
database call. Implementing this would make tree loading as fast or faster than
MongoDB's single-document approach, while keeping the benefits of normalized
storage.

### Bulk import via COPY

PostgreSQL's `COPY FROM` command can insert millions of rows per second from
flat files. A GFF3 import pipeline could flatten features to CSV, then use
`COPY` for the actual database insertion. This would be dramatically faster than
either the old MongoDB approach (one document at a time) or the current MikroORM
approach (one entity at a time with ORM overhead).

## What Was Cleaned Up During the Migration

These are concrete simplifications that were achieved by fully removing Mongoose
from the codebase.

### Unified server execution path

The old codebase had two parallel implementations for every operation:
`executeOnServer()` (Mongoose) and `executeOnServerV2()` (MikroORM). Every
Change class (23 of them) and both Operation classes carried two complete server
implementations plus duplicated type interfaces (`ServerDataStore` and
`ServerDataStoreV2`). This doubled the surface area for bugs.

All old Mongoose `executeOnServer()` methods have been deleted. The V2 methods
have been renamed to `executeOnServer()`. The `ServerDataStoreV2` type has been
renamed to `ServerDataStore`. The dispatch logic in `Operation.execute()` and
`Change.execute()` has been simplified to a single code path.

### Eliminated the FeatureChange helper methods

The `FeatureChange` base class carried five helper methods that only existed to
navigate and manipulate MongoDB's nested document structure:

- `getFeatureFromId()` — walked a nested tree to find a feature by ID
- `getChildFeatureIds()` — recursively collected IDs from a nested tree
- `generateNewIds()` — assigned new ObjectIds to a nested tree
- `addChild()` — inserted a child into a parent's nested Map and maintained
  `allIds`
- `findAndDeleteChildFeature()` — recursively searched a tree to find and remove
  a child

None of these are needed with flat rows. Finding a feature by ID is a direct
primary key lookup. Adding a child is inserting a new row. Deleting is deleting
a row. The `FeatureChange` class is now a thin wrapper with no helper methods.

### Removed the dead validation layer

The `ParentChildValidation` class was the only validator that used
`backendPostValidate()`. It queried MongoDB using the `allIds` field and
Mongoose sessions — patterns that cannot work with MikroORM. The
`backendPostValidate()` method was never called from the active code path (it
was removed from `changes.service.ts` during migration).

The entire `backendPostValidate()` method has been removed from the `Validation`
base class, the `ValidationSet` container, and all validators. The
`ParentChildValidation` class has been deleted. The Mongoose types
(`ClientSession`, `Model<FeatureDocument>`) that were imported solely for this
method are gone from the validation layer.

If parent-child boundary validation is needed in the future, it should be
implemented using the repository pattern (a simple query) rather than the old
Mongoose-specific approach.

### Removed apollo-schemas dependency from core packages

The `@apollo-annotation/schemas` package defined Mongoose schema types
(`Feature`, `FeatureDocument`, `RefSeqDocument`, etc.). These types were
imported by `apollo-common`, `apollo-shared`, and the collaboration server.
Despite being type-only imports, they pulled in `mongoose` and
`@nestjs/mongoose` as transitive dependencies.

All `@apollo-annotation/schemas` imports have been removed from `apollo-common`
and `apollo-shared`. The `transforms.ts` file in the export module (which used
`FeatureDocument` and `RefSeqDocument` for Mongoose-specific `.toObject()`
calls) was dead code and has been deleted. The `getPrintableId()` utility
function that cast between Mongoose and MST types has been deleted.

### Removed the allIds denormalization hack

The `allIds` field on the `AddFeatureChangeDetails` interface has been removed.
Client code that previously computed and sent `allIds` arrays to the server
(CopyFeature UI, CLI copy command) no longer does so. The server never used the
field in the MikroORM path — it was carried forward as dead weight in the
serialized change format.

### Removed LocalGFF3DataStore

The `LocalGFF3DataStore` interface and `executeOnLocalGFF3` abstract method were
defined on every Operation and Change but never implemented (all implementations
threw "not implemented"). The interface, the abstract method, the dispatch
branch in `execute()`, and the `FileHandle` import have all been removed. The
`BackendDataStore` type alias (which was `ServerDataStore | LocalGFF3DataStore`)
has been inlined to just `ServerDataStore`.

## Remaining Issues to Address

### Each repository getter creates a separate database context

The `DatabaseService` provides repository access via getter properties like
`this.db.feature`, `this.db.refSeq`, etc. Each getter call creates a new
EntityManager fork — an independent database context with its own identity map
and transaction scope.

The `createUnitOfWork()` method exists and solves this — it creates a single
EntityManager fork shared across all repositories. The change execution pipeline
uses it correctly. But many read-heavy service methods (export, checks, feature
queries) access repositories through the individual getters instead.

**How to fix it:** Either use `createUnitOfWork()` for any method that accesses
multiple repositories, or scope the EntityManager per request using NestJS's
request-scoped providers or MikroORM's `@UseRequestContext()` decorator.

### The collaboration server still lists Mongoose dependencies

The `apollo-collaboration-server` `package.json` still lists `mongoose`,
`@nestjs/mongoose`, `mongoose-id-validator`, and `connect-mongodb-session` as
dependencies. These are no longer used at runtime but are still installed.
Removing them will reduce the dependency footprint.

### No ON DELETE CASCADE on feature parent relationship

The `parent` column on the feature table is a self-referencing foreign key, but
it does not have `ON DELETE CASCADE` defined. The application code prevents
orphans by always calling `deleteDescendants()` before deleting a feature, but
adding `ON DELETE CASCADE` would enforce this at the database level.

### The client is not affected by any of these changes

The client (JBrowse plugin) is completely insulated from the storage layer
change. It receives nested feature trees over HTTP, exactly as it did with
MongoDB. The conversion between flat database rows and nested trees happens
inside the server — in `assembleFeatureTrees()` on read and
`flattenFeatureSnapshot()` on write.

No client code changes are needed.

## Migration Steps

### Prerequisites

- Node.js 14+
- Access to your existing MongoDB instance
- The target database backend chosen: SQLite or PostgreSQL

### Step 1: Build the Project

```bash
yarn install
yarn tsc -b
```

### Step 2: Run the Migration Script

The migration script reads from MongoDB and writes to the new relational
database.

**For SQLite (recommended for development/single-user):**

```bash
cd packages/apollo-collaboration-server
npx ts-node scripts/migrate-mongo-to-mikroorm.ts \
  --mongo-uri "mongodb://localhost:27017/apollo" \
  --db-backend sqlite \
  --db-connection-url apollo3.sqlite
```

**For PostgreSQL (recommended for production/multi-user):**

```bash
cd packages/apollo-collaboration-server
npx ts-node scripts/migrate-mongo-to-mikroorm.ts \
  --mongo-uri "mongodb://localhost:27017/apollo" \
  --db-backend postgresql \
  --db-connection-url "postgresql://user:pass@localhost:5432/apollo3"
```

Replace the `--mongo-uri` value with your actual MongoDB connection string. If
your Apollo instance used a specific database name, include it in the URI (e.g.
`mongodb://localhost:27017/myApolloDb`).

### Step 3: Configure the Server

Update your `.env` or `.development.env` file:

```env
DB_BACKEND=sqlite
DB_CONNECTION_URL=apollo3.sqlite
```

Or for PostgreSQL:

```env
DB_BACKEND=postgresql
DB_CONNECTION_URL=postgresql://user:pass@localhost:5432/apollo3
```

### Step 4: Start the Server

```bash
yarn start
```

The server will automatically detect the new backend and use it.

### What the Migration Script Does

The script migrates all 12 collections from MongoDB:

| MongoDB Collection | Transformation                                                                   |
| ------------------ | -------------------------------------------------------------------------------- |
| `files`            | ObjectId → string ID                                                             |
| `users`            | ObjectId → string ID, role values preserved                                      |
| `checks`           | ObjectId → string ID                                                             |
| `assemblies`       | ObjectId → string for IDs, `fileIds`, `checks`; nested objects stored as JSON    |
| `refseqs`          | ObjectId → string for IDs and assembly reference                                 |
| `refseqchunks`     | Batched (500/batch) to manage memory                                             |
| `features`         | **Tree flattening**: nested `children` map → flat rows with `parent` foreign key |
| `checkresults`     | ObjectId → string for IDs, `ids[]`, `refSeq` reference                           |
| `changes`          | Sorted by sequence number, batched                                               |
| `counters`         | Mongoose `id` field becomes the primary key `_id`                                |
| `jbrowseconfigs`   | Schema-less document wrapped into `{ config: {...} }`                            |
| `exports`          | ObjectId → string                                                                |

The most significant transformation is **feature tree flattening**. A MongoDB
document like:

```
{
  _id: "gene1", type: "gene",
  children: {
    "mRNA1": {
      _id: "mRNA1", type: "mRNA",
      children: {
        "exon1": { _id: "exon1", type: "exon" }
      }
    }
  }
}
```

Becomes three separate rows:

```
| _id   | parent | type |
|-------|--------|------|
| gene1 | NULL   | gene |
| mRNA1 | gene1  | mRNA |
| exon1 | mRNA1  | exon |
```

### Verifying the Migration

After migration, you can verify the data:

**SQLite:**

```bash
sqlite3 apollo3.sqlite "SELECT COUNT(*) FROM feature;"
sqlite3 apollo3.sqlite "SELECT COUNT(*) FROM assembly;"
sqlite3 apollo3.sqlite "SELECT COUNT(*) FROM ref_seq;"
```

**PostgreSQL:**

```bash
psql -d apollo3 -c "SELECT COUNT(*) FROM feature;"
```

Compare these counts against your MongoDB:

```bash
mongosh apollo --eval "db.features.countDocuments()"
```

Note that the feature count in the relational database will be **higher** than
in MongoDB, because each nested child is now its own row. To compare accurately,
count features including nested children in MongoDB:

```javascript
db.features.aggregate([
  {
    $project: {
      count: { $add: [1, { $size: { $ifNull: ['$allIds', []] } }] },
    },
  },
  { $group: { _id: null, total: { $sum: '$count' } } },
])
```

### Rollback

The migration script does not modify your MongoDB data. If you need to roll
back, simply point the server back to MongoDB by reverting your environment
configuration. Your MongoDB data remains intact.
