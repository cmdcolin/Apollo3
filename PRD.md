# Apollo3 — Project Requirements Document

## Overview

Apollo3 is a collaborative gene annotation editor built on JBrowse 2. The
backend uses MikroORM with multi-database support (SQLite, PostgreSQL, MongoDB).
The repository pattern abstracts the database layer behind interfaces in
`apollo-common`, with implementations in `apollo-entities`.

## Outstanding Issues (Priority Order)

### P1 — Playwright E2E Tests

1. **Playwright test stabilization** — All Cypress tests have been ported to
   Playwright (`pw-tests/`), but some may need timing adjustments:
   - showWarnings: changeInProgress timing issues
   - editFeature: MST addChild failure
   - undo: MST detached node during undo

### P1 — Core Annotation Features (Apollo Classic Parity)

2. **Set Translation Start** — adjusts CDS boundaries based on a
   user-selected start codon position. Needs a position-picking UI.

3. **Attribute/Metadata Editing UI** — Apollo Classic has rich editors for
   dbxrefs, GO terms, gene products, and comments. Apollo3 stores attributes as
   generic key-value pairs but has no dedicated editing UI.
   - Database cross-references (e.g., UniProt, NCBI Gene) with autocomplete
   - GO term annotation with evidence codes (EXP, IDA, ISS, etc.)
   - Gene product names
   - Free-text comments/notes
   - **Files**: new components in
     `packages/jbrowse-plugin-apollo/src/components/`, extend "Edit feature
     details" dialog

### P1 — Security

4. **Authentication security audit** — Review the Passport + JWT cookie auth
   implementation for:
   - JWT secret strength and rotation
   - Cookie security settings (HttpOnly, Secure, SameSite)
   - CSRF protection for cookie-based auth
   - OAuth state parameter validation
   - Token expiration and refresh
   - Guest user role escalation prevention
   - **Files**: `packages/apollo-collaboration-server/src/authentication/`,
     `packages/apollo-collaboration-server/src/utils/strategies/`

### P1 — Performance

5. **Import speed** — Current: ~8s for volvox test data. Breakdown:

- GFF3 parsing + file I/O: ~6s (dominant)
- DB writes: ~2s (already optimized with `insertMany` batching)
- Transaction wrapping gives ~12% speedup on DB writes (WAL+NORMAL config)
- **Investigation needed**: Profile GFF3 parsing to find bottlenecks.

### P1 — Data Integrity

6. **CheckResult JSON array denormalization** — `CheckResultEntity.ids` stores
   feature IDs as a JSON array, queried with `LIKE '%"featureId"%'` + in-memory
   filtering. Risk of false positives (partial ID match) and slow on large
   tables. Longer-term: normalize into a junction table.
   - **Files**:
     `packages/apollo-entities/src/repositories/MikroOrmCheckResultRepository.ts`

### P2 — Simplification

7. **Remove InternetAccount from Apollo plugin** — Phase 2 of the cookie-based
   auth migration. Currently the InternetAccount still exists for websocket
   management and menu registration. Move these to simpler plugin-level code
   that reads role from config and connects websocket directly.
   - **Files**: `packages/jbrowse-plugin-apollo/src/ApolloInternetAccount/`

8. **Remove chunked RefSeqChunk storage** — Apollo3 currently stores reference
   sequences as chunked text blobs in the `ref_seq_chunk` table. This is
   redundant with JBrowse 2's existing sequence adapters (IndexedFastaAdapter,
   BgzipFastaAdapter, etc.) which handle indexed FASTA efficiently. The chunked
   storage adds import time (~6s for FASTA parsing), database bloat, and
   maintenance complexity (chunk size management, assembly sequence source
   types). Instead, always refer to an external indexed FASTA file (or any
   other JBrowse 2 sequence adapter) for sequence data.
   - Remove `RefSeqChunkEntity` and `MikroOrmRefSeqChunkRepository`
   - Remove `refSeqChunk` from `DatabaseService` and `ServerDataStore`
   - Remove chunked FASTA parsing from `FromFileBaseChange`
   - Simplify `Assembly.sequenceSource` to always reference an external adapter
     config (indexed FASTA, bgzip FASTA, or other JBrowse 2 adapter)
   - Update `SequenceService` to always read from the adapter, never from
     chunks
   - Migration script: existing chunked data → export to FASTA file + index
   - **Files**: entity definitions, `FromFileBaseChange`, `SequenceService`,
     `assemblies.service.ts`, `DatabaseService`

