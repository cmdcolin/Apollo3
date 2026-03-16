# Apollo3 Architecture Overview

Major architectural shifts for leadership and stakeholders.

## From Monolithic Config to Per-Assembly Storage

**Before**: A single `config.json` document in the database contained every
assembly, track, and adapter. Any change rewrote the entire config. No granular
access control — all or nothing.

**After**: Each assembly, track, BLAST database, and search adapter is its own
database record with explicit many-to-many relationships. `config.json` is
generated dynamically per request, filtered by the user's permissions.

```
AssemblyEntity (one row per genome)
  ├─ visibility: public | private
  ├─ TrackConfigEntity (many-to-many — BAM, VCF, BigWig, CRAM)
  ├─ BlastDbEntity (many-to-many — BLAST databases)
  ├─ TextSearchAdapterConfigEntity (many-to-many)
  ├─ AssemblyPermissionEntity (per-user role on this assembly)
  └─ RefSeqEntity → FeatureEntity (annotations)
```

**Pros**: Multi-team deployments on shared infrastructure. Independent track
management per team. Adding/modifying a track is a single-record operation.

**Con**: Config is generated per request instead of served statically.
Negligible cost in practice.

## Per-Assembly Permissions

Two-layer model:

**Global roles**: `none` (pending) → `readOnly` → `user` (edit) → `admin`

**Per-assembly overrides**: Admin can grant `admin`/`user`/`readOnly` on
individual assemblies. Resolution order:

1. Global admin → full access
2. Per-assembly permission → use that role
3. Assembly is public → read-only
4. Otherwise → 403

**Example**: A postdoc has `user` access to their genome, `readOnly` to a
collaborator's public assembly, no access to another lab's private assembly.

## BLAST Integration

BLAST databases are registered in Apollo3 and linked to assemblies via
many-to-many relationships. Each specifies the program (blastn/blastp/blastx/
tblastn/tblastx) and database path.

Jobs are tracked in the database: `pending` → `running` → `ready`/`failed`/
`cancelled`. Results stored as JSON. The `ncbiRid` field supports NCBI remote
BLAST without local database copies.

**Pros**: Annotators stay in Apollo3 for evidence gathering. Assembly-aware
(users see only relevant databases). Job history per user.

**Con**: Requires BLAST+ installation or NCBI network access.

## Tiberius Gene Prediction

[Tiberius](https://github.com/Gaius-Augustus/Tiberius) runs on-demand for a
user-selected genomic region. Workflow:

1. Annotator rubber-bands a region → "Run Tiberius" from context menu
2. Server extracts sequence → spawns Tiberius (bare process or Singularity)
3. API returns 202; client polls every 3s
4. Server parses GTF output → imports as features via `AddFeatureChange`
5. Predictions appear in browser, immediately editable, with undo/redo

**Pros**: Rapid bootstrapping without genome-wide prediction runs. No external
prediction service needed.

**Cons**: Currently auto-imports (no preview/accept workflow yet). In-memory
job tracking (lost on restart). Singularity-only for containers (no Docker
yet).

**Planned**: Accept/reject workflow, RNA-seq evidence input, Docker support,
GPU config, job persistence in DB.

## Summary

| Shift | Benefit | Cost |
|-------|---------|------|
| Monolithic config → per-assembly records | Fine-grained permissions, independent team management | Config generated per request (negligible) |
| All-or-nothing access → per-assembly roles | Multi-team on shared infrastructure | Admin must assign permissions (API-only for now) |
| No sequence search → integrated BLAST | Annotators stay in tool | Requires BLAST+ or NCBI access |
| No gene prediction → Tiberius integration | On-demand bootstrapping | Requires Tiberius installation |
| MongoDB → SQLite/PostgreSQL/MongoDB | Desktop deployment, simpler ops, lower cost | See [migration tradeoffs](./mikro-orm-migration-justification.md#tradeoffs) |
