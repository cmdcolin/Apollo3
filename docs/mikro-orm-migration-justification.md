# From MongoDB to a Relational Database: Rationale and Path Forward

## Summary

Apollo's original data storage used MongoDB, a document-based database. This
document explains why that approach has fundamental limitations for Apollo's
needs, what was changed to address them, and what the path forward looks like —
including what it would take to stay on MongoDB if that were preferred.

The short version: MongoDB's design does not match how Apollo's data is actually
used, the mismatch produced a series of workarounds in the code, and — most
importantly — MongoDB cannot run inside a self-contained desktop application.
Switching to a standard relational database (SQLite for desktop use, PostgreSQL
for collaborative server deployments) resolves all of these issues at once.

**Related documents:**

- [Technical Details](./mikro-orm-technical-details.md) — worked examples,
  tradeoff analysis, schema recommendations, deployment scenarios
- [Per-Gene History and Apollo 2 Migration](./apollo2-migration-and-history-tracking.md)
  — per-gene edit history tracking, Apollo 2 data migration plan
- [Alternatives](./mikro-orm-alternatives.md) — what staying on MongoDB would
  require, Firestore/Firebase evaluation, parallel backend approach

---

## At a Glance: Benefits

### Data model and editing

| Area                                    | MongoDB (before)                                                                                        | Relational (after)                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Editing one exon's coordinates          | Load the entire gene into memory, save it all back                                                      | Update exactly one row                                                              |
| Adding a child feature (e.g., new exon) | Load gene document, navigate to parent, insert into children map, update `allIds`, save entire document | Insert one row with parent ID set                                                   |
| Two annotators editing the same gene    | Risk of one user's changes being silently overwritten                                                   | No conflict — each user edits a different row                                       |
| Finding a feature by its ID             | Scan a secondary list, then walk a nested structure                                                     | Direct lookup by primary key                                                        |
| Importing a large annotation file       | Subject to a 16 MB limit; required a fragile staging workaround                                         | No size limit; standard database transaction                                        |
| Redundant bookkeeping                   | A manually-maintained list of all descendant IDs in every gene record                                   | Not needed — IDs are native database keys                                           |
| Data integrity enforcement              | Application code responsible for all constraints                                                        | Foreign keys, unique constraints, and indexes enforced by the database itself       |
| Transaction safety                      | Partial failures in multi-step operations were hard to recover from                                     | Each change runs in a transactional unit of work with automatic rollback on failure |

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
| Real-time collaboration  | Used MongoDB change streams (required replica set) — but WebSockets actually did the work                    | Same WebSocket system, unchanged — collaboration was never database-dependent       |
| Undo / redo              | Worked but relied on MongoDB session management                                                              | Unchanged — undo logic is database-agnostic; transactions are now cleaner           |
| Continuity with Apollo 2 | Apollo 2 used PostgreSQL; Apollo 3's move to MongoDB lost relational benefits                                | Returns to a relational model (like Apollo 2) while keeping Apollo 3's architecture |

### Future capabilities enabled

