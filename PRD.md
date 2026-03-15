# Apollo3 — Project Requirements Document

## Overview

Apollo3 is a collaborative gene annotation editor built on JBrowse 2. The
backend uses MikroORM with multi-database support (SQLite, PostgreSQL, MongoDB).
The repository pattern abstracts the database layer behind interfaces in
`apollo-common`, with implementations in `apollo-entities`.

## Completed

- [x] Entity definitions using MikroORM v7 `defineEntity` + `p` builders
- [x] Repository interfaces in `apollo-common/src/repositories/`
- [x] SQL repository implementations in `apollo-entities/src/repositories/`
- [x] Raw SQL for performance-critical tree queries (recursive CTEs)
- [x] Unit tests for all repositories (44 tests passing)
- [x] SQL-optimized `searchText` (LIKE + recursive CTE instead of loading all
      features)
- [x] SQL-optimized `findByIndexedId` (LIKE + recursive CTE instead of loading
      all features)
- [x] Import benchmark (see benchmark results below)
- [x] Transactional change execution via `em.transactional()`
- [x] Debug logging cleanup (removed `[DEBUG checkFeature]` and `[DEBUG seed]`)
- [x] WAL mode + synchronous=NORMAL SQLite pragmas
- [x] Check seeding on server startup
- [x] RequestContext middleware — per-request EM isolation, no manual fork
- [x] Removed dead code: `UnitOfWork`, `CountersService`,
      `filesService.create/remove` from interface
- [x] Removed `allowGlobalContext: true` — proper RequestContext everywhere
- [x] Desktop driver simplified — `em.transactional()` instead of manual
      UnitOfWork
- [x] Simple queries migrated from raw SQL to `em.find()`/`em.findOne()`
      (findAll, findById, findByIds, findByRange, findRootsByRange,
      findChildren)
- [x] PostgreSQL-compatible raw SQL (CAST(attributes AS TEXT) for LIKE on json)
- [x] E2E server script supports `DB_BACKEND=postgresql`
- [x] Dead code cleanup: duplicate `UploadedFile`, `MessagesService`, stub
      `file.entity.ts`, unused `user` field in `CreateFileDto`
- [x] Stale MongoDB comment cleanup
- [x] MongoDB feature repository (`MongoFeatureRepository`) with iterative BFS
      tree traversal — works with any MikroORM driver
- [x] Repository factory pattern — `DatabaseService` selects
      `MikroOrmFeatureRepository` (SQLite/PostgreSQL) or
      `MongoFeatureRepository` (MongoDB) based on `DB_BACKEND` env var
- [x] `DB_BACKEND=mongo` accepted in Joi validation and mikro-orm module
- [x] `docker-compose.yml` with PostgreSQL service for local development/testing
- [x] Migrated all E2E tests from Cypress to Playwright
- [x] Removed Cypress dependency and configuration
- [x] Debug logging cleanup (`[DEBUG ...]` console.log → `logger.debug`)

## Outstanding Issues (Priority Order)

### P1 — Playwright E2E Tests

1. **Playwright test stabilization** — All Cypress tests have been ported to
   Playwright (`pw-tests/`), but some may need timing adjustments:
   - showWarnings: changeInProgress timing issues
   - editFeature: MST addChild failure
   - undo: MST detached node during undo

### P1 — Core Annotation Features (Apollo Classic Parity)

2. **Set Translation Start / Set Longest ORF** — Apollo Classic's most-used
   curation operations. Annotators need to set the translation start site and
   auto-calculate the longest open reading frame.

   - New `SetTranslationStartChange`: adjusts CDS boundaries based on a selected
     start codon position
   - New `SetLongestOrfChange`: scans transcript sequence, picks longest reading
     frame, sets CDS boundaries accordingly
   - Requires sequence retrieval during change execution (use existing
     `SequenceService`)
   - Frontend: right-click menu items on CDS/transcript features
   - **Files**: `packages/apollo-shared/src/Changes/`, server `ChangesService`,
     plugin `glyphUtils.ts` (context menu)

3. **Split Transcript** — Apollo Classic supports splitting a transcript into
   two independent transcripts. Apollo3 has `MergeTranscriptsChange` but no
   inverse split operation.

   - New `SplitTranscriptChange`: given a transcript and a split point, creates
     two new transcripts partitioning the child exons/CDSs
   - Exons spanning the split point should be assigned to whichever side
     contains the majority, or duplicated and trimmed
   - Frontend: right-click menu on transcript features
   - **Files**: `packages/apollo-shared/src/Changes/`, plugin context menu

4. **Attribute/Metadata Editing UI** — Apollo Classic has rich editors for
   dbxrefs, GO terms, gene products, and comments. Apollo3 stores attributes as
   generic key-value pairs but has no dedicated editing UI.

   - Database cross-references (e.g., UniProt, NCBI Gene) with autocomplete
   - GO term annotation with evidence codes (EXP, IDA, ISS, etc.)
   - Gene product names
   - Free-text comments/notes
   - **Files**: new components in
     `packages/jbrowse-plugin-apollo/src/components/`, extend "Edit feature
     details" dialog

