# Schema Comparison: MongoDB vs Relational (MikroORM)

This document compares Apollo 3's database schema before and after the migration
from MongoDB to MikroORM, for leadership review.

---

## Schema at a Glance

Both schemas have **12 entities**. The entity list is the same — nothing was
added or removed. The key difference is **how features are stored** and **how
relationships are enforced**.

### Entities (old and new)

| Entity | What it stores | Structural change? |
|--------|---------------|-------------------|
| **Assembly** | A genome (e.g., "Human GRCh38") | Minor — consolidated file refs into one JSON field |
| **RefSeq** | A chromosome/scaffold within an assembly | Added CASCADE delete to assembly |
| **RefSeqChunk** | Chunked DNA sequence data | Added CASCADE delete to ref_seq |
| **Feature** | A genomic annotation (gene, transcript, exon, CDS) | **Major** — see below |
| **CheckResult** | Validation results for a genomic region | Added CASCADE delete to ref_seq |
| **User** | User accounts and roles | Minimal |
| **File** | Uploaded file metadata | Minimal |
| **Check** | Quality check definitions | Minimal |
| **Change** | Audit log of every edit | Minimal |
| **Export** | Temporary export records | Added CASCADE delete to assembly |
| **JBrowseConfig** | Browser UI configuration | Minimal |
| **Counter** | Sequence number generators | Minimal |

### Relationships (both schemas)

The entity relationships are **identical** in both schemas:

```
Assembly
  ├── RefSeq (one assembly has many chromosomes)
  │     ├── RefSeqChunk (one chromosome has many sequence chunks)
  │     ├── Feature (one chromosome has many features)
  │     └── CheckResult (one chromosome has many check results)
  └── Export (one assembly has many exports)

Change → Change (self-referential: undo links)
```

The difference is enforcement: MongoDB relied on application code to maintain
these relationships. The relational schema uses **foreign keys with CASCADE
delete** — the database enforces them automatically.

---

## The One Big Change: How Features Are Stored

This is the only architecturally significant difference between the two schemas.
Everything else is cosmetic (type annotations, enum types, etc.).

### MongoDB: nested documents

In MongoDB, a gene and all of its descendants (transcripts, exons, CDS) were
stored as a **single nested document**:

```
features collection:
┌──────────────────────────────────────────────┐
│ _id: gene_1                                  │
│ type: "gene"                                 │
│ min: 1000, max: 5000                         │
│ allIds: [gene_1, mRNA_1, exon_1, exon_2, …]  │  ← manual bookkeeping
│ children: {                                  │
│   mRNA_1: {                                  │
│     type: "mRNA"                             │
│     children: {                              │
│       exon_1: { type: "exon", min: 1000 … }  │
│       exon_2: { type: "exon", min: 3000 … }  │
│       CDS_1:  { type: "CDS",  min: 1200 … }  │
│     }                                        │
│   }                                          │
│ }                                            │
└──────────────────────────────────────────────┘
```

- The entire gene tree is **one record** in the database
- Every edit (even moving one exon by 1 bp) loads and rewrites the whole document
- The `allIds` array must be manually kept in sync on every add/remove/move
- MongoDB's 16 MB document size limit constrains large genes

### Relational: flat rows with parent references

In the relational model, each feature is its **own row**, linked to its parent
by a foreign key:

```
feature table:
┌──────────────┬──────────────┬────────────┬───────┬───────┐
│ _id          │ parent       │ type       │ min   │ max   │
├──────────────┼──────────────┼────────────┼───────┼───────┤
│ gene_1       │ NULL         │ gene       │ 1000  │ 5000  │
│ mRNA_1       │ gene_1       │ mRNA       │ 1000  │ 5000  │
│ exon_1       │ mRNA_1       │ exon       │ 1000  │ 1500  │
│ exon_2       │ mRNA_1       │ exon       │ 3000  │ 3500  │
│ CDS_1        │ mRNA_1       │ CDS        │ 1200  │ 3400  │
└──────────────┴──────────────┴────────────┴───────┴───────┘
```

- Each feature is an **independent row** — editing exon_2 touches only that row
- Parent-child relationships are expressed by the `parent` foreign key
- No `allIds` bookkeeping needed — every feature is directly addressable by ID
- No document size limit — genes can have unlimited children
- `ON DELETE CASCADE` on parent FK: deleting a gene automatically deletes all
  descendants

### What this means in practice

| Scenario | MongoDB | Relational |
|----------|---------|------------|
| Edit one exon | Load entire gene doc, modify, write back | Update one row |
| Two users edit different exons of same gene | Second save overwrites first user's changes | No conflict — separate rows |
| Look up a feature by ID | Scan `allIds` arrays across all gene docs | Direct primary key lookup |
| Delete a gene | One delete (whole doc) | One delete (CASCADE removes children) |
| Large gene (thousands of exons) | May hit 16 MB doc limit | No limit |
| Add/remove a child feature | Must update parent's `allIds` array | Just insert/delete the row |

---

## What Stayed the Same

These systems are **completely unaffected** by the schema change:

- **Real-time collaboration** — runs through WebSockets (Socket.IO), not the
  database
