# From MongoDB to Relational Databases

This branch migrates Apollo3 from MongoDB to MikroORM, supporting SQLite,
PostgreSQL, and MongoDB from a single codebase. A
[migration script](../packages/apollo-collaboration-server/scripts/migrate-mongo-to-mikroorm.ts)
exists for existing MongoDB deployments.

## At a Glance

### Data model and editing

| Area                        | MongoDB (current)                              | Relational (proposed)                           |
| --------------------------- | ---------------------------------------------- | ----------------------------------------------- |
| Editing a single feature    | Load entire gene doc, modify, write back       | Update one row                                  |
| Two users editing same gene | Second save may overwrite first user's changes | No conflict — separate rows                     |
| Data integrity              | Application-enforced                           | Database-enforced (FKs, cascades, transactions) |
| Feature lookup by ID        | Scan `allIds` arrays across all genes          | Direct primary key lookup                       |
| Document/row size limits    | 16MB per gene document                         | None                                            |

### Deployment and operations

| Area               | MongoDB (current)                                            | Relational (proposed)                                               |
| ------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------- |
| Desktop deployment | Not possible (MongoDB requires a server)                     | Fully self-contained with SQLite                                    |
| Server deployment  | 2 MongoDB containers in replica set, 4 volumes, init scripts | 1 PostgreSQL container, or 0 with SQLite                            |
| Developer setup    | Install + configure MongoDB replica set                      | `pnpm install && pnpm start`                                        |
| CI setup           | MongoDB service container + replica set init                 | Nothing needed (SQLite)                                             |
| Hosting footprint  | Replica set (multi-container)                                | Potentially a nano instance (SQLite) or single PostgreSQL container |
| Backups            | `mongodump`                                                  | Copy one file (SQLite) or `pg_dump`                                 |

### Code and maintenance

| Area                    | MongoDB (current)                               | Relational (proposed)                      |
| ----------------------- | ----------------------------------------------- | ------------------------------------------ |
| Code complexity         | Nested tree navigation; 30+ lines per operation | 5-10 lines per operation                   |
| Schema definitions      | Mongoose + `apollo-schemas` package             | 13 entity definitions in `apollo-entities` |
| Dependencies            | 5 packages (mongoose, etc.)                     | One ORM (`@mikro-orm/*`)                   |
| Schema migrations       | None (implicit)                                 | Timestamped, committed, reversible         |
| Real-time collaboration | Unchanged (WebSockets)                          |                                            |
| Undo/redo               | Unchanged (TypeScript)                          |                                            |

## Why Migrate

1. **Every edit loads and rewrites the entire gene.** On origin/main, changing
   one exon by 1bp loads the full gene document (all exons, mRNAs, CDSs) and
   writes the whole thing back. With flat rows, it is a single-row update. This
   is the root cause of most code complexity on the server side — each operation
   must navigate nested Maps, update parent bookkeeping, and serialize the whole
   tree back to the database.

2. **The `allIds` bookkeeping is fragile.** On origin/main, every gene carries a
   manually-maintained array of all descendant IDs. Application code must keep
   this array in sync on every add, delete, or reparent. With flat rows, every
   feature has its own primary key — no bookkeeping needed.

3. **Concurrent editing.** Because the full gene document is loaded and saved as
   a unit, two annotators editing different exons of the same gene both load and
   save the full document — the second save could overwrite the first user's
   changes. This is a known limitation of the document-per-gene model
   (addressable with optimistic locking in MongoDB, but not currently
   implemented on origin/main). With flat rows, edits to different features
   target different rows and do not conflict. A database-level counter with
   pessimistic locking assigns each change a unique sequence number within a
   transaction, preventing ordering collisions.

4. **16MB document size limit.** Highly spliced genes can hit MongoDB's
   per-document ceiling. Flat rows have no per-record limit.

5. **Replica set required for transactions.** MongoDB requires a replica set
   (minimum two containers) to support transactions. On origin/main, Apollo3
   uses transactions for multi-step edits. A single-node MongoDB deployment does
   not support transactions. The replica set also requires extra Docker volumes,
   an init script, and an elevated timeout setting
   (`transactionLifetimeLimitSeconds=300`) for large imports. PostgreSQL needs
   one container; SQLite needs none — both support transactions natively.

6. **No desktop/Electron deployment.** MongoDB requires a running server process
   with no embedded mode. SQLite enables fully self-contained desktop/Electron
   deployment.

7. **No formal schema migration system.** On origin/main, there is no built-in
   way to version or migrate schema changes — changes are implicit (start
   writing new fields and hope old documents still work). MikroORM provides
   timestamped migration files committed to the repo, run in order on deploy,
   and reversible. While NoSQL schemas are more flexible by nature (no columns
   to add), that flexibility comes at the cost of no enforcement and no audit
   trail. Automated migrations give us schema flexibility with a safety net.

## Why MikroORM

- Multi-database from one codebase (SQLite, PostgreSQL, MongoDB, MySQL, MS SQL)
- TypeScript-first entity definitions with compile-time type safety
- Unit of Work pattern: automatic change tracking, single-transaction flush
- Built-in migration system (like Liquibase/Rails migrations)
- First-class NestJS integration via `@mikro-orm/nestjs`

## Tradeoffs: What Gets Harder

MongoDB's nested document model has genuine advantages for certain operations:

**Loading a full gene tree.** MongoDB returns the entire gene pre-assembled in
one document fetch. With flat rows, a recursive CTE query walks the parent chain
and assembles the tree in memory. Mitigation: `findDescendantsOfMany` batches
all roots into one CTE. Typically 3-4 levels deep.

**Merging transcripts.** With MongoDB, all children are already in memory from
the document load. With flat rows, children must be queried separately,
reparented, and flushed. Mitigation: fixable with batch
`UPDATE ... WHERE parent IN (...)`.

**Attribute search.** MongoDB natively queries inside nested documents and
supports `$text` indexes with ranking. Feature attributes are currently stored
in a JSON column, making `LIKE` queries slow and imprecise (no ranking, no
stemming, risk of false positives). Mitigation: SQLite FTS5 or PostgreSQL
tsvector can index extracted text, or a separate `feature_attribute` table would
allow direct indexed queries.

**Schema flexibility.** Adding a field in MongoDB requires no migration — just
start writing it. With a relational schema, it requires a migration (add column,
deploy). Mitigation: MikroORM automates migration generation, but it is an extra
step.

These tradeoffs are real. The operations that get harder (tree loading,
transcript merges, attribute search) are less frequent than those that get
dramatically simpler (single-feature edits, feature lookup, bulk import,
deletion), but the attribute search limitation in particular deserves attention
as the annotation workflow matures.

## New Deployment Options

The relational model enables deployment patterns not practical with MongoDB:

- **Nano instance with SQLite**: full Apollo3 in one process on minimal
  hardware, when analysis tools are not in use. Analysis tools (BLAST, BLAT,
  miniprot, Tiberius) are more resource-intensive and would increase
  requirements.
- **Scale-to-zero containers** (Fargate/Cloud Run + Aurora Serverless/Neon): no
  idle cost when nobody is using the instance
- **Desktop/Electron**: SQLite has no server process requirement, enabling fully
  self-contained desktop deployment — not possible with MongoDB
- **Lambda** (read-only): viable for serving annotations to public JBrowse; full
  collaboration blocked by WebSocket requirement (solvable with SSE)