5. **Non-canonical Splice Site Detection** — Apollo Classic detects GT/AG (and
   GC) splice donor/acceptor sites. Core QC check for gene annotators.
   - New check type registered in `CheckRegistry`
   - Requires reading sequence at exon boundaries (2bp upstream donor, 2bp
     downstream acceptor)
   - Report non-canonical sites as warnings (not errors — some are valid)
   - **Files**: `packages/apollo-shared/src/Checks/`, server check seeding

### P1 — Security

6. **Authentication security audit** — Review the Passport + JWT cookie auth
   implementation for:
   - JWT secret strength and rotation
   - Cookie security settings (HttpOnly, Secure, SameSite)
   - CSRF protection for cookie-based auth
   - OAuth state parameter validation
   - Token expiration and refresh
   - Guest user role escalation prevention
   - **Files**: `packages/apollo-collaboration-server/src/authentication/`,
     `packages/apollo-collaboration-server/src/utils/strategies/`

### P1 — Testing

7. ~~**Unit tests for untested repositories**~~ — **Done.** Added 25 tests
   covering all 27 interface methods across `CheckRepository`,
   `CheckResultRepository`, `UserRepository`, and `JBrowseConfigRepository`.
   Total: 65 repository tests passing.

8. **MongoFeatureRepository integration tests** — The MongoDB feature repository
   has no tests. Tree traversal (iterative BFS) and text search (in-memory
   filtering) are completely untested.
   - Use `mongodb-memory-server` or a Docker-based MongoDB instance
   - Run the same feature repository test suite against MongoDB
   - **Files**: new test file in `packages/apollo-entities/src/repositories/`

### P1 — Performance

8. ~~**N+1 queries in check execution after mutations**~~ — **Fixed.** Added
   `findRootParentsOfMany()` (single recursive CTE for SQL, batched upward walk
   for MongoDB) to replace per-ID `findRootParent()` loop. Also batched the
   refName gathering with `findByIds()` + deduplication.

9. ~~**N+1 queries in GFF3 export**~~ — **Fixed.** Export now calls
   `findDescendantsOfMany()` once per refSeq instead of `findDescendants()` per
   root feature.

10. ~~**N+1 queries in feature count**~~ — **Fixed.** Added
    `countByRangeMultiple()` to the repository interface. Uses a single
    `em.count()` with `$in` filter instead of looping per refSeq.

11. ~~**O(n^2) tree assembly in export**~~ — **Fixed.** `featureRowToSnapshot()`
    now takes a pre-built `Map<parentId, children[]>` (O(n) construction)
    instead of filtering the full array per node.

12. **Import speed** — Current: ~8s for volvox test data. Breakdown:

- GFF3 parsing + file I/O: ~6s (dominant)
- DB writes: ~2s (already optimized with `insertMany` batching)
- Transaction wrapping gives ~12% speedup on DB writes (WAL+NORMAL config)
- **Investigation needed**: Profile GFF3 parsing to find bottlenecks.

### P1 — Data Integrity

13. ~~**Counter race condition**~~ — **Fixed.** Added
    `LockMode.PESSIMISTIC_WRITE` to the counter read (`SELECT ... FOR UPDATE` in
    PostgreSQL). Prevents two concurrent transactions from reading the same
    value. No-op on SQLite (writes are engine-serialized).

    - **Files**:
      `packages/apollo-entities/src/repositories/MikroOrmCounterRepository.ts`

14. **CheckResult JSON array denormalization** — `CheckResultEntity.ids` stores
    feature IDs as a JSON array, queried with `LIKE '%"featureId"%'` + in-memory
    filtering. Risk of false positives (partial ID match) and slow on large
    tables. Longer-term: normalize into a junction table.
    - **Files**:
      `packages/apollo-entities/src/repositories/MikroOrmCheckResultRepository.ts`

### P1 — Bug Fixes

15. **ObjectId `.toString()` assumption in frontend** —
    `ApolloInternetAccount/model.ts:336` calls `.toString()` on
    `checkResult._id`, a MongoDB ObjectId assumption. With SQL backends, `_id`
    is already a string and `.toString()` is harmless but misleading. Remove the
    call for clarity and correctness.

- **File**: `packages/jbrowse-plugin-apollo/src/ApolloInternetAccount/model.ts`

### P2 — Simplification

16. ~~**Remove pending import status**~~ — DONE. Removed `status` field from all
    entities. Transactions provide atomicity. Kept `user` field for attribution.

17. **Remove InternetAccount from Apollo plugin** — Phase 2 of the cookie-based
    auth migration. Currently the InternetAccount still exists for websocket
    management and menu registration. Move these to simpler plugin-level code
    that reads role from config and connects websocket directly.

    - **Files**: `packages/jbrowse-plugin-apollo/src/ApolloInternetAccount/`

18. **Remove chunked RefSeqChunk storage** — Apollo3 currently stores reference
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

