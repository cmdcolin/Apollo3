# Per-Gene History Tracking and Apollo 2 Migration

This document covers per-gene edit history tracking for Apollo 3 and the plan
for migrating Apollo 2 data (including edit history) into Apollo 3. For the core
migration rationale, see
[mikro-orm-migration-justification.md](./mikro-orm-migration-justification.md).

---

## Why Per-Gene History Matters

Apollo 2 tracked edit history on a per-feature basis using Grails' built-in
audit logging. Each gene had its own history: who changed it, when, and what was
modified. Users could review the complete edit timeline for any individual gene.
This is a feature that Apollo 2 users expect and that Apollo 3 does not yet
provide.

Apollo 3 has a change log — every edit is recorded as a `ChangeEntity` with a
user, timestamp, sequence number, and the full change payload. But the change
log is a **global stream**, not a per-gene index. The current UI
(`ViewChangeLog`) shows all changes for an entire assembly in a flat list. There
is no way to ask "show me all edits to gene X" without scanning the entire
change history.

---

## The Indexing Problem With the Current Schema

Each `ChangeEntity` stores a `changedIds` field — a JSON array of feature IDs
affected by that change. In MikroORM, `@Property({ type: 'json' })` stores the
value as a JSON text blob in the database column. The data is there, but it
cannot be queried efficiently because the database sees it as an opaque string,
not as individual searchable values:

- **SQLite**: There is no way to create a standard B-tree index on values inside
  a JSON text column. Querying "all changes where `changedIds` contains feature
  X" requires the `json_each()` table-valued function, which performs a full
  table scan of the change table for every query.
- **PostgreSQL**: MikroORM's `type: 'json'` maps to a `json` or `jsonb` column.
  JSONB columns can use GIN indexes for containment queries
  (`@> '["featureId"]'`), but this is database-specific syntax that breaks
  portability between SQLite and PostgreSQL — one of the key benefits of the
  MikroORM approach. And even with a GIN index, querying a JSON array is slower
  than a simple indexed column lookup.
- **MongoDB** (for comparison): Array fields can be directly indexed with a
  multikey index, so `changedIds` was actually a reasonable design in Mongo. The
  problem only emerges after moving to a relational database, where arrays are
  not a native column type.

The `changes` field on `ChangeEntity` is also stored as JSON — this is
appropriate because it holds the full change payload (variable structure
depending on change type) and is never queried by content, only read when
displaying a specific change. JSON storage is the right choice for unstructured
payload data. The problem is specifically with `changedIds`, which _needs_ to be
queried but is stored in a format that prevents efficient querying.

For a small annotation project this might not matter. But for a production
deployment with tens of thousands of changes, scanning the entire change table
to find a single gene's history is not acceptable.

---

## The Fix: a `gene_id` Column on the Change Table

Since history tracking is most useful at the gene level — "show me all edits to
this gene, including changes to its transcripts, exons, and CDS features" — the
simplest fix is to add an indexed `gene_id` column directly on `ChangeEntity`.
Every change that affects a feature records the top-level gene's ID (resolved by
walking up the parent chain via the existing `findRootParent` method).

```
| Table  | New column                        |
|--------|-----------------------------------|
| change | gene_id (FK to feature, indexed)  |
```

The query "all changes to gene X" becomes:

```sql
SELECT * FROM change WHERE gene_id = ? ORDER BY sequence DESC
```

This is a simple indexed lookup that works identically in SQLite and PostgreSQL
with no database-specific syntax. It scales to millions of changes with
sub-millisecond lookup times.

The `changedIds` JSON column on `ChangeEntity` can be dropped entirely — the
`gene_id` column replaces it for the per-gene query path. (For changes that
affect multiple genes — rare but possible with operations like assembly-level
imports — a separate `change_gene` junction table could handle the overflow
case, but for the vast majority of changes, a single `gene_id` is sufficient.)

---

## Comparison: Apollo 2 vs. Apollo 3 History Models

| Aspect                        | Apollo 2                                           | Apollo 3 (current)                                            | Apollo 3 (proposed)                                |
| ----------------------------- | -------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------- |
| Storage model                 | Per-feature audit table (Grails `auditable`)       | Global change stream with JSON `changedIds` array             | Global change stream with indexed `gene_id` column |
| "History of gene X" query     | Direct — query the audit table for that feature    | Full table scan of all changes, filter by JSON array contents | Indexed lookup: `WHERE gene_id = ?` — O(log n)     |
| "All changes by user Y" query | Scan audit table                                   | Indexed (if `user` column is indexed)                         | Same                                               |
| "Changes since time T" query  | Scan audit table                                   | Indexed by `sequence`                                         | Same                                               |
| Undo/redo support             | Limited — audit records were primarily for viewing | Full — every change has `getInverse()` for programmatic undo  | Same                                               |
| Works in SQLite               | N/A (Apollo 2 used PostgreSQL)                     | Yes, but per-gene queries are unindexed                       | Yes, fully indexed                                 |
| Works in PostgreSQL           | Yes                                                | Yes, but requires JSONB-specific syntax for per-gene queries  | Yes, standard SQL                                  |

The proposed model is strictly better than both: it preserves Apollo 3's
operation-centric change log (which supports undo/redo and multi-feature
changes) while adding the per-gene queryability that Apollo 2 had.

---

## Per-Gene History Viewer

With the `gene_id` column in place, a per-gene history viewer becomes
straightforward. The UI would:

1. Accept a gene ID (from a right-click context menu on a gene, or from the
   feature detail panel)