- **Undo/redo** — logic lives in TypeScript change classes, independent of DB
- **Change tracking** — same audit log structure in both schemas
- **User management** — same fields, same roles
- **File handling** — same metadata storage
- **Quality checks** — same check definitions and results structure

---

## New Capabilities from the Relational Model

### CASCADE deletes

In MongoDB, deleting an assembly required manually deleting ref seqs, then
chunks, then features, then check results, in the correct order. Miss one and
orphaned records accumulate.

In the relational model: `DELETE FROM assembly WHERE _id = 'X'` — the database
automatically deletes all ref seqs, chunks, features, check results, and exports
associated with that assembly. No application code needed.

### Transactions

MongoDB had no multi-document transactions (in the configuration Apollo 3 used).
If an operation failed partway through, partial changes were left behind.

Every operation now runs inside a database transaction. If anything fails, all
changes roll back automatically.

### Multi-database support

The same codebase now supports three database backends:

| Backend | Use case | Setup required |
|---------|----------|---------------|
| **SQLite** | Desktop, development, CI | None — file created automatically |
| **PostgreSQL** | Collaborative server deployments | One container |
| **MongoDB** | Existing deployments (backward compat) | Existing infrastructure |

Switching between backends is a single environment variable (`DB_BACKEND`).

---

## Deployment Comparison

| Metric | MongoDB (before) | PostgreSQL (after) | SQLite (new option) |
|--------|------------------|--------------------|---------------------|
| Containers required | 2 (replica set) | 1 | 0 (in-process) |
| Data volumes | 4 | 1 | 0 (single file) |
| Init scripts needed | Yes (replica set) | No | No |
| Min hosting cost | ~$50-60/mo | ~$5-15/mo | $0 |
| Developer setup | Install + configure MongoDB | `docker compose up` | Run the server |
| CI setup | Service container + init | None needed | None needed |
| Desktop deployment | Not possible | Not practical | Fully supported |
| Backup method | `mongodump` | `pg_dump` | Copy one file |

---

## Performance Fix: Quality Checks on Every Pan/Zoom (20x Speedup)

During the migration, we discovered and fixed a severe performance issue in the
original codebase that was unrelated to MongoDB vs relational — it was a code
architecture problem that had gone unnoticed.

**What was happening:** Every time a user scrolled or zoomed the genome browser,
the frontend asks the server for the genes visible in that region
(`GET /features/getFeatures`). The server's handler for that request was
re-running all quality validation checks on every gene in the response, from
scratch, on every request.

For a region with 1,000 visible genes, each pan or zoom triggered this sequence:

1. Query the database for genes overlapping the visible region
2. **For each of the 1,000 genes**, individually:
   a. Load the gene by ID (1 database query)
   b. Load all of the gene's descendants — transcripts, exons, CDS (1 database
      query)
   c. Reassemble the gene tree in memory
   d. Look up the assembly and check configuration
   e. Delete all previous check results for this gene
   f. Re-run every configured quality check (potentially fetching DNA sequence
      data)
   g. Save the new check results to the database
3. After all checks complete, return the features and check results

**Total per request:** thousands of database queries and expensive computations,
even if nothing had been edited since the last time the user looked at this
region. The check results were already stored in the database from the previous
request — the recomputation was entirely redundant.

**The fix:** Quality checks now run only after someone edits a feature (in the
mutation pipeline, after the database write commits). The GET endpoint simply
returns the pre-computed check results already stored in the database.

**Result:** Feature fetching went from ~74 seconds to ~3.65 seconds for a
dataset with 1,000 genes — a **20x speedup**. This was the single largest
performance improvement discovered during the migration work.

This fix was possible independent of the MongoDB-to-relational migration, but
was discovered during the migration process as part of the systematic
performance review.

---

## Justification Summary

The migration was necessary for six reasons:

1. **Concurrent editing was broken by design.** Two annotators editing different
   exons of the same gene would overwrite each other's work — a consequence of
   the nested document model, not a fixable bug.

2. **Deployment was unnecessarily complex.** MongoDB required a two-container
   replica set (for change streams Apollo 3 didn't use for collaboration).
   PostgreSQL needs one container; SQLite needs none.

3. **Desktop deployment was impossible.** No production-grade embedded MongoDB
   exists. SQLite enables fully self-contained desktop use.

4. **Data integrity was application-enforced.** No foreign keys, no cascade
   deletes, no transactions in MongoDB. The relational model enforces integrity
   at the database level.

5. **The `allIds` bookkeeping was fragile.** Every gene document maintained a
   manual list of all descendant IDs. The relational model makes this
   unnecessary — every feature has its own primary key.

6. **16 MB document size limit.** Highly spliced genes with thousands of exons
   could approach this ceiling. The relational model has no per-record limit.

### What we gained

- Correct concurrent editing — edits to different features never conflict
- Transactional safety — atomic operations with auto-rollback
- CASCADE deletes — one delete cleans up entire hierarchies
- Three deployment targets from one codebase
- Zero-config development — clone and run
- Desktop deployment — fully self-contained with SQLite
- ~80% reduction in hosting costs
- Simpler code — most operations are 5-10 lines instead of 30+

### What we preserved

- MongoDB backward compatibility (existing deployments can stay or migrate)
- Undo/redo (unchanged)
- Real-time collaboration (unchanged)
- All existing features (import, export, search, checks, change tracking)
