# Per-Gene History Tracking

## Background

Apollo3's change log was originally a **global stream** — every edit was
recorded, but there was no way to query "all edits to gene X" without scanning
the entire change table. Apollo2 had per-gene history via Grails audit logging.

The `changedIds` field stores affected feature IDs as a JSON blob. JSON arrays
can't be efficiently indexed in SQLite, and PostgreSQL JSONB GIN indexes require
database-specific syntax that breaks cross-DB portability.

## The Fix: `geneId` Column (Implemented)

An indexed `geneId` column was added to `ChangeEntity`. Each feature change
records its top-level gene's ID (resolved via `findRootParentsOfMany`).

```sql
SELECT * FROM change WHERE gene_id = ? ORDER BY sequence DESC
```

Standard indexed lookup, works identically in SQLite and PostgreSQL, O(log n).

### Comparison

| Query                | Apollo2                  | Apollo3 (before)        | Apollo3 (now)              |
| -------------------- | ------------------------ | ----------------------- | -------------------------- |
| History of gene X    | Direct audit table query | Full table scan of JSON | Indexed `WHERE geneId = ?` |
| Changes by user Y    | Scan                     | Indexed                 | Same                       |
| Changes since time T | Scan                     | Indexed by `sequence`   | Same                       |
| Undo support         | Limited (view-only)      | Full (`getInverse()`)   | Same                       |

### What was implemented

**Phase 1 — Backend + UI (done):**

1. Nullable indexed `geneId` column on `ChangeEntity`
2. `ChangesService.create()` resolves the top-level gene via
   `findRootParentsOfMany()` and stores its `_id` as `geneId`
3. `GET /changes/gene/:geneId?limit=&page=` — paginated per-gene history with
   total count
4. `GET /changes?geneId=<id>` — the generic findAll endpoint also supports
   `geneId` filtering
5. The Recent Changes page (`/ui/changes/`) has a search box to look up history
   by gene/feature ID, with deep-link support via `?geneId=<id>`

### "Backfilling" from existing Apollo 3 MongoDB data

For databases with existing change records, we will have to run a migration
script

## Apollo 2 Data Migration

### The problem with GFF3-only migration

Exporting GFF3 from Apollo2 and importing into Apollo3 preserves annotations but
**loses all edit history** — who created/modified each gene, when, and what
previous states were.

### Direct history migration

Map Apollo2 audit records to Apollo3 `ChangeEntity` rows:

| Apollo2 field                          | Apollo3 mapping                          |
| -------------------------------------- | ---------------------------------------- |
| Audit operation (INSERT/UPDATE/DELETE) | `typeName` (AddFeature/\*/DeleteFeature) |
| User                                   | `user`                                   |
| Timestamp                              | `createdAt` (preserved)                  |
| Property changes                       | `changes` (JSON)                         |
| Feature → organism/sequence            | `assembly`                               |
| Feature → top-level gene               | `geneId`                                 |

Imported records use a `Apollo2Import:` prefix on `typeName` — viewable but
**not undoable** (no `getInverse()` implementation).

### Combined workflow: Apollo 2 → Apollo 3

1. Export annotations from Apollo2 as GFF3
2. Run history migration script against Apollo2 PostgreSQL
3. Import GFF3 into Apollo3
4. Verify per-gene history shows unified timeline