9. **Direct flat-row GFF3 export** — The GFF3 export currently reassembles flat
   database rows into nested `AnnotationFeatureSnapshot` trees, then converts
   those trees back to flat GFF3 lines via `annotationFeatureToGFF3`. GFF3 is
   inherently flat — each line is one feature with a `Parent=` attribute. A
   direct `FeatureRow → GFF3 line` conversion would skip the tree assembly step
   entirely.
   - New `featureRowToGFF3Line()` function that maps FeatureRow fields directly
     to GFF3 tab-separated columns (seqid, source, type, start+1, end, score,
     strand, phase, attributes including Parent=)
   - Remove `featureRowToSnapshot` and `buildChildrenMap` from export
   - Stream rows directly from DB → GFF3 lines → file, no in-memory trees
   - **Files**:
     `packages/apollo-collaboration-server/src/export/export.service.ts`, new
     utility in `packages/apollo-shared/src/GFF3/`

### P2 — Database Optimization

10. **Repository instance recreation** — `database.service.ts` getters create a
    new repository instance on every access. Could cache per request scope.
    - **Files**:
      `packages/apollo-collaboration-server/src/mikro-orm/database.service.ts`

### P2 — Collaboration & Workflow

11. **Per-assembly permissions** — Apollo Classic has user/group permissions per
    organism. Apollo3 currently has global roles only (admin/user/readOnly).
    Multi-assembly deployments need per-assembly access control.
    - New `AssemblyPermission` entity: maps user → assembly → role
    - `ValidationGuard` checks per-assembly permissions before changes
    - Admin UI for assigning users to assemblies
    - Fallback: global role applies when no per-assembly permission exists
    - **Files**: new entity in `apollo-entities`, new guard logic in server, new
      admin component in plugin

12. **Feature ownership & audit display** — Apollo Classic tracks who
    created/last edited each feature. Apollo3 stores `user` on entities but
    doesn't expose this in the UI.
    - Display last editor in "Edit feature details" dialog
    - Show creation/modification timestamps
    - Optional: highlight features by ownership in the track display
    - **Files**: plugin "Edit feature details" components

13. **Canned comments/attributes** — Apollo Classic lets admins configure preset
    comment templates and attribute keys/values, speeding up annotation
    significantly.
    - New `CannedElement` entity (type: comment|key|value, text, assembly?)
    - Admin UI for managing canned elements
    - Autocomplete in attribute editing UI (integrates with item 3)
    - **Files**: new entity, new admin component, new API endpoints

### P2 — Export/Import

14. **FASTA export (CDS, protein, transcript sequences)** — Apollo Classic
    exports CDS sequences, protein translations, and genomic sequences. Apollo3
    only exports GFF3 + optional genomic FASTA.
    - Export types: CDS FASTA, protein FASTA, transcript FASTA
    - Protein export requires codon translation using configurable translation
      tables (NCBI tables, default table 1)
    - **Files**: `packages/apollo-collaboration-server/src/export/`, new
      `TranslationService`

15. **Filtered/partial export** — Apollo Classic allows exporting specific
    reference sequences. Apollo3 exports entire assemblies.
    - Filter by: reference sequence(s), feature type(s), coordinate range
    - Frontend: checkboxes/filters in "Download GFF3" dialog
    - **Files**: export controller + frontend DownloadGFF3 component

### P2 — Search & Navigation

16. **Sequence search (BLAT/BLAST integration)** — Apollo Classic has pluggable
    BLAT/BLAST search. Annotators paste a sequence and get genomic hits.
    Essential for evidence-based annotation.
    - Pluggable `SequenceSearchProvider` interface (backend)
    - Default implementation: BLAT via `gfClient`/`gfServer`
    - Frontend: "Sequence Search" dialog, results displayed as track
    - Config: search tool URL/path per assembly
    - **Files**: new module in server, new component in plugin

### P2 — Gene Prediction

