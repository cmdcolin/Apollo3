# Schema Comparison: MongoDB vs Relational

The schema has the same entities. The key change is **how features are stored**
and **how relationships are enforced**.

## The One Big Change: Feature Storage

### MongoDB: nested documents

```
features collection:

  _id: gene_1
  type: "gene"
  allIds: [gene_1, mRNA_1, exon_1, exon_2, …]  ← manual bookkeeping
  children: {
    mRNA_1: {
      children: {
        exon_1: { type: "exon", min: 1000 … }
        exon_2: { type: "exon", min: 3000 … }
        CDS_1:  { type: "CDS",  min: 1200 … }
      }
    }
  }

```

One record per gene. Every edit loads and saves the whole document. `allIds` must
be manually synced. 16MB document size limit.

### Relational: flat rows with parent references

```
feature table:
+--------------+--------------+------------+-------+-------+
| _id          | parent       | type       | min   | max   |
+--------------+--------------+------------+-------+-------+
| gene_1       | NULL         | gene       | 1000  | 5000  |
| mRNA_1       | gene_1       | mRNA       | 1000  | 5000  |
| exon_1       | mRNA_1       | exon       | 1000  | 1500  |
| exon_2       | mRNA_1       | exon       | 3000  | 3500  |
| CDS_1        | mRNA_1       | CDS        | 1200  | 3400  |
+--------------+--------------+------------+-------+-------+
```

One row per feature. Editing exon_2 touches only that row. No `allIds`. No size
limit. `ON DELETE CASCADE` on parent FK handles child cleanup.

### Practical comparison

| Scenario | MongoDB | Relational |
|----------|---------|------------|
| Edit one exon | Load entire gene, modify, write back | Update one row |
| Two users edit different exons | Second save may overwrite first user's changes | No conflict — separate rows |
| Look up feature by ID | Scan `allIds` arrays | Primary key lookup |
| Delete a gene | One delete (whole doc) | One delete (CASCADE removes children) |
| Large gene (thousands of exons) | May hit 16MB limit | No limit |
| Add/remove child | Update parent's `allIds` + save | Insert/delete one row |

## Relationship Enforcement

MongoDB relies on application code. The relational schema uses foreign keys with
CASCADE delete — the database enforces relationships automatically.

```
AssemblyEntity
  - RefSeqEntity (FK → assembly, CASCADE)
    - FeatureEntity (FK → refSeq, CASCADE; FK → parent, CASCADE)
    - RefSeqChunkEntity (FK → refSeq, CASCADE)
    - CheckResultEntity (FK → refSeq, CASCADE)
  - ExportEntity (FK → assembly, CASCADE)
```

Deleting an assembly: one `DELETE` statement. The database removes all refSeqs,
features, chunks, check results, and exports automatically.

## Unaffected Systems

- Real-time collaboration (WebSockets)
- Undo/redo (TypeScript change classes)
- Change tracking (same audit log structure)
- User management, file handling

## Performance Fix Discovered During Migration

On origin/main, `GET /features/getFeatures` calls `checksService.checkFeature()`
on every feature in the returned range. For each feature and each enabled check,
this deletes all existing check results from the database, re-executes the check
logic (which may involve sequence lookups), and inserts the newly computed results
back. There is a timestamp guard that skips checks whose definition has not
changed since the feature was last modified, but in practice most checks still
run. For a viewport containing 1000 genes, every pan or zoom triggers thousands
of DELETE + compute + INSERT cycles. This change moves check execution to the
mutation pipeline so checks run only after edits, and `GET` returns pre-computed
results. Result: **20x speedup** (74s → 3.65s for 1000 genes).

### Code citations (origin/main)

**features.service.ts** — `findByRange()` calls `checkFeature()` in a loop on
every returned feature:

```typescript
async findByRange(searchDto: FeatureRangeSearchDto) {
  const featureDocs = await this.operationsService
    .executeOperation<GetFeaturesOperation>({ ... })
  for (const featureDoc of featureDocs) {
    await this.checksService.checkFeature(featureDoc)
  }
  const checkResults = await this.checksService.findByRange(searchDto)
  return [featureDocs, checkResults]
}
```

**checks.service.ts** — `checkFeature()` deletes and re-inserts results per
feature per check:

```typescript
async checkFeature(doc: FeatureDocument, checkTimestamps = true) {
  const checks = await this.getChecksForAssembly(doc)
  for (const check of checks) {
    if (checkTimestamps && doc.updatedAt && check.updatedAt < doc.updatedAt) {
      continue
    }
    await this.clearChecksForFeature(doc, check.name)   // DELETE
    const c = checkRegistry.getCheck(check.name)
    const result = await c.checkFeature(flatDoc, ...)    // COMPUTE
    if (result.length > 0) {
      await this.checkResultModel.insertMany(result)     // INSERT
    }
  }
}
```
