# Architecture Overview

## Per-Assembly Storage

Previously, the server maintained a single JBrowse `config.json` document in
the database that described every assembly, every evidence track, and every
search adapter for the entire Apollo3 instance. When an admin added a track or
modified an assembly, the server rewrote this entire document. More importantly,
all users saw the same configuration — there was no mechanism to show different
assemblies or tracks to different users.

We replaced this with a normalized data model where each assembly, evidence
track (BAM, VCF, BigWig, CRAM), BLAST database, and text search adapter is
stored as its own database record. Tracks and BLAST databases are linked to
assemblies through many-to-many relationships, so a single track can appear on
multiple assemblies. The server now generates `config.json` dynamically for each
request, including only the assemblies and tracks that the requesting user has
permission to see.

This means teams can manage their own evidence tracks independently — uploading,
modifying, or removing tracks on their assemblies without admin intervention and
without affecting other assemblies on the same instance.

## Per-Assembly Permissions

Access control operates at two levels. Global roles (`none`, `readOnly`, `user`,
`admin`) set a baseline for what a user can do across the instance. On top of
this, admins can assign per-assembly roles that override the global default for
specific assemblies. Each assembly also has a visibility setting — public
assemblies are visible as read-only to all authenticated users, while private
assemblies are visible only to users with an explicit permission grant.

When a user accesses an assembly, the system resolves their effective role by
checking (in order): global admin status, then per-assembly permission, then
assembly visibility. This allows scenarios like a postdoc having edit access to
their own genome, read-only access to a collaborator's public assembly, and no
access to another lab's private data — all on the same server.

## Analysis Tool Integration

Apollo3 includes a generic server-side analysis framework (`/analysis/`) where
each tool is an independent runner behind a shared job queue and REST API.

**API surface.** Three endpoint groups cover the full workflow:

- `GET /analysis/tools` — list available tools and their parameter schemas
- `GET/POST/DELETE /analysis/databases` — CRUD for tool-specific databases (BLAST indexes, BLAT databases, etc.) and triggering a build job
- `GET/POST /analysis/jobs` — submit a job, poll status, cancel, and retrieve results

**Built-in runners.** Four runners ship by default:

| Runner | Description |
|--------|-------------|
| `local-blast` | blastn/blastp/blastx/tblastn/tblastx against a locally built BLAST database |
| `ncbi-blast` | Same programs forwarded to NCBI's remote BLAST servers |
| `blat` | Fast nucleotide/protein alignment against a local BLAT database |
| `miniprot` | Protein-to-genome alignment via miniprot |

Each runner implements the `AnalysisRunner` interface (submit, poll, cancel,
parse results). Jobs and databases are stored as `AnalysisJobEntity` and
`AnalysisDbEntity` rows with a `tool` field and flexible `params`/`results`
JSON columns, so no schema changes are needed when adding a new tool.

**Frontend.** A tabbed *Sequence Search* page shows one tab per available tool.
Each tab has its own form and results renderer. Admins have a separate *Jobs*
panel for building databases.

**Adding a new tool** requires four steps:

1. Create `runners/my-tool.runner.ts` implementing `AnalysisRunner`
2. Register it in `analysis.module.ts`
3. Inject it in the worker and service constructors
4. Add a results renderer in `sequence-search.tsx` if the output format differs from existing tools

## Summary of Changes

| Change | Before | After |
|--------|--------|-------|
| Assembly/track storage | Single monolithic config document | Individual records with many-to-many relationships |
| Access control | All users see everything | Per-assembly roles with public/private visibility |
| Analysis tools | External tools, manual result transfer | Generic runner framework: local BLAST, NCBI BLAST, BLAT, miniprot |
| Database | MongoDB (replica set required) | SQLite, PostgreSQL, or MongoDB via single codebase |