19. **Direct flat-row GFF3 export** — The GFF3 export currently reassembles flat
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

~~16.~~ ~~**Missing indexes**~~ — **Fixed.** Added indexes on
`ChangeEntity.assembly`, `ChangeEntity.sequence`, and `FileEntity.checksum`.

~~17.~~ ~~**N+1 in bulk feature lookup**~~ — **Fixed.** `findByFeatureIds()` now
uses `findByIds()` for direct lookups and `findRootParentsOfMany()` for
top-level resolution, replacing per-ID loops.

18. **Repository instance recreation** — `database.service.ts` getters create a
    new repository instance on every access. Could cache per request scope.
    - **Files**:
      `packages/apollo-collaboration-server/src/mikro-orm/database.service.ts`

### P2 — Collaboration & Workflow

19. **Per-assembly permissions** — Apollo Classic has user/group permissions per
    organism. Apollo3 currently has global roles only (admin/user/readOnly).
    Multi-assembly deployments need per-assembly access control.

    - New `AssemblyPermission` entity: maps user → assembly → role
    - `ValidationGuard` checks per-assembly permissions before changes
    - Admin UI for assigning users to assemblies
    - Fallback: global role applies when no per-assembly permission exists
    - **Files**: new entity in `apollo-entities`, new guard logic in server, new
      admin component in plugin

20. **Feature ownership & audit display** — Apollo Classic tracks who
    created/last edited each feature. Apollo3 stores `user` on entities but
    doesn't expose this in the UI.

    - Display last editor in "Edit feature details" dialog
    - Show creation/modification timestamps
    - Optional: highlight features by ownership in the track display
    - **Files**: plugin "Edit feature details" components

21. **Canned comments/attributes** — Apollo Classic lets admins configure preset
    comment templates and attribute keys/values, speeding up annotation
    significantly.
    - New `CannedElement` entity (type: comment|key|value, text, assembly?)
    - Admin UI for managing canned elements
    - Autocomplete in attribute editing UI (integrates with item 4)
    - **Files**: new entity, new admin component, new API endpoints

### P2 — Export/Import

13. **FASTA export (CDS, protein, transcript sequences)** — Apollo Classic
    exports CDS sequences, protein translations, and genomic sequences. Apollo3
    only exports GFF3 + optional genomic FASTA.

    - Export types: CDS FASTA, protein FASTA, transcript FASTA
    - Protein export requires codon translation using configurable translation
      tables (NCBI tables, default table 1)
    - **Files**: `packages/apollo-collaboration-server/src/export/`, new
      `TranslationService`

14. **Filtered/partial export** — Apollo Classic allows exporting specific
    reference sequences. Apollo3 exports entire assemblies.
    - Filter by: reference sequence(s), feature type(s), coordinate range
    - Frontend: checkboxes/filters in "Download GFF3" dialog
    - **Files**: export controller + frontend DownloadGFF3 component

### P2 — Search & Navigation

15. **Sequence search (BLAT/BLAST integration)** — Apollo Classic has pluggable
    BLAT/BLAST search. Annotators paste a sequence and get genomic hits.
    Essential for evidence-based annotation.
    - Pluggable `SequenceSearchProvider` interface (backend)
    - Default implementation: BLAT via `gfClient`/`gfServer`
    - Frontend: "Sequence Search" dialog, results displayed as track
    - Config: search tool URL/path per assembly
    - **Files**: new module in server, new component in plugin

### P2 — Architecture

16. **PostgreSQL E2E CI pipeline** — E2E script supports PostgreSQL and
    `docker-compose.yml` provides a local PostgreSQL service, but no CI pipeline
    runs tests against PostgreSQL yet.

    - **Action**: Add a CI job that starts PostgreSQL via docker-compose and
      runs unit tests + E2E against it.

17. **MongoDB E2E testing** — `MongoFeatureRepository` exists but has no test
    coverage beyond type-checking. Unit tests run only against SQLite (and
    optionally PostgreSQL).
    - **Action**: Add a MongoDB test configuration and test the
      `MongoFeatureRepository` against a real MongoDB instance.

### P3 — QC & Validation Checks

18. **Reading frame validation check** — Verify CDS features maintain proper
    reading frame across exon boundaries. Phase must be consistent with upstream
    exon lengths.

    - New check in `CheckRegistry`
    - Requires sequence context to compute expected phase per exon
    - **Files**: `packages/apollo-shared/src/Checks/`

19. **Start codon presence check** — Verify CDS features begin with ATG (or
    valid alternative start codons per translation table).
    - New check in `CheckRegistry`
    - Requires reading first 3bp of CDS sequence
    - Respects configurable translation table (some organisms use GTG, TTG)
    - **Files**: `packages/apollo-shared/src/Checks/`

### P3 — Cleanup

20. **Remaining debug logging** — Standard `logger.debug()` calls exist
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

### Status field convention

- `status: -1` = temporary (pending activation after import)
- `status: 0` = active
- `activateByUser(user)` flips -1 → 0 for a specific user's records