| Area                       | MongoDB (before)                                                                                                     | Relational (after)                                                                                                                                                                                                                        |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Per-gene edit history      | Grails audit logging tracked changes per feature; users could review a gene's full edit timeline                     | Proposed: add indexed `gene_id` column to change table for instant per-gene history lookups. See [history tracking plan](./apollo2-migration-and-history-tracking.md)                                                                     |
| Apollo 2 history migration | N/A                                                                                                                  | Proposed: import Apollo 2 audit records into the change log, preserving the complete edit timeline for migrating users. See [migration plan](./apollo2-migration-and-history-tracking.md#migrating-apollo-2-data-and-history-to-apollo-3) |
| Annotation quality checks  | Check results stored in a JSON array; querying per feature required loading the entire table and filtering in memory | Check results have indexed range columns for fast viewport queries. Enables running checks only on feature change, not on every pan/zoom                                                                                                  |

## At a Glance: Tradeoffs and Mitigations

| Area                                     | What is currently harder                                                                       | Mitigation                                                                                                                                         |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loading a full gene tree for display     | Currently requires multiple queries to walk the hierarchy                                      | Add a `root_id` column: one query fetches all descendants of any gene. Alternatively, use a recursive SQL query (single round trip).               |
| Fetching all features in a genomic range | Root genes are found efficiently, but loading their complete trees requires extra round trips  | Same `root_id` fix: two queries total (find roots in range, then fetch all rows sharing those root IDs) matches MongoDB's single-fetch behavior    |
| Deleting a gene and all descendants      | Currently uses a recursive loop with one database call per child                               | Add `ON DELETE CASCADE` to the parent foreign key — deletion becomes a single operation handled entirely by the database                           |
| Deleting an assembly                     | Must delete related records (check results, features, ref seqs) in a specific order            | Add cascade delete rules to the schema — the database handles ordering automatically                                                               |
| Reassembling trees from flat rows        | An extra in-memory step (not needed with MongoDB's nested documents)                           | Already efficient (single O(n) pass); cost is negligible for any realistic gene size                                                               |
| Full-text search                         | Currently uses basic pattern matching (`LIKE`), weaker than MongoDB's text index               | Replace with SQLite FTS5 or PostgreSQL tsvector — both are mature, built-in full-text search systems                                               |
| Some bulk operations (export, search)    | Loop-based queries that issue one database call per item (N+1 pattern)                         | Replace loops with batched queries using `IN` filters — straightforward code fix                                                                   |
| Check result lookup by feature ID        | Loads entire table into memory and filters in application code (`ids` stored as JSON array)    | Normalize `ids` into a join table for indexed per-feature lookup; or use `gene_id` on check results (same pattern as change history)               |
| Checks re-run on every viewport request  | `checkFeature()` is called for every feature on every `getFeatures()` call, not just on change | Run checks only when a feature is modified (after a Change is applied), cache results; viewport requests just query the indexed check_result table |
| Parent boundary consistency              | Server trusts the client to send correct parent updates (same as MongoDB)                      | Add server-side validation that recomputes parent boundaries after child coordinate changes                                                        |

See [Technical Details](./mikro-orm-technical-details.md) for full analysis of
each tradeoff with worked examples.

---

## Background: How Apollo's Data Is Structured

Genomic annotation features — genes, transcripts, exons, coding sequences — form
a natural hierarchy. A gene contains one or more transcripts; each transcript
contains exons and coding sequence segments.

In the original MongoDB design, this entire hierarchy was stored as a single
"document" (a deeply nested record). The gene was the container, and everything
below it was embedded inside it. This seemed natural at first but turned out to
be a poor fit for how the data is actually read and written in practice.

---

## The Core Problems With the MongoDB Design

### 1. Every edit touched far more data than necessary

Because all of a gene's children were packed into one document, any edit — even
moving a single exon by one base pair — required loading the entire gene record
into memory, modifying the right nested piece, and writing the whole thing back.
For large genes with many transcripts or exons, this is a significant and
unnecessary overhead.

### 2. Collaborative editing had a silent data-loss risk

When two annotators edited different parts of the same gene at the same time — a
common scenario in a collaborative tool — both would load the same gene
document, make their respective changes, and then both try to save it. The
second save would overwrite the first. One annotator's work would be silently
lost with no error or warning.

### 3. The system needed redundant data to stay usable

MongoDB cannot directly search inside nested documents. To work around this,
every gene document was required to carry an `allIds` field: a manually
maintained list of every descendant feature's ID. This list had to be updated
every time a child feature was added, removed, or moved. It was extra data
duplicating what the tree structure already expressed, and any bug that caused
it to fall out of sync would corrupt lookups across the application.

### 4. There were hard limits on how much data could be stored or imported

MongoDB imposes a 16 MB maximum size on a single document. Highly spliced genes
with thousands of exons — not unusual in genomics — could approach this ceiling.
Large GFF3 file imports ran into similar restrictions, which required a fragile
workaround: features were initially written with a "pending" status flag and
then retroactively committed, adding complexity and a potential failure mode if
the process was interrupted.

### 5. Even a single-machine deployment required complex database configuration

MongoDB was configured in "replica set" mode — a configuration designed for
multi-machine redundancy — because Apollo used MongoDB's "change stream"
feature, which only works in replica set mode. However, investigation of the
actual codebase reveals that **real-time collaboration does not depend on change
streams at all.** Apollo uses WebSockets (Socket.IO) to broadcast changes
directly. The replica set requirement — and all the deployment friction it
caused — was imposed by a MongoDB feature that Apollo did not need.

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

This eliminates all five problems described above:

- Editing exon_1 now updates exactly one row. Nothing else is read or written.
- Two annotators editing exon_1 and exon_2 are writing to separate rows — there
  is no contention.
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

A full package (`apollo-schemas`) that existed solely to define MongoDB-specific
data types was deleted entirely. The new entity definitions — 13 entities
totaling roughly 330 lines — are compact, declarative, and map directly to
database tables.

### Undo and redo are unaffected

Apollo's undo system works by computing the inverse of each change (e.g., the
inverse of a delete is an add). This logic lives entirely in TypeScript and does
not depend on the database technology. The migration did not require any changes
to undo/redo.

If anything, the relational model provides better guarantees: each change now
executes inside a transactional unit of work with automatic rollback on failure.

### MongoDB is fully removed

No active code in the application depends on MongoDB. The only remaining MongoDB
reference is a one-time migration script for converting existing production data
into the new schema.

---

## The Way Forward

The core migration is complete: MongoDB has been fully removed from the active
codebase, the data model is relational, all existing change operations work, and
the undo/redo system is unaffected. What remains is optimization work on a sound
foundation.

**What is already working:**

- **Desktop / local use**: Apollo runs fully self-contained with an embedded
  SQLite database. No external services required.
- **Collaborative server**: The same application runs against PostgreSQL,
  supporting concurrent users and large datasets.
- **Data migration**: A migration script exists to move existing MongoDB data
  into the new schema for any current production deployments.
- **Data portability**: Annotation data can be inspected, exported, or backed up
  with standard SQL tools — no specialized tooling required.

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

_Production readiness:_

- **Transition from auto-schema to explicit migrations** — auditable, reversible
  schema evolution with migration files committed to the repository. See
  [Technical Details](./mikro-orm-technical-details.md#schema-migrations-a-major-improvement-over-mongodb)

For detailed technical analysis of each item, schema recommendations, and
deployment scenarios, see [Technical Details](./mikro-orm-technical-details.md).
For alternatives to this migration, see
[Alternatives](./mikro-orm-alternatives.md).
