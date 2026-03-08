# Migrating from MongoDB to the New Database Backend

Apollo3 has moved from MongoDB to a relational database (SQLite or PostgreSQL)
using MikroORM. This guide covers why we made the change, what's different, and
how to migrate your data.

For detailed technical analysis of the architecture changes
(operation-by-operation comparisons, cleanup details, optimization plans), see
[TECH_NOTES.md](TECH_NOTES.md).

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

#### MongoDB required a replica set even for development

MongoDB transactions only work with a replica set. Even for local development,
Apollo's Docker setup had to configure multiple MongoDB nodes with replica set
initialization scripts. This added operational complexity for something that
should be simple.

SQLite (the default new backend) is a single file. No server, no configuration.

#### Large imports could not use transactions

MongoDB has a 16MB limit on transaction size. Large GFF3 imports had to work
around this using a `status: -1` soft-delete pattern: features were created in a
"hidden" state, then activated in bulk if the import succeeded, or deleted if it
failed. This was fragile and complex.

The new relational backend has no transaction size limit. An entire GFF3 import
can be wrapped in a single transaction that either commits completely or rolls
back completely.

## What Got Better

- **Direct feature lookup** — any feature can be found by ID with a single
  query, replacing a three-step process (array scan, document load, tree walk)
- **Surgical edits** — changing one field updates one row, not an entire gene
  tree
- **No write contention** — two users editing different exons write to different
  rows
- **Simpler deployment** — SQLite requires no database server; PostgreSQL
  requires one server but no replica set
- **Reliable transactions** — GFF3 imports are fully transactional regardless of
  size
- **Standard SQL tooling** — inspect data with DB Browser for SQLite, psql,
  DBeaver, etc.
- **Precise range queries** — query for features in a coordinate range and get
  back exactly those features, including individual exons

## What Got Worse

- **Tree loading** — fetching a complete gene tree takes 3-4 queries instead of
  one. Fixable with `WITH RECURSIVE` queries or batched `WHERE parent IN (...)`
  queries.
- **Text search** — currently uses simple `LIKE` matching instead of MongoDB's
  full-text `$text` operator. Fixable with SQLite FTS5 or PostgreSQL
  tsvector/tsquery.
- **Check result lookups** — finding check results by feature ID currently loads
  all results into memory. Fixable with a junction table or database JSON
  functions.
- **No automatic export cleanup** — MongoDB's TTL indexes are gone. Fixable with
  a NestJS scheduled task.

For a detailed operation-by-operation comparison, see the
[Flat Rows vs Nested Documents](TECH_NOTES.md#flat-rows-vs-nested-documents)
section in TECH_NOTES.md.

## The Client Is Not Affected

The client (JBrowse plugin) is completely insulated from the storage layer
change. It receives nested feature trees over HTTP, exactly as it did with
MongoDB. The conversion between flat database rows and nested trees happens
inside the server. No client code changes are needed.

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
