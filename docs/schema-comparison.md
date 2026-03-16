# Schema Comparison: MongoDB vs Relational

The schema has the same entities. The key change is **how features are stored**
and **how relationships are enforced**. For the migration rationale, see
[mikro-orm-migration-justification.md](./mikro-orm-migration-justification.md).

## The One Big Change: Feature Storage

### MongoDB: nested documents

```
features collection:
┌──────────────────────────────────────────────┐
│ _id: gene_1                                  │
│ type: "gene"                                 │
│ allIds: [gene_1, mRNA_1, exon_1, exon_2, …]  │  ← manual bookkeeping
│ children: {                                  │
│   mRNA_1: {                                  │
│     children: {                              │
│       exon_1: { type: "exon", min: 1000 … }  │
│       exon_2: { type: "exon", min: 3000 … }  │
│       CDS_1:  { type: "CDS",  min: 1200 … }  │
│     }                                        │
│   }                                          │
│ }                                            │
└──────────────────────────────────────────────┘
```

One record per gene. Every edit loads/saves the whole document. `allIds` must
be manually synced. 16MB document size limit.

### Relational: flat rows with parent references

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

One row per feature. Editing exon_2 touches only that row. No `allIds`. No size
limit. `ON DELETE CASCADE` on parent FK handles child cleanup.

### Practical comparison

| Scenario | MongoDB | Relational |
|----------|---------|------------|
| Edit one exon | Load entire gene, modify, write back | Update one row |
| Two users edit different exons | Second save overwrites first | No conflict — separate rows |
| Look up feature by ID | Scan `allIds` arrays | Primary key lookup |
| Delete a gene | One delete (whole doc) | One delete (CASCADE removes children) |
| Large gene (thousands of exons) | May hit 16MB limit | No limit |
| Add/remove child | Update parent's `allIds` + save | Insert/delete one row |

## Relationship Enforcement

MongoDB relied on application code. The relational schema uses foreign keys with
CASCADE delete — the database enforces relationships automatically.

```
AssemblyEntity
  ├── RefSeqEntity (FK → assembly, CASCADE)
  │     ├── FeatureEntity (FK → refSeq, CASCADE; FK → parent, CASCADE)
  │     ├── RefSeqChunkEntity (FK → refSeq, CASCADE)
  │     └── CheckResultEntity (FK → refSeq, CASCADE)
  └── ExportEntity (FK → assembly, CASCADE)
```

Deleting an assembly: one `DELETE` statement. The database removes all refSeqs,
features, chunks, check results, and exports automatically.

## Unaffected Systems

- Real-time collaboration (WebSockets)
- Undo/redo (TypeScript change classes)
- Change tracking (same audit log structure)
- User management, file handling, quality checks

## Performance Fix Discovered During Migration

Quality checks were re-running on every `GET /features/getFeatures` — thousands
of DB queries per pan/zoom. Moved check execution to the mutation pipeline
(after edits). Result: **20x speedup** (74s → 3.65s for 1000 genes). See
[benchmark-results.md](./benchmark-results.md) for full numbers.
