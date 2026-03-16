# From MongoDB to Relational Databases

Apollo3 migrated from MongoDB to MikroORM, supporting SQLite, PostgreSQL, and
MongoDB from a single codebase. The migration is complete. A
[migration script](../packages/apollo-collaboration-server/scripts/migrate-mongo-to-mikroorm.ts)
exists for existing MongoDB deployments.

## At a Glance

### Data model and editing

| Area | MongoDB (before) | Relational (after) |
|------|-------------------|---------------------|
| Editing a single feature | Load entire gene doc, modify, write back | Update one row |
| Two users editing same gene | Second save overwrites first user's changes | No conflict — separate rows |
| Data integrity | Application-enforced | Database-enforced (FKs, cascades, transactions) |
| Feature lookup by ID | Scan `allIds` arrays across all genes | Direct primary key lookup |
| Document/row size limits | 16MB per gene document | None |

### Deployment and operations

| Area | MongoDB (before) | Relational (after) |
|------|-------------------|---------------------|
| Desktop deployment | Not possible (MongoDB requires a server) | Fully self-contained with SQLite |
| Server deployment | 2 MongoDB containers in replica set, 4 volumes, init scripts | 1 PostgreSQL container, or 0 with SQLite |
| Developer setup | Install + configure MongoDB replica set | `pnpm install && pnpm start` |
| CI setup | MongoDB service container + replica set init | Nothing needed (SQLite) |
| Min hosting cost | ~$50-60/mo (MongoDB Atlas) | $0 (SQLite) or ~$5-15/mo (PostgreSQL) |
| Backups | `mongodump` | Copy one file (SQLite) or `pg_dump` |

### Code and maintenance

| Area | MongoDB (before) | Relational (after) |
|------|-------------------|---------------------|
| Server code complexity | Each operation navigated nested trees; many were 30+ lines | Most operations are 5-10 lines targeting specific rows |
| Schema definitions | Mongoose schemas + separate `apollo-schemas` package | 13 compact entity definitions in `apollo-entities` |
| Dependencies | `mongoose`, `@nestjs/mongoose`, `connect-mongodb-session`, `mongoose-id-validator`, `apollo-schemas` | One ORM (`@mikro-orm/*`) |
| Real-time collaboration | Unchanged — runs through WebSockets, independent of DB | |
| Undo/redo | Unchanged — pure TypeScript, independent of DB | |

## Why We Migrated

1. **Concurrent editing was broken by design.** MongoDB stored an entire gene
   as one nested document. Two annotators editing different exons both
   loaded/saved the full document — second save silently overwrote the first.
   With flat rows, each feature is its own record.

2. **Every edit touched more data than necessary.** Changing one exon by 1bp
   loaded and rewrote the entire gene. With flat rows, it's a single-row update.

3. **The `allIds` bookkeeping was fragile.** Every gene carried a
   manually-maintained list of all descendant IDs. With flat rows, every feature
   has its own primary key.

4. **16MB document size limit.** Highly spliced genes could hit MongoDB's
   per-document ceiling. Flat rows have no per-record limit.

5. **Deployment was unnecessarily complex.** MongoDB required a two-container
   replica set for change streams that Apollo3 didn't use for collaboration
   (WebSockets handle that). PostgreSQL needs one container; SQLite needs none.

6. **Desktop deployment was impossible.** No embedded MongoDB exists. SQLite
   enables fully self-contained desktop/Electron use.

## Why MikroORM

- Multi-database from one codebase (SQLite, PostgreSQL, MongoDB, MySQL, MS SQL)
- TypeScript-first entity definitions with compile-time type safety
- Unit of Work pattern: automatic change tracking, single-transaction flush
- Built-in migration system (like Liquibase/Rails migrations)
- First-class NestJS integration via `@mikro-orm/nestjs`

## Tradeoffs

| Area | Harder? | Mitigation |
|------|---------|------------|
| Loading a full gene tree | Yes — requires recursive CTEs vs one document fetch | `findDescendantsOfMany` batches all roots into one CTE. Add `root_id` only if profiling proves bottleneck |
| Merging transcripts | Yes — more DB round-trips for cross-parent operations | Fixable with `UPDATE ... WHERE parent IN (...)` batching |
| Text search | Currently weaker (`LIKE` vs MongoDB text indexes) | Replace with SQLite FTS5 or PostgreSQL tsvector |

## Serverless and Scale-to-Zero

The relational model unlocks deployment patterns impossible with MongoDB:

- **Scale-to-zero containers** (Fargate/Cloud Run + Aurora Serverless/Neon):
  idle cost ~$0-5/mo vs $50-60/mo MongoDB floor
- **Single-file SQLite** on a $3-6/mo nano instance: full Apollo3 in one process
- **Lambda** (read-only): viable for serving annotations to public JBrowse;
  full collaboration blocked by WebSocket requirement (solvable with SSE)

## Related Documents

- [Benchmark Results](./benchmark-results.md) — performance numbers
- [Technical Details](./mikro-orm-technical-details.md) — worked examples, schema assessment
- [History Tracking](./apollo2-migration-and-history-tracking.md) — per-gene history, Apollo2 migration
- [Alternatives](./mikro-orm-alternatives.md) — MongoDB fixes, Firestore evaluation