17. **Tiberius on-the-fly gene prediction** — Run
    [Tiberius](https://github.com/Gaius-Augustus/Tiberius) on a user-selected
    genomic region to generate de novo gene predictions.

    **TODO — Remaining work**:
    - **Accept/reject workflow**: Currently predictions are auto-imported as
      annotation features on completion. Instead, display them in a preview
      layer and let the user accept/reject individual predictions before
      importing. Requires a results panel UI and a separate display mode for
      unconfirmed predictions.
    - **RNA-seq evidence mode**: If BAM/CRAM alignment tracks are visible, offer
      to include them as evidence for Tiberius. Extract the corresponding BAM
      slice for the selected region and pass to Tiberius's evidence pipeline.
      The 'Save track data' SAM export code in `jbrowse-components` may be
      reusable here.
    - **Docker backend support**: Currently only Singularity and bare-process
      execution are supported. Add Docker as a backend option.
    - **GPU configuration**: Add `gpu: true/false` to tool config. Pass `--nv`
      flag to Singularity or `--gpus all` to Docker when enabled.
    - **Job queue / rate limiting**: Currently no limit on concurrent jobs. Add
      a configurable max-concurrent-jobs setting to prevent GPU contention.
    - **Per-assembly model config**: Allow different Tiberius models per
      assembly (e.g., different species models).
    - **Job persistence**: Jobs are in-memory and lost on server restart. Could
      store job records in the database for durability and history.
    - **E2E test**: Add a Playwright test that mocks Tiberius execution (stub
      GTF output) and verifies the full UI flow: rubber-band → dialog → run →
      features appear.
    - **GTF parser unit tests**: The parser works (verified manually) but the
      server's jest config has PnP issues. Either fix ts-jest PnP resolution or
      move the parser to `apollo-shared` where tests can run.

### P2 — Architecture

18. **PostgreSQL E2E CI pipeline** — E2E script supports PostgreSQL and
    `docker-compose.yml` provides a local PostgreSQL service, but no CI pipeline
    runs tests against PostgreSQL yet.
    - **Action**: Add a CI job that starts PostgreSQL via docker-compose and
      runs unit tests + E2E against it.

19. **MongoDB E2E testing** — `MongoFeatureRepository` exists but has no test
    coverage beyond type-checking. Unit tests run only against SQLite (and
    optionally PostgreSQL).
    - **Action**: Add a MongoDB test configuration and test the
      `MongoFeatureRepository` against a real MongoDB instance.

### P3 — QC & Validation Checks

20. **Reading frame validation check** — Verify CDS features maintain proper
    reading frame across exon boundaries. Phase must be consistent with upstream
    exon lengths.
    - New check in `CheckRegistry`
    - Requires sequence context to compute expected phase per exon
    - **Files**: `packages/apollo-shared/src/Checks/`

21. **Start codon presence check** — Verify CDS features begin with ATG (or
    valid alternative start codons per translation table).
    - New check in `CheckRegistry`
    - Requires reading first 3bp of CDS sequence
    - Respects configurable translation table (some organisms use GTG, TTG)
    - **Files**: `packages/apollo-shared/src/Checks/`

### P3 — Cleanup

22. **Remaining debug logging** — Standard `logger.debug()` calls exist
    throughout the server (features, changes, auth, files controllers). These
    are appropriate debug-level logging and can stay unless noisy.

## Benchmark Results

Import simulation: 3 refSeqs × (100 chunks + 1500 features)

| SQLite Config       | Without TX | With TX | Speedup |
| ------------------- | ---------- | ------- | ------- |
| WAL + NORMAL (prod) | 259ms      | 228ms   | 12%     |
| WAL + FULL          | 231ms      | 212ms   | 8%      |
| DELETE + FULL       | 322ms      | 262ms   | 19%     |

Primary win from transactions is **atomicity** (failed imports roll back
cleanly), not raw speed.

## Architecture Decisions

### Multi-database support

SQLite for development/small deployments, PostgreSQL for production, MongoDB for
existing users. Repository factory pattern selects the correct implementation
based on `DB_BACKEND`:

- SQLite/PostgreSQL → `MikroOrmFeatureRepository` (raw SQL with recursive CTEs)
- MongoDB → `MongoFeatureRepository` (iterative BFS via generic EntityManager)
  All other repositories use the standard `MikroOrm*Repository` implementations
  which work with any MikroORM driver.

### Raw SQL for tree queries

Recursive CTEs (`findDescendants`, `findRootParent`, `deleteDescendants`) use
raw SQL via `em.getConnection().execute()`. Uses `CAST(attributes AS TEXT)` for
LIKE queries on json columns (compatible with both SQLite and PostgreSQL).
MongoDB uses iterative BFS traversal via the generic EntityManager API.

### No `root_id` denormalization (unless proven necessary)

A `root_id` column on `FeatureEntity` has been proposed to enable single-query
gene tree loading. However, this denormalizes the data and introduces a
maintenance burden (must be kept in sync on reparenting). The current recursive
CTE approach is correct and performant for typical workloads. Only add `root_id`
if profiling proves that tree loading is a real bottleneck in production.

### Transactional change execution

All change executions are wrapped in `em.transactional()` which auto-commits on
success and auto-rolls-back on error. RequestContext middleware provides
per-request EM isolation.
