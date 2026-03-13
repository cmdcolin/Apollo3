# Technical Details: Relational Migration

This document covers worked examples, tradeoff analysis, schema recommendations,
migration tooling, and deployment scenarios for the MongoDB → relational
migration. For the core rationale, see
[mikro-orm-migration-justification.md](./mikro-orm-migration-justification.md).

---

## Worked Example: Changing an Exon Boundary

Changing an exon's start or end coordinate is one of the most common annotation
operations. It illustrates both the strengths of the new model and an area where
care is still needed.

### What the operation involves

When an annotator moves an exon boundary outward, three things may need to
change: the exon itself, the transcript that contains it (if the exon now
extends beyond the transcript's current boundary), and the gene (if the
transcript now extends beyond the gene's boundary). The application needs to
detect which parents are affected and update each one.

### How MongoDB handled it

As described in the core document: scan `allIds` to find the gene document, load
the entire document into memory (all transcripts, all exons), walk the nested
structure, modify one field, write the entire document back. A gene with fifty
exons required loading all fifty to change one.

### How the relational model handles it

The client packages all necessary updates — exon, transcript, and gene if needed
— as a single request. On the server, each is a targeted single-row write. Three
features affected means three row updates; nothing else is read or written. Less
data transferred, less memory used, and no risk of overwriting a concurrent edit
to a different exon.

### An open design question: who is responsible for parent boundary consistency?

The current design relies on the client sending the correct set of boundary
updates. If the client sends an exon update but misses the parent transcript,
the database will contain inconsistent data — an exon that extends beyond its
transcript — with no error raised. MongoDB had the same reliance on the client;
this is not a regression, but it is worth noting.

A more robust approach would have the server verify and correct parent
boundaries after any child coordinate change, rather than trusting the client to
always compute them correctly. This is a straightforward improvement that would
make the system defensively correct regardless of how the client behaves.

### Deletion: where the relational model is currently weaker, and how to fix it

Deleting a gene in MongoDB was one operation: delete the document. In the
current relational implementation, deletion requires a recursive traversal.

Two fixes are proposed (detailed in the Schema Assessment section below):

- **`ON DELETE CASCADE`** on the parent foreign key — the database automatically
  removes all children when a parent is deleted. One operation, no application
  code.
- **A `root_id` column** on every feature row, storing the top-level gene's ID.
  This enables `DELETE FROM feature WHERE root_id = ?` — one query for the
  entire tree. It also enables one-query tree loading (see the range query
  discussion below). This is a much simpler form of denormalization than
  MongoDB's `allIds` list: one fixed value per row instead of a variable-length
  list, with the only maintenance case being transcript reparenting (rare).

The assembly-level deletion already uses this pattern: features are deleted with
`DELETE WHERE refSeq IN (...)`, one query. Extending it to the gene level via
`root_id` is the same idea.

---

## Where the Relational Model Is Harder (and What to Do About It)

Some operations are genuinely harder in a relational database than with nested
documents. These fall into two categories: structural differences, and current
implementation gaps that can be fixed.

### Structurally harder: loading gene trees, especially for genomic range queries

The most common read operation in a genome browser is "get all features
overlapping this coordinate range." This is where the flat model requires the
most care.

With MongoDB, this was conceptually one step: query for gene documents whose
coordinates overlap the range, and each document already contains the complete
tree of descendants. One query, full result.

With the flat relational model, the operation happens in two stages:

1. **Find the root-level features (genes) whose coordinate range overlaps the
   viewport.** This is a standard indexed range query and is fast.
2. **Load all descendants of each matched gene** — all transcripts, exons, and
   CDS features — to produce complete gene trees. The client needs the entire
   gene model for display, not a partial subset of exons that happen to fall in
   the viewport.

Currently, step 2 uses a per-gene traversal that issues multiple database
queries. If the viewport overlaps 50 genes, this creates a significant number of
round trips.

Once the flat rows are loaded, they must be reassembled into a tree structure
before the client can use them (since the user interface is built around
navigating parent-child hierarchies). This reassembly step is efficient — a
single pass over the data — but it is an additional step that MongoDB did not
require.

Deletion complexity and the proposed fixes (`ON DELETE CASCADE` and a `root_id`
column) are covered in the worked example above.

**Why this is solvable:** The same `root_id` column proposed for deletion
collapses step 2 into a single query:

```
Step 1: SELECT * FROM feature WHERE parent IS NULL AND refSeq = ? AND min <= ? AND max >= ?
Step 2: SELECT * FROM feature WHERE root_id IN (matched gene IDs from step 1)
```

Two queries total, any number of genes, any nesting depth. This matches
MongoDB's single-fetch behavior while retaining all the benefits of the flat
model for edits.

**Why the tradeoff is acceptable even before this optimization:** Range queries
happen on viewport navigation; single-feature edits happen continuously. The
read path is the right place to invest optimization, and `root_id` gives a clear
path to parity.

### Previously identified implementation gaps (now fixed)

The following issues existed in the initial migration and have been resolved:

- **N+1 query patterns** — Service methods that looped over reference sequences
  now use batched `IN` queries. `findDescendants`, `deleteDescendants`, and
  `searchText` all use level-batched or in-memory approaches.
- **Assembly deletion ordering** — `ON DELETE CASCADE` on all foreign keys means
  `deleteById(assembly)` is now a single call. The database handles ordering.
- **Check result full-table scan** — `findByFeatureId` and
  `deleteByFeatureIdsAndName` now use SQL `LIKE` on the JSON `ids` column to
  filter at the database level, with a JS verification pass for exact matching.
- **Feature counting** — `getFeatureCount` now uses `em.count()` instead of
  loading all features into memory.

### Text search: not a MongoDB advantage

It was previously assumed that text search across annotations was a
MongoDB-specific capability. This is not accurate. Both SQLite and PostgreSQL
have mature, built-in full-text search:

- **SQLite** includes FTS5, a full-text search extension that indexes content
  and supports prefix and phrase queries efficiently.
- **PostgreSQL** has `tsvector` and `tsquery`, a first-class full-text search
  system used in production by many applications.

The current relational implementation uses a simple pattern-match query (`LIKE`)
on the feature type field, which is weaker than what was available in MongoDB.
However, this is an implementation shortcut, not a limitation of the database.
Replacing it with FTS5 (SQLite) or tsvector (PostgreSQL) would produce search
quality that matches or exceeds the MongoDB baseline, and is achievable without
any architectural changes.

### Summary of tradeoffs

| Operation                           | Relational is harder?            | Status    | Fix                                  |
| ----------------------------------- | -------------------------------- | --------- | ------------------------------------ |
| Loading a full gene tree            | Yes — multiple queries currently | Fixable   | `root_id` column (single round trip) |
| Deleting a gene and all descendants | No — cascade handles it          | **Fixed** | `ON DELETE CASCADE` on parent FK     |
| Assembly deletion ordering          | No — cascade handles it          | **Fixed** | Cascade delete on all FKs            |
| Bulk queries (search, export)       | No — batched queries now         | **Fixed** | Batched `IN` filters throughout      |
| Full-text annotation search         | Currently weaker                 | Fixable   | SQLite FTS5 / PostgreSQL tsvector    |
| Editing a single feature            | No — this is faster now          | —         | —                                    |
| Finding a feature by ID             | No — this is faster now          | —         | —                                    |
| Large imports                       | No — this is better now          | —         | —                                    |
| Concurrent edits                    | No — this is safe now            | —         | —                                    |

Most items previously marked "Fixable" have been implemented. The remaining
items (gene tree loading, full-text search) have clear, bounded solutions.

---

## Schema Assessment and Recommended Improvements

The current schema is functional and supports all existing operations. However,
several improvements would make the data model more robust for production use.

### What is solid

- **The core feature table design is sound.** One row per feature with a parent
  foreign key, coordinate columns, and a composite index on `(refSeq, min, max)`
  is the right foundation.
- **Entity definitions are compact and clear.** Thirteen entities in roughly 330
  lines, each mapping directly to a database table with typed columns and
  explicit relationships.
- **The separation between entities, repositories, and change logic is clean.**
  Entities define structure; repositories handle queries; change classes contain
  business logic. Each layer has a clear responsibility.

### Implemented schema improvements

**1. `ON DELETE CASCADE` on all foreign keys**

All foreign keys now have cascade delete rules. Deleting an assembly
automatically removes all ref seqs, features, chunks, check results, and
exports. The application code for assembly deletion is now a single `deleteById`
call. No manual ordering, no orphaned rows.

**2. Index on `FeatureEntity.parent`**

Tree traversal operations (finding children, descendants) now use an indexed
query on the `parent` column instead of full table scans.

**3. Index on `RefSeqEntity.assembly`**

Loading ref seqs for an assembly (used in range queries, exports, and deletions)
is now an indexed lookup.

**4. Index on `CheckResultEntity.name`**

Filtering check results by name (used in `deleteByFeatureIdsAndName`) is now
indexed.

**5. Batched descendant queries**

`findDescendants` and `deleteDescendants` now use level-batched BFS with `IN`
filters, reducing from N queries (one per node) to D queries (one per tree depth
level, typically 3-4).

**6. In-memory parent map for text search**

`searchText` builds a parent map from already-loaded entities and walks to root
features in memory, eliminating all per-match database queries.

### Remaining schema improvements

**1. Add `root_id` column to `FeatureEntity`**

This would eliminate multi-query tree loading entirely. One query fetches the
entire gene tree. Highest-impact remaining change.

**2. Normalize the `CheckResultEntity.ids` field**

Check results store feature IDs as a JSON array. A join table
(`check_result_features`) would replace the current `LIKE`-based filtering with
standard indexed queries.

### Schema relationship summary

```
AssemblyEntity
  └─ RefSeqEntity (FK: assembly → AssemblyEntity)
       ├─ FeatureEntity (FK: refSeq → RefSeqEntity, FK: parent → FeatureEntity)
       ├─ RefSeqChunkEntity (FK: refSeq → RefSeqEntity)
       └─ CheckResultEntity (FK: refSeq → RefSeqEntity)

UserEntity (standalone)
FileEntity (standalone)
ChangeEntity (FK: reverts → ChangeEntity, self-referential for undo chain)
CheckEntity (standalone — check definitions, not results)
JBrowseConfigEntity (standalone)
CounterEntity (standalone)
ExportEntity (FK: assembly → AssemblyEntity)
```

This is a clean, normalized design. The relationships are straightforward and
all point in the expected directions.

---

## Schema Migrations: A Major Improvement Over MongoDB

### MongoDB had no formal migration system

With MongoDB, there was no built-in mechanism for tracking or applying schema
changes. MongoDB's "schemaless" nature meant that documents with different
shapes could coexist in the same collection. While this sounds flexible, in
practice it created problems:

- There was no way to know what version of the schema a given database was at
- Schema changes had to be applied by hand or through ad-hoc scripts
- Rolling back a schema change was difficult because there was no record of what
  changed
- There was no equivalent of Apollo 2's Liquibase migrations — which provided a
  versioned, auditable history of every schema change

### MikroORM has built-in migration support

MikroORM provides a migration system that works similarly to Liquibase, Rails
migrations, or Django migrations:

- Migration files are generated automatically by comparing the current entity
  definitions to the current database schema
- Each migration file is a timestamped script that describes the exact changes
  (add column, create index, alter constraint, etc.)
- Migration files are committed to the repository alongside the code, providing
  a complete, auditable history of every schema change
- Migrations run in order on deployment, bringing any database from any previous
  version to the current schema
- Migrations can be rolled back if a deployment needs to be reverted

### Current state and next steps

The current implementation uses MikroORM's `SchemaGenerator.updateSchema()` to
automatically create or update tables on server startup. This is appropriate for
development and initial deployment, but for production use, transitioning to
explicit migration files would be beneficial:

1. **Generate an initial migration** from the current entity definitions — this
   captures the baseline schema
2. **Commit migration files** to the repository so they are versioned with the
   code
3. **Run migrations on deployment** instead of auto-updating the schema, so
   every schema change is auditable and reversible
4. **Future schema changes** (like adding `root_id` or cascade rules) are
   expressed as individual migration files with clear descriptions

This restores the migration discipline that Apollo 2 had with Liquibase and
PostgreSQL, but integrated directly into the ORM rather than requiring a
separate tool. Migration files live in the repository, are reviewed in pull
requests, and can be tested in CI. In a sense, the relational migration brings
Apollo 3 back in line with the proven data management practices of Apollo 2,
while keeping the architectural improvements (TypeScript, NestJS, JBrowse 2
plugin system) that Apollo 3 introduced.

---

## Deployment Simplification

### Developer setup: from "install and configure MongoDB" to "run the server"

With MongoDB, getting a working development environment required:

1. Installing MongoDB
2. Configuring it as a replica set (required even for a single-machine setup
   because Apollo 3 used change streams)
3. Starting the MongoDB service
4. Setting the `MONGODB_URI` environment variable to point to the running
   instance
5. Starting the Apollo server

With the relational model, the entire process is:

1. Starting the Apollo 3 server

The SQLite database file is created automatically on first run. There is no
external service to install, no configuration to set, and no environment
variables required beyond what ships with the project's default
`.development.env` file. A new contributor can clone the repository and have a
working backend in minutes rather than spending time on database setup.

### CI and automated testing: no database service container

With MongoDB, every CI pipeline (GitHub Actions, etc.) needed to start a MongoDB
service container, wait for it to initialize as a replica set, and pass the
connection URI to the test environment. This added both complexity and time to
every CI run.

With SQLite, tests run against a temporary database file that the server creates
on startup and that can be deleted between test runs. No service containers, no
health checks, no initialization scripts.

### Cloud hosting: cheaper and more flexible

MongoDB requires a dedicated, always-running database instance. The minimum cost
for a managed MongoDB cluster (e.g., MongoDB Atlas) starts around $50–60/month
for even a small deployment. Self-hosting MongoDB requires a server with enough
memory to hold its working set and enough operational expertise to manage
replica sets, backups, and upgrades.

The relational model opens several significantly cheaper options:

- **SQLite for small or single-user deployments**: The database runs in-process
  alongside the application server. There is no separate database cost at all. A
  single small cloud instance (or even a free-tier VM) can run the entire
  application.
- **Managed PostgreSQL for collaborative deployments**: Services like AWS RDS,
  Google Cloud SQL, or Railway offer managed PostgreSQL starting at a fraction
  of MongoDB Atlas pricing.
- **Serverless PostgreSQL**: Services like AWS Aurora Serverless or Neon can
  scale database capacity to zero when idle and charge only for actual usage.
  This is ideal for Apollo 3 instances that see intermittent use — a common
  pattern for annotation projects that are active during certain phases and idle
  between them.

### Serverless and containerized deployment scenarios

MongoDB is not well suited to serverless architectures because it requires
persistent connections and a running server process. The relational model opens
up several concrete deployment options that were previously impossible.

**Scenario 1: Scale-to-zero container (AWS Fargate / Google Cloud Run)**

This is the most practical near-term serverless option. The Apollo 3 NestJS
server runs as a container that cloud infrastructure starts on demand and shuts
down after a period of inactivity.

- A single Docker image contains the Apollo server and nothing else
- PostgreSQL is provided by a managed serverless database (AWS Aurora Serverless
  v2 or Neon), which also scales to near-zero when idle
- When a researcher opens the Apollo interface, the cloud platform starts the
  container (cold start: a few seconds). When they stop using it, the container
  shuts down and billing stops
- The database persists independently and costs very little when idle (Aurora
  Serverless bills per consumed capacity unit; Neon bills per compute-second)
- **Total idle cost: approximately $0–5/month** depending on provider, versus
  the $50–60+/month floor for a MongoDB cluster that must always be running

This scenario works today with the current NestJS architecture — NestJS starts,
connects to PostgreSQL, and serves requests. No architectural changes are
required beyond containerizing the server (which is already done via the
existing Dockerfile).

**Scenario 2: Single-file SQLite deployment on a small VM or shared host**

For groups that need a persistent Apollo instance but have minimal budget or
infrastructure:

- A single small VM (AWS t4g.micro at ~$6/month, or a free-tier instance) runs
  both the NestJS server and the SQLite database
- The database is a single file on the VM's disk; backups are a file copy or
  rsync
- No database service to manage, no connection strings, no replica sets
- Suitable for single-user or small-team use where concurrent write contention
  is low

**Scenario 3: Desktop application (Electron)**

Covered in its own section below. The server and database both run inside the
application process. No network, no cloud, no cost.

**Could the NestJS server run as a serverless function (e.g., AWS Lambda)?**

NestJS can run inside Lambda using `@vendia/serverless-express`. The main
limitations are cold start time (2–5 seconds for NestJS initialization), the
need for a connection pooler for PostgreSQL, and the lack of native WebSocket
support (Apollo 3 uses WebSockets for real-time collaboration).

Lambda is most realistic for read-only, non-collaborative use cases — for
example, serving annotation data to a public-facing JBrowse instance. For
collaborative editing, the scale-to-zero container approach (Scenario 1) is more
practical because it supports WebSockets natively.

### Desktop / Electron deployment

This is one of the most important strategic reasons for the migration. MongoDB
requires a separate server process and cannot run inside a desktop application.
SQLite can: it stores the database in a single file, requires no installation,
and starts when the application starts.

MikroORM supports both SQLite and PostgreSQL through the same code. A researcher
on their laptop uses SQLite; a team on a shared server uses PostgreSQL. The
application code is identical — only a config value differs. One codebase serves
individual researchers and large collaborative groups alike.
