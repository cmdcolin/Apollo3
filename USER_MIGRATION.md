# Migrating from MongoDB to the New Relational Backend

Apollo3 has migrated from a MongoDB/Mongoose backend to a relational database
backend using MikroORM. This guide explains the benefits, trade-offs, and how to
migrate your existing data.

## Why the Migration?

The original MongoDB schema stored genomic features as deeply nested documents.
While this initially seemed like a natural fit for hierarchical gene models, it
introduced several serious performance and correctness problems as datasets
grew.

### Problems with the MongoDB Schema

#### 1. Nested Document Model Causes Full-Document Rewrites

In MongoDB, a gene with its mRNAs, exons, and CDS features was stored as a
single deeply nested document:

```
{
  _id: ObjectId("..."),
  type: "gene",
  min: 1000, max: 5000,
  children: {
    "mRNA_id_1": {
      type: "mRNA",
      children: {
        "exon_id_1": { type: "exon", min: 1000, max: 1200 },
        "exon_id_2": { type: "exon", min: 2000, max: 2500 },
        ...
      }
    }
  },
  allIds: ["mRNA_id_1", "exon_id_1", "exon_id_2", ...]
}
```

Any modification to a deeply nested child (e.g. changing an exon's coordinates)
required:

1. Loading the **entire** root document with all nested children into memory
2. Traversing the in-memory tree to find the target child
3. Modifying the child in memory
4. Calling `markModified('children')` (Mongoose cannot track deep mutations)
5. Saving the **entire** root document back to disk

This means editing a single exon coordinate caused the entire gene tree to be
serialized and written. For genes with hundreds of exons, this is wasteful.

#### 2. The `allIds` Workaround

Because children are embedded inside their parent document, there is no way to
directly query for a child feature by ID. MongoDB can only find top-level
documents. To work around this, every root feature maintained an `allIds` array
— a flat list of every descendant feature ID:

```typescript
@Prop({ type: [String], required: true, index: true })
allIds: string[]
```

Every operation that added, removed, or moved a child feature had to update this
array on the root document. This created:

- **Write amplification**: Adding one exon required updating the root's `allIds`
  array and saving the entire document
- **Consistency risk**: If `allIds` got out of sync with the actual nested
  children, features would become unfindable
- **Index bloat**: The `allIds` array index grows with every descendant feature

After finding the root document via `allIds`, the code still had to recursively
traverse the nested children tree to locate the actual feature:

```typescript
// From FeatureChange.ts — recursive traversal after allIds lookup
getFeatureFromId(feature, featureId) {
  if (feature._id.equals(featureId)) {
    return feature
  }
  for (const [, childFeature] of feature.children ?? new Map()) {
    const subFeature = this.getFeatureFromId(childFeature, featureId)
    if (subFeature) {
      return subFeature
    }
  }
  return null
}
```

So finding a single exon required: an indexed array lookup, loading the full
document, then a recursive tree walk.

#### 3. Write Contention on Concurrent Edits

When two users edit different exons of the same gene simultaneously, both
operations must load, modify, and save the same root document. MongoDB document-
level locking means these operations serialize against each other. The second
write must wait for the first to complete, and in the worst case, one write
overwrites the other's changes.

With the relational model, each exon is its own row. Two users editing different
exons write to different rows with no contention.

#### 4. MongoDB 16MB Document Size Limit

MongoDB enforces a hard 16MB limit on document size. Since the entire feature
hierarchy is stored in one document, large genes with many descendants can
approach this limit. A gene with thousands of exons, each carrying attributes,
could exceed it. The relational model has no such constraint — each feature is
its own row.

#### 5. Wildcard Text Index Overhead

The MongoDB schema used a wildcard text index:

```typescript
FeatureSchema.index({ '$**': 'text' })
```

This indexed every string field in every nested child document. For a gene with
hundreds of descendants, each with type, attributes, and other string fields,
this created a very large and expensive index that slowed down every write
operation.

#### 6. `markModified()` Requirement

Mongoose cannot automatically detect changes to nested Map objects. Every
operation that modified a child feature had to explicitly call:

```typescript
topLevelFeature.markModified('children')
await topLevelFeature.save()
```

Forgetting this call meant changes silently failed to persist — a common source
of bugs.

### Benefits of the New Relational Schema

#### 1. Each Feature is a Single Row

Features are stored in a flat table with a `parent` foreign key:

```
| _id    | parent  | refSeq | type | min  | max  |
|--------|---------|--------|------|------|------|
| gene1  | NULL    | chr1   | gene | 1000 | 5000 |
| mRNA1  | gene1   | chr1   | mRNA | 1000 | 5000 |
| exon1  | mRNA1   | chr1   | exon | 1000 | 1200 |
| exon2  | mRNA1   | chr1   | exon | 2000 | 2500 |
```

Updating a single exon writes a single row. No other rows are touched.

#### 2. Direct Feature Lookup by ID

Finding any feature — root or deeply nested — is a simple primary key lookup:

```typescript
await em.findOne(FeatureEntity, { _id: featureId })
```

No `allIds` array, no recursive traversal, no loading unrelated features.

#### 3. Efficient Range Queries with Composite Index

A composite index on `(refSeq, min, max)` enables efficient range queries:

```typescript
await em.find(FeatureEntity, {
  refSeq: refSeqId,
  min: { $lte: end },
  max: { $gte: start },
})
```

This can return only the features in the viewport, including individual exons,
without loading entire gene trees.

#### 4. No Write Amplification

- Adding a child: insert one row
- Deleting a child: delete one row (plus descendants)
- Changing coordinates: update one row

No parent document needs to be loaded or rewritten.

#### 5. Flexible Backend Choice

The new schema supports SQLite (for development and single-user deployments) and
PostgreSQL (for production multi-user setups). SQLite requires zero
configuration — no database server to install or manage.

#### 6. Standard SQL Tooling

Data can be inspected and queried with any SQL tool (DB Browser for SQLite,
psql, DBeaver, etc.) without needing MongoDB-specific tools.

### Trade-offs and Limitations

The migration is not without trade-offs. These are documented here for
transparency.

#### 1. Tree Reconstruction Requires Multiple Queries

MongoDB returned a complete nested feature tree in a single query. In the
relational model, fetching a gene with all its descendants requires:

1. Query for root features in a range
2. BFS traversal querying children at each level

For a gene with 3 levels of nesting (gene → mRNA → exon), this means 3+ database
round-trips per gene instead of 1. This is mitigated by the fact that each
individual query is faster (single-row lookups vs. loading a large nested
document), and the total data transferred is the same. In practice, the
round-trips are to a local SQLite file or a nearby PostgreSQL server, so latency
is minimal.

#### 2. Text Search Is Less Capable

MongoDB's `$text` operator with the wildcard text index provided built-in
full-text search with tokenization and relevance scoring across all fields
(including nested children's attributes). The current relational implementation
uses `LIKE '%pattern%'` matching on the `type` field only.

This is a known limitation. Full-text search can be improved in the future with:

- PostgreSQL's `tsvector`/`tsquery` for full-text search
- SQLite's FTS5 extension
- Searching across additional fields (attributes, etc.)

#### 3. No TTL Index for Exports

MongoDB supported TTL (time-to-live) indexes that automatically deleted export
records after 300 seconds:

```typescript
ExportSchema.index({ createdAt: 1 }, { expires: 300 })
```

The relational backend does not have an equivalent automatic expiration
mechanism. Export cleanup will need to be handled by application logic or a
periodic cleanup job.

#### 4. No Change Streams

MongoDB change streams allowed real-time notification when documents were
modified. If any part of the system relied on change streams for live updates,
this functionality would need to be replaced with application-level event
emission (which NestJS already supports via its event system).

#### 5. Transaction Semantics Differ

MongoDB transactions operated at the document level with sessions. The
relational backend uses standard SQL transactions via MikroORM's unit-of-work
pattern. The semantics are equivalent for correctness, but the granularity is
different — relational transactions can span multiple rows atomically, which is
actually more flexible.

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
    $project: { count: { $add: [1, { $size: { $ifNull: ['$allIds', []] } }] } },
  },
  { $group: { _id: null, total: { $sum: '$count' } } },
])
```

### Rollback

The migration script does not modify your MongoDB data. If you need to roll
back, simply point the server back to MongoDB by reverting your environment
configuration. Your MongoDB data remains intact.
