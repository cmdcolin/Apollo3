# Per-Gene History Tracking and Apollo 2 Migration

## The Problem

Apollo3's change log is a **global stream** — every edit is recorded, but
there's no way to query "all edits to gene X" without scanning the entire
change table. Apollo2 had per-gene history via Grails audit logging.

The `changedIds` field stores affected feature IDs as a JSON blob. JSON arrays
can't be efficiently indexed in SQLite, and PostgreSQL JSONB GIN indexes require
database-specific syntax that breaks cross-DB portability.

## The Fix: `gene_id` Column

Add an indexed `gene_id` column to `ChangeEntity`. Each feature change records
its top-level gene's ID (resolved via `findRootParent`).

```sql
SELECT * FROM change WHERE gene_id = ? ORDER BY sequence DESC
```

Standard indexed lookup, works identically in SQLite and PostgreSQL, O(log n).

### Comparison

| Query | Apollo2 | Apollo3 (current) | Apollo3 (proposed) |
|-------|---------|-------------------|-------------------|
| History of gene X | Direct audit table query | Full table scan of JSON | Indexed `WHERE gene_id = ?` |
| Changes by user Y | Scan | Indexed | Same |
| Changes since time T | Scan | Indexed by `sequence` | Same |
| Undo support | Limited (view-only) | Full (`getInverse()`) | Same |

### Implementation

**Phase 1 — Backend:**
1. Add nullable indexed `gene_id` column to `ChangeEntity`
2. Resolve top-level gene in `ChangesService.create()` via `findRootParent`
3. Add `GET /changes?geneId=<id>` endpoint
4. Backfill migration for existing change rows

**Phase 2 — Frontend:**
1. "View History" in gene context menu
2. Timeline display: user, timestamp, human-readable change summary
3. "Undo this change" button (uses existing `getInverse()`)

## Apollo 2 Data Migration

### The problem with GFF3-only migration

Exporting GFF3 from Apollo2 and importing into Apollo3 preserves annotations
but **loses all edit history** — who created/modified each gene, when, and what
previous states were.

### Direct history migration

Map Apollo2 audit records to Apollo3 `ChangeEntity` rows:

| Apollo2 field | Apollo3 mapping |
|--------------|-----------------|
| Audit operation (INSERT/UPDATE/DELETE) | `typeName` (AddFeature/\*/DeleteFeature) |
| User | `user` |
| Timestamp | `createdAt` (preserved) |
| Property changes | `changes` (JSON) |
| Feature → organism/sequence | `assembly` |
| Feature → top-level gene | `gene_id` |

Imported records use a `Apollo2Import:` prefix on `typeName` — viewable but
**not undoable** (no `getInverse()` implementation).

### Combined workflow: Apollo 2 → Apollo 3

1. Export annotations from Apollo2 as GFF3
2. Run history migration script against Apollo2 PostgreSQL
3. Import GFF3 into Apollo3
4. Verify per-gene history shows unified timeline
