# From MongoDB to a Relational Database: Rationale and Path Forward

## Summary

Apollo 3's data layer has been migrated from MongoDB to
[MikroORM](https://mikro-orm.io/), a TypeScript ORM that supports both SQLite
and PostgreSQL through the same codebase. **The migration is complete.** All
existing change operations, undo/redo, and real-time collaboration work as
before. MongoDB has been fully removed from the active codebase.

**What this unblocks for shipping:**

- **Desktop deployment is now possible.** Apollo 3 runs fully self-contained
  with an embedded SQLite database — no external services, no installation steps
  for end users. This was impossible with MongoDB.
- **Server deployment is simpler.** No MongoDB replica set to configure. For
  collaborative use, a standard PostgreSQL instance is all that is needed.
- **Developer and CI setup is zero-configuration.** No database service to
  install. Run the server and the SQLite database is created automatically. CI
  pipelines no longer need MongoDB containers.
- **Hosting costs drop significantly.** MongoDB Atlas requires ~$50–60+/month
  minimum. SQLite is free (in-process). PostgreSQL is available through low-cost
  managed services or serverless options that scale to near-zero.
- **One codebase, all deployment targets.** The same code runs on a researcher's
  laptop (SQLite) and a shared server (PostgreSQL). Only a configuration value
  changes.
- **Existing data is easy to migrate.** A
  [migration script](../packages/apollo-collaboration-server/scripts/migrate-mongo-to-mikroorm.ts)
  converts MongoDB data to the new schema. Early beta testers with existing
  Apollo 3 deployments can transition without data loss.

The sections below detail the challenges the document model creates for
concurrent editing, large imports, and desktop deployment, and how the
relational model addresses them.

**Related documents:**

- [Technical Details](./mikro-orm-technical-details.md) — worked examples,
  tradeoff analysis, schema recommendations, deployment scenarios
- [Per-Gene History and Apollo 2 Migration](./apollo2-migration-and-history-tracking.md)
  — per-gene edit history tracking, Apollo 2 data migration plan
- [Alternatives](./mikro-orm-alternatives.md) — what staying on MongoDB would
  require, Firestore/Firebase evaluation, parallel backend approach

---

## Why MikroORM

[MikroORM](https://mikro-orm.io/) is a TypeScript-native ORM for Node.js with
first-class support for NestJS (Apollo 3's server framework). It was chosen over
alternatives for several reasons:

- **Multi-database support from a single codebase.** MikroORM supports SQLite
  and PostgreSQL (among others) through swappable drivers. The same entity
  definitions and query code work against both databases — only a configuration
  value changes. This is what makes the "SQLite for desktop, PostgreSQL for
  server" strategy possible without maintaining two implementations.
- **TypeScript-first design.** Entities are defined as decorated TypeScript
  classes with full type safety. This fits naturally into Apollo 3's existing
  TypeScript codebase and catches schema errors at compile time.
- **Unit of Work and identity map.** MikroORM tracks changes to entities
  automatically and flushes them in a single transaction, providing the
  transactional safety that was difficult to achieve with MongoDB.
- **Built-in migration system.** MikroORM can generate and run schema migrations
  from entity definitions, providing auditable, versioned schema evolution —
  similar to what Apollo 2 had with Liquibase.
- **NestJS integration.** The `@mikro-orm/nestjs` package provides module-level
  integration with dependency injection, making it straightforward to use within
  Apollo 3's existing NestJS architecture.

---

## At a Glance: Benefits

### Data model and editing

| Area                                    | MongoDB (before)                                                                                           | Relational (after)                                                                                                         |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Editing one exon's coordinates          | Load the entire gene into memory, save it all back                                                         | Update exactly one row                                                                                                     |
| Adding a child feature (e.g., new exon) | Load gene document, navigate to parent, insert into children map, update `allIds`, save entire document    | Insert one row with parent ID set                                                                                          |
| Two annotators editing the same gene    | Both load the entire gene document; second save may overwrite the first user's changes to a different exon | Edits to different features are separate rows with no contention; same-feature conflicts detectable via optimistic locking |
| Finding a feature by its ID             | Scan a secondary list, then walk a nested structure                                                        | Direct lookup by primary key                                                                                               |
| Importing a large annotation file       | Subject to a 16 MB document limit; required a staging workaround                                           | No size limit; standard database transaction                                                                               |
| Redundant bookkeeping                   | A manually-maintained list of all descendant IDs in every gene record                                      | Not needed — IDs are native database keys                                                                                  |
| Data integrity enforcement              | Application code responsible for all constraints                                                           | Foreign keys, unique constraints, and indexes enforced by the database itself                                              |
| Transaction safety                      | Partial failures in multi-step operations were hard to recover from                                        | Each change runs in a transactional unit of work with automatic rollback on failure                                        |

### Deployment and operations

| Area                          | MongoDB (before)                                                                                            | Relational (after)                                                                                                                                            |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop / Electron deployment | Impossible — MongoDB requires a separate running service                                                    | Fully self-contained with SQLite; no install needed                                                                                                           |
| Shared server deployment      | MongoDB requires a special "replica set" configuration even for one machine                                 | Standard PostgreSQL; no special setup                                                                                                                         |
| Scaling from laptop to server | Two entirely different database systems would be needed                                                     | Same code, same schema; only a config value changes (SQLite vs. PostgreSQL)                                                                                   |
| Developer setup               | Install MongoDB, configure replica set, set `MONGODB_URI`                                                   | Run the server — SQLite database file is created automatically; zero configuration                                                                            |
| CI / automated testing        | CI pipelines need a MongoDB service container with replica set initialization                               | No database service needed — tests run against a temporary SQLite file that is deleted after                                                                  |
| Docker Compose                | Requires two MongoDB containers in a replica set plus health checks and initialization scripts              | No database containers needed at all for SQLite; optional single PostgreSQL container for server mode                                                         |
| Cloud hosting costs           | Requires a dedicated MongoDB instance (or MongoDB Atlas); minimum ~$50–60/month for a small managed cluster | SQLite runs in-process (no database cost). PostgreSQL available via low-cost managed services or AWS Aurora Serverless (scales to zero; pay only when active) |
| Serverless deployment         | Not feasible — MongoDB requires persistent connections and a running server                                 | SQLite can be bundled with the application. PostgreSQL works with serverless-friendly options like Aurora Serverless or Neon                                  |
| Backups                       | Requires `mongodump` or MongoDB-specific backup tools                                                       | SQLite: copy a single file. PostgreSQL: standard `pg_dump`                                                                                                    |
| Inspecting data directly      | Requires MongoDB-specific tooling                                                                           | Any SQL client, command-line tool, or spreadsheet export                                                                                                      |

### Code and maintenance

| Area                     | MongoDB (before)                                                                                             | Relational (after)                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Schema clarity           | Mongoose schemas + a separate `apollo-schemas` package                                                       | 13 entity definitions in ~330 lines; map directly to database tables                |
| Server code complexity   | Each operation navigated nested document trees; many were 30+ lines                                          | Most operations are 5–10 lines of targeted row updates                              |
| Dependency footprint     | `mongoose`, `@nestjs/mongoose`, `connect-mongodb-session`, `mongoose-id-validator`, `apollo-schemas` package | One ORM library (MikroORM); `apollo-schemas` package deleted entirely               |
| Real-time collaboration  | Configured with MongoDB change streams (required replica set); WebSockets handled the actual broadcasting    | Same WebSocket system, unchanged — collaboration was not database-dependent         |
| Undo / redo              | Undo logic lives in TypeScript, independent of the database                                                  | Unchanged — transactions are now cleaner with automatic rollback                    |
| Continuity with Apollo 2 | Apollo 2 used PostgreSQL; Apollo 3 moved to a document model                                                 | Returns to a relational model (like Apollo 2) while keeping Apollo 3's architecture |

### Future capabilities enabled by the relational model

The following improvements are now straightforward to implement on the
relational foundation, but were difficult or impossible with the document model:

- **Per-gene edit history** — Apollo 3 currently tracks changes globally by
  assembly, with no way to query history for a single gene without scanning all
  changes. Proposed: add an indexed `gene_id` column to the change table for
  instant per-gene history lookups, restoring a capability Apollo 2 had. See
  [history tracking plan](./apollo2-migration-and-history-tracking.md).
- **Apollo 2 history migration** — Proposed: import Apollo 2 audit records into
  Apollo 3's change log, preserving the complete edit timeline for users
  migrating between systems. See
  [migration plan](./apollo2-migration-and-history-tracking.md#migrating-apollo-2-data-and-history-to-apollo-3).
- **Annotation quality check improvements** — Check results are currently stored
  with feature IDs in a JSON array, making per-feature lookup inefficient.
  Proposed: normalize into indexed columns for fast viewport queries and run
  checks only on feature change rather than on every pan/zoom.

---

## At a Glance: Tradeoffs and Mitigations

These are areas where the relational model is currently harder than MongoDB's
nested documents. Each has a clear, bounded fix.

| Area                                     | What is currently harder                                                                      | Mitigation                                                                                              |
| ---------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Loading a full gene tree for display     | Requires multiple queries to walk the parent-child hierarchy                                  | Add a `root_id` column: one query fetches all descendants of any gene                                   |
| Fetching all features in a genomic range | Root genes are found efficiently, but loading their complete trees requires extra round trips | Same `root_id` fix: two queries total (find roots in range, then fetch all rows sharing those root IDs) |
| Deleting a gene and all descendants      | Uses a recursive loop with one database call per child                                        | Add `ON DELETE CASCADE` to the parent foreign key — deletion becomes a single database operation        |
| Deleting an assembly                     | Must delete related records (check results, features, ref seqs) in a specific order           | Add cascade delete rules to the schema — the database handles ordering automatically                    |
| Reassembling trees from flat rows        | An extra in-memory step (not needed with nested documents)                                    | Already efficient (single linear pass); cost is negligible for any realistic gene size                  |
| Full-text search                         | Currently uses basic pattern matching, weaker than MongoDB's text index                       | Replace with SQLite FTS5 or PostgreSQL tsvector — both are mature, built-in full-text search systems    |
| Some bulk operations (export, search)    | Loop-based queries that issue one database call per item                                      | Replace loops with batched queries — straightforward code fix                                           |
| Check result lookup by feature ID        | Loads entire table into memory and filters in application code                                | Normalize into a join table for indexed per-feature lookup                                              |

See [Technical Details](./mikro-orm-technical-details.md) for full analysis of
each tradeoff with worked examples.

---

## Background: How Apollo 3's Data Is Structured

Genomic annotation features — genes, transcripts, exons, coding sequences — form
a natural hierarchy. A gene contains one or more transcripts; each transcript
contains exons and coding sequence segments.

In the original MongoDB design, this entire hierarchy was stored as a single
"document" (a deeply nested record). The gene was the container, and everything
below it was embedded inside it. This is a natural mapping of the biological
hierarchy, but in practice the nested document model introduces challenges for
concurrent editing, large datasets, and desktop deployment — discussed in detail
below.

---

## Challenges With the Document Model

### 1. Every edit touched more data than necessary

Because all of a gene's children lived in one document, any edit — even moving a
single exon by one base pair — required loading the entire gene record into
memory, modifying the relevant nested piece, and writing the whole thing back.
For large genes with many transcripts or exons, this added up to meaningful
overhead.

### 2. Concurrent editing of the same gene had a wide blast radius

Apollo 3 has a client-side guard (`changeInProgress`) that serializes changes
within a single browser session. However, when two annotators edited different
parts of the same gene at the same time — say, different exons — both would load
the same gene document, modify their respective nested piece, and save. Because
the entire gene is a single document, the second save replaces the whole
document including the first user's change. The client-side guard does not help
here because each user's client is operating independently.

This is a consequence of the document granularity: the unit of contention is an
entire gene, not an individual feature. Even edits to completely unrelated parts
of the gene (different exons, different transcripts) conflict because they share
the same document.

### 3. Feature lookups required additional bookkeeping

MongoDB does not natively index into nested document structures. To make
individual features findable, every gene document carried an `allIds` field: a
manually maintained list of every descendant feature's ID. This list had to be
kept in sync whenever a child feature was added, removed, or moved — an extra
layer of bookkeeping that duplicated what the tree structure already expressed.

### 4. Document size limits constrained large imports

MongoDB imposes a 16 MB maximum size on a single document. Highly spliced genes
with thousands of exons — not unusual in genomics — could approach this ceiling.
Large GFF3 file imports ran into similar restrictions, which required a staging
workaround: features were initially written with a "pending" status flag and
then retroactively committed, adding complexity to the import path.

### 5. Deployment configuration was heavier than necessary

MongoDB was configured in "replica set" mode — a configuration designed for
multi-machine redundancy — because Apollo 3 used MongoDB's "change stream"
feature, which only works in replica set mode. On closer examination, Apollo 3's
real-time collaboration actually runs through WebSockets (Socket.IO), not change
streams. The replica set configuration added deployment complexity for a
capability that was not being used.

---

## What Changed and Why It Helps

### The data model is now flat

Each feature is now its own independent row in a table. Parent-child
relationships are expressed by a single reference column pointing to the
parent's ID.

**Before — one record per gene, all children embedded:**

```
gene_1
  └─ transcript_1
       ├─ exon_1  (1000–1500)
       ├─ exon_2  (3000–3500)
       └─ CDS_1   (1200–3400)
```

**After — one row per feature, linked by a parent reference:**

```
| id           | parent       | type       | start | end  |
|--------------|--------------|------------|-------|------|
| gene_1       | —            | gene       | 1000  | 5000 |
| transcript_1 | gene_1       | transcript | 1000  | 5000 |
| exon_1       | transcript_1 | exon       | 1000  | 1500 |
| exon_2       | transcript_1 | exon       | 3000  | 3500 |
| CDS_1        | transcript_1 | CDS        | 1200  | 3400 |
```

This addresses all five challenges described above:

- Editing exon_1 now updates exactly one row. Nothing else is read or written.
- Two annotators editing exon*1 and exon_2 are writing to separate rows — no
  contention. (If both edit the \_same* feature simultaneously, the last write
  still wins. Adding optimistic locking via MikroORM's `@Version` support would
  detect this and let the client re-fetch and retry — a straightforward
  follow-on improvement.)
- Every feature has its own primary key. Looking up any feature by ID is a
  direct, single-step operation. The `allIds` list is no longer needed.
- There is no document size limit. Imports stream rows into the table with no
  ceiling.
- No MongoDB-specific configuration is required.

### The code is meaningfully simpler

Operations no longer need to load a full gene tree, find the right nested
object, modify it, and write back the root. Each operation targets exactly the
rows it needs. Most data-modifying operations on the server are now five to ten
lines of straightforward code.

The `apollo-schemas` package, which defined MongoDB-specific data types, is no
longer needed. The new entity definitions — 13 entities totaling roughly 330
lines — are compact, declarative, and map directly to database tables.

### Undo and redo are unaffected

Apollo 3's undo system works by computing the inverse of each change (e.g., the
inverse of a delete is an add). This logic lives entirely in TypeScript and does
not depend on the database technology. The migration did not require any changes
to undo/redo.

If anything, the relational model provides better guarantees: each change now
executes inside a transactional unit of work with automatic rollback on failure.

### MongoDB dependency has been removed

No active code in the application depends on MongoDB. A one-time migration
script is available for converting existing production data into the new schema.

---

## Current Status and Next Steps

**What is already working:**

- **Desktop / local use**: Apollo 3 runs fully self-contained with an embedded
  SQLite database. No external services required.
- **Collaborative server**: The same application runs against PostgreSQL,
  supporting concurrent users and large datasets.
- **Data migration**: A
  [migration script](../packages/apollo-collaboration-server/scripts/migrate-mongo-to-mikroorm.ts)
  converts existing MongoDB data into the new schema. Any current beta testers
  or early deployments can migrate their data without starting over.
- **Data portability**: Annotation data can be inspected, exported, or backed up
  with standard SQL tools — no specialized tooling required.
- **Test coverage**: The existing end-to-end test suite (Cypress) runs against
  the new data layer. The majority of tests pass; a small number have
  intermittent timing-related failures that are being stabilized.

**Concrete follow-on improvements:**

These are bounded, well-understood changes that do not require architectural
rework. They fall into three categories:

_Performance and schema optimization:_

- **Add `root_id` column to the feature table** — enables single-query gene tree
  loading, range queries, and deletion
- **Add `ON DELETE CASCADE` to all foreign keys** — the database handles child
  cleanup automatically on deletion
- **Add missing indexes** on `FeatureEntity.parent` and `RefSeqEntity.assembly`
- **Replace loop-based queries with batched `IN` filters** — eliminates N+1
  query patterns in search, export, and feature count operations
- **Replace `LIKE`-based text search with native full-text search** — SQLite
  FTS5 or PostgreSQL tsvector
- **Improve annotation quality checks** — push check result filtering into the
  database and run checks on feature change instead of on every viewport request

_Per-gene history and Apollo 2 migration:_

- **Add `gene_id` column to the change table** — enables per-gene history
  queries with a simple indexed lookup. See
  [history tracking plan](./apollo2-migration-and-history-tracking.md)
- **Build per-gene history viewer** — right-click a gene to see its full edit
  timeline
- **Apollo 2 history migration script** — import edit history from Apollo 2 into
  Apollo 3's change log, preserving the audit trail. See
  [migration plan](./apollo2-migration-and-history-tracking.md#migrating-apollo-2-data-and-history-to-apollo-3)

_Concurrency and production readiness:_

- **Add optimistic locking to feature edits** — MikroORM supports `@Version`
  columns natively. Adding a version field to `FeatureEntity` would detect when
  two users edit the same feature simultaneously and let the client re-fetch and
  retry, rather than silently overwriting. This is a lightweight alternative to
  full CRDT-based conflict resolution.
- **Transition from auto-schema to explicit migrations** — auditable, reversible
  schema evolution with migration files committed to the repository. See
  [Technical Details](./mikro-orm-technical-details.md#schema-migrations-a-major-improvement-over-mongodb)

For detailed technical analysis of each item, schema recommendations, and
deployment scenarios, see [Technical Details](./mikro-orm-technical-details.md).
For alternatives to this migration, see
[Alternatives](./mikro-orm-alternatives.md).

---

## Appendix: SQL vs. NoSQL for Genomic Annotation Data

The choice between a relational (SQL) database and a document (NoSQL) database
is ultimately about which model fits the data's access patterns. Both are
mature, widely used technologies — neither is universally better. This section
explains why a relational model is a better fit for Apollo 3's specific needs.

### Where document databases excel — real-world examples

Document databases like MongoDB have delivered significant benefits in many
well-known production systems. A few representative examples:

- **Content management and blogging platforms.** A blog post with its title,
  body, tags, comments, and metadata is a self-contained unit that is always
  loaded and saved as a whole. MongoDB's document model maps directly to this —
  one document per post, no joins needed. Platforms like Strapi and Keystonejs
  use MongoDB for this reason.
- **Product catalogs with variable attributes.** An e-commerce site where
  electronics have specs like screen size and RAM while clothing has size and
  color benefits from MongoDB's flexible schema — each product document can have
  different fields without requiring a complex table hierarchy or sparse
  columns. This is a common pattern in retail platforms.
- **User session and profile storage.** Session data and user profiles are
  read-heavy, written as whole units, and vary in shape between users (different
  OAuth providers, different preference sets). MongoDB and similar stores are
  widely used for this in web applications.
- **Real-time analytics and event logging.** High-volume write workloads where
  events are appended and rarely updated — clickstreams, IoT telemetry, server
  logs — benefit from MongoDB's fast writes and horizontal sharding. The data is
  typically append-only and queried in aggregate, not edited in place.
- **Rapid prototyping.** When the schema is still evolving quickly, MongoDB's
  schemaless design lets developers iterate without writing migrations. This is
  a genuine productivity advantage in early-stage development.

**The common thread:** document databases shine when records are self-contained,
read or written as whole units, have variable structure, or are append-only at
high volume.

### Why these strengths don't apply to Apollo 3

Apollo 3's data does not fit the patterns above:

- **Annotations are not self-contained documents.** A gene, its transcripts, and
  its exons form a hierarchy, but annotators routinely edit individual exons
  without needing the rest of the gene. Packing the entire hierarchy into one
  document forces every edit to load and save far more data than it touches.
- **The schema is stable, not variable.** Genes, transcripts, exons, and CDS
  features all have well-defined, consistent fields. There is no benefit to a
  flexible schema — the structure has been stable since GFF3 was standardized.
- **Edits are fine-grained and concurrent, not whole-document and single-user.**
  Multiple annotators editing different exons of the same gene is a core use
  case, not an edge case. This is the opposite of the "load once, save once"
  pattern where documents excel.
- **Data is edited in place, not append-only.** Annotation is an iterative
  process of refining coordinates, types, and relationships — not logging
  events.
- **The application must run embedded.** Desktop deployment requires an
  in-process database. There is no production-grade embedded document database
  equivalent to SQLite.

### Where relational databases excel

Relational databases are the standard choice for applications with structured
data, fine-grained edits, and data integrity requirements:

- **Data has stable, well-defined relationships.** Foreign keys, indexes, and
  joins are purpose-built for parent-child hierarchies — exactly what gene →
  transcript → exon represents.
- **Edits target individual records.** Updating one exon's coordinates is a
  single-row write. Nothing else is read or rewritten.
- **Multiple users edit concurrently.** Each feature is its own row, so two
  annotators editing different exons of the same gene write to different rows
  with no contention.
- **Data integrity is enforced by the database.** Foreign keys, unique
  constraints, and cascading deletes catch errors that application code might
  miss.
- **The application needs to run embedded.** SQLite is an in-process relational
  database that stores data in a single file — ideal for desktop applications.
  No equivalent exists in the document database ecosystem.

### Summary

Apollo 3's actual access patterns — fine-grained concurrent edits, desktop
deployment, diverse hosting environments — are a better fit for a relational
model. The migration preserves everything that was already working while
aligning the data layer with how the application is actually used.