2. Query `GET /changes?geneId=<id>` — using the indexed `gene_id` column
3. Display a timeline of changes: who changed it, when, what type of change
   (coordinate edit, type change, child added/removed, etc.)
4. For each change, show a human-readable summary rather than raw JSON — e.g.,
   "User alice@example.com moved exon start from 1000 to 1050" instead of a
   `LocationStartChange` JSON blob
5. Optionally allow undo of individual changes from the history view (the
   `getInverse()` infrastructure already supports this)

This covers the primary use case: a curator right-clicks a gene and sees
everything that has ever happened to it — edits to the gene itself, its
transcripts, its exons, and its CDS features — all in one timeline.

---

## Implementation Plan for Per-Gene History

### Phase 1 — Schema and backend (required first)

1. Add `gene_id` column (nullable, indexed) to `ChangeEntity` — nullable because
   some changes (e.g., `AddAssemblyChange`, `UserChange`) are not gene-specific
2. Update `ChangesService.create()` to resolve the top-level gene ID when
   persisting a feature change. The `changedIds` already contain the affected
   feature IDs; walk up the parent chain via `findRootParent` to resolve each to
   its top-level gene, and set `gene_id` accordingly
3. Add `findByGeneId(geneId)` method to `ChangeRepository`
4. Add `GET /changes?geneId=<id>` query parameter to `ChangesController`
5. Write a backfill migration that reads existing `changedIds` JSON from all
   `ChangeEntity` rows, resolves each to its top-level gene, and populates the
   `gene_id` column for historical data

### Phase 2 — Frontend history viewer

1. Add "View History" option to the gene context menu (right-click on a gene in
   the track or feature detail panel)
2. Create a `GeneHistory` component that fetches and displays the change
   timeline for a gene
3. Render each change as a human-readable summary (map `typeName` + `changes`
   JSON → descriptive text)
4. Show user, timestamp, and change type for each entry
5. Add an "Undo this change" button that calls the existing `getInverse()`
   mechanism

---

## Migrating Apollo 2 Data and History to Apollo 3

### The problem with GFF3-only migration

The simplest path from Apollo 2 to Apollo 3 is to export annotations as GFF3
from Apollo 2 and import them into Apollo 3. This preserves the biological
annotation data but **loses all edit history**: who created each gene, who
modified it, when changes were made, and what the previous states were. For
research groups that rely on this audit trail for accountability and
reproducibility, this is not acceptable.

### Direct history migration from Apollo 2

Apollo 2 stores its edit history in a PostgreSQL audit table (via Grails'
`auditable` domain class feature). Each audit record contains the feature ID,
the user, the timestamp, and the property changes. This data can be migrated
into Apollo 3's change log.

**Migration approach:**

1. **Connect to the Apollo 2 PostgreSQL database** and read the audit log table
   alongside the feature table
2. **Map Apollo 2 audit records to Apollo 3 `ChangeEntity` rows**:
   - `typeName`: Map from the audit operation (INSERT → `AddFeatureChange`,
     UPDATE → the appropriate change type based on which property changed,
     DELETE → `DeleteFeatureChange`)
   - `user`: Map from the Apollo 2 user who made the change
   - `createdAt`: Preserve the original timestamp
   - `changes`: Store the Apollo 2 audit details as JSON (old value, new value,
     property name)
   - `assembly`: Determine from the feature's sequence/organism in Apollo 2
   - `gene_id`: Resolve the affected feature to its top-level gene in the Apollo
     3 feature table
3. **Mark imported records** with a distinguishing `typeName` prefix (e.g.,
   `Apollo2Import:LocationChange`) so the UI can display them appropriately —
   these are viewable history entries but are **not undoable** since they don't
   have Apollo 3 `getInverse()` implementations

**What is preserved:**

- Complete per-gene edit timeline (who, when, what)
- Original Apollo 2 timestamps (the history appears in the correct chronological
  position)
- User attribution

**What is not preserved:**

- Exact undo capability (Apollo 2 audit records don't map to Apollo 3's
  invertible change classes)
- The original Apollo 2 UI representation of changes

This is the right tradeoff: the audit trail is preserved for accountability and
review, which is what users care about. The inability to programmatically undo a
change from three years ago in Apollo 2 is not a practical loss.

### Migration script outline

The migration script would be an extension of the existing
`migrate-mongo-to-mikroorm.ts` script (or a companion script), structured as:

```
1. Connect to Apollo 2 PostgreSQL database
2. Read the feature_audit_log (or equivalent Grails audit table)
3. For each audit record:
   a. Map to a ChangeEntity row with appropriate typeName and metadata
   b. Resolve the affected feature to its top-level gene and set gene_id
   c. Assign sequence numbers that place Apollo 2 history before Apollo 3 history
4. Insert in batches (same pattern as the existing MongoDB migration script)
5. Report statistics: N audit records migrated, M genes with history
```

### Combined migration workflow for Apollo 2 → Apollo 3

For an existing Apollo 2 deployment migrating to Apollo 3:

1. **Export annotations from Apollo 2 as GFF3** (preserves current annotation
   state)
2. **Run the history migration script** against the Apollo 2 PostgreSQL database
   (preserves edit history)
3. **Import GFF3 into Apollo 3** (creates the current feature state)
4. **Verify** that per-gene history shows both the imported Apollo 2 history and
   any new Apollo 3 edits in a unified timeline

This gives users a seamless transition: their annotations are in Apollo 3, their
history is preserved, and new edits continue to be tracked in the same system.
