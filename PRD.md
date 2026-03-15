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

## Recently Completed — Build & Dev Server Performance

### esbuild migration (build time: 28s → 3s)

The collaboration server build pipeline was migrated from `tsc` to `esbuild`.
Previously, `yarn start` ran two redundant TypeScript compilation passes
(`build:shared` which did a clean rebuild every time, then `tsc -b` for the
server) totaling ~28s before the server even started. The new pipeline uses a
single `esbuild` invocation (`scripts/dev-build.mjs`) that transpiles all five
workspace packages in parallel in ~3s.

**What changed:**

- **`emitDecoratorMetadata` removed.** NestJS uses this TypeScript feature for
  implicit constructor-based dependency injection, but it is incompatible with
  esbuild. All ~50 constructor parameters across controllers, services, guards,
  and strategies now use explicit `@Inject(ServiceClass)` decorators. This is
  the more robust pattern anyway — it makes DI dependencies visible and doesn't
  rely on TypeScript reflection metadata.
- **TypeScript stays at 5.5.** Since esbuild handles all transpilation, `tsc`
  features like `--noCheck` (5.6+) are not needed. Staying on 5.5 avoids MST
  type incompatibilities introduced in TS 5.6+.
- **`scripts/dev-build.mjs`** — single Node.js script that calls esbuild's JS
  API once, building all workspace packages (apollo-common, apollo-entities,
  apollo-mst, apollo-shared, apollo-collaboration-server) in parallel.
- **Graceful shutdown** — added `app.enableShutdownHooks()` to `main.ts`. The
  server now shuts down cleanly on SIGTERM/SIGINT, releasing the port and
  closing database connections. Previously, killing the dev server left the port
  bound, requiring manual cleanup.

**Caveats:**

- **No type checking at dev time.** esbuild strips types without checking them.
  Type errors will only surface when running `yarn tsc -b` explicitly or in CI.
  IDE type checking (via tsconfig) still works normally.
- **No `.d.ts` generation in dev builds.** The esbuild pipeline only emits `.js`
  files. This is fine for running the server but means downstream packages that
  import types from workspace packages rely on IDE resolution of `.ts` source
  files. Production builds (`yarn build`) still use `tsc` for declaration
  generation.
- **esbuild decorator handling.** esbuild supports TypeScript's legacy
  `experimentalDecorators` syntax natively, but does NOT support
  `emitDecoratorMetadata`. If a new NestJS service or controller is added, it
  **must** include explicit `@Inject()` on all constructor parameters. Omitting
  `@Inject()` will cause a runtime DI error (not a build error), so this is easy
  to miss. A linter rule to enforce explicit `@Inject()` would be a good
  addition.

**Build time comparison:**

| Scenario                     | Before                                           | After           |
| ---------------------------- | ------------------------------------------------ | --------------- |
| Clean build (all packages)   | ~28s                                             | ~3s             |
| Incremental (no changes)     | ~28s (no caching — `rimraf dist` on every start) | ~3s             |
| Server startup (NestJS init) | ~6s                                              | ~6s (unchanged) |

## Outstanding Issues (Priority Order)

### P1 — Playwright E2E Tests

1. **Playwright test stabilization** — All Cypress tests have been ported to
   Playwright (`pw-tests/`), but some may need timing adjustments:
   - showWarnings: changeInProgress timing issues
   - editFeature: MST addChild failure
   - undo: MST detached node during undo

### P1 — Developer Experience

1. ~~**Dev server startup speed**~~ — **Done.** Migrated build from `tsc` to
   `esbuild` (28s → 3s). Added graceful shutdown. See "Recently Completed"
   section above for details and caveats.

2. ~~**Demo dev instance with sample data**~~ — **Done.** Pre-built SQLite
   database (`demo-data/demo.sqlite`, 256KB) with two assemblies configured
   using external FASTA references (no sequence/features stored in DB):
   - **volvox** — bgzip FASTA served locally from `test_data/`
   - **hg38** — remote bgzip FASTA from `jbrowse.org`

   Usage: `yarn start-with-demo-data` (or `--no-build` to skip rebuilding).
   Copies the pre-built DB, starts server, assemblies are immediately available.

   To regenerate after schema changes: `bash scripts/regenerate-demo-db.sh`

### P1 — Core Annotation Features (Apollo Classic Parity)

2. **Set Translation Start / Set Longest ORF** — Apollo Classic's most-used
   curation operations.
   - ~~Set Longest ORF~~ — **Done.** `SetCdsBoundsChange` atomically updates CDS
     min/max. `SetLongestOrf` dialog scans all three reading frames of the
     spliced exon sequence, finds the longest ATG→stop ORF, and submits the
     change. Context menu item on transcript features in `GeneGlyph.ts`.
   - **TODO: Set Translation Start** — adjusts CDS boundaries based on a
     user-selected start codon position. Needs a position-picking UI.

3. ~~**Split Transcript**~~ — **Done.** `SplitTranscriptChange` splits a
   transcript at a user-selected exon boundary. Dialog shows all possible split
   points between adjacent exons. Children are partitioned by midpoint (exons,
   CDS, etc. to the left/right of the split point go to the respective new
   transcript). Parent gene bounds are updated. Full undo support via
   `UndoSplitTranscriptChange`. Available in context menu on transcript features
   in both the linear display and tabular editor.
   - Unit tests: 12 tests covering `makeSplitTranscripts`, `toJSON`,
     `getInverse` for both `SplitTranscriptChange` and `UndoSplitTranscriptChange`
     in `packages/apollo-shared/src/Changes/SplitTranscriptChange.test.ts`
   - E2E Playwright tests (3 tests): split at boundary, single-exon error dialog,
     split-then-undo in `packages/jbrowse-plugin-apollo/pw-tests/splitTranscript.test.ts`

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

5. ~~**Non-canonical Splice Site Detection**~~ — **Already implemented.**
   `TranscriptCheck` already detects non-canonical GT/AG splice sites at exon
   boundaries. Added GC as valid 5' splice donor (matching Apollo Classic
   behavior).

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

8. ~~**MongoFeatureRepository integration tests**~~ — **Done.** 21 tests covering
   all BFS traversal methods (`findDescendants`, `findDescendantsOfMany`,
   `deleteDescendants`, `findRootParent`, `findRootParentsOfMany`) and in-memory
   search methods (`searchText`, `findByIndexedId`). Tests run against SQLite
   in-memory (MongoFeatureRepository uses only the generic MikroORM API, so the
   logic is driver-independent). Total: 86 repository tests passing.
   - **Files**: `packages/apollo-entities/src/repositories/mongo-feature-repository.test.ts`

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

15. ~~**ObjectId `.toString()` assumption in frontend**~~ — **Fixed.** Removed
    `.toString()` call on `checkResult._id` in `ApolloInternetAccount/model.ts`.

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

### P2 — Gene Prediction

16. **Tiberius on-the-fly gene prediction** — Run
    [Tiberius](https://github.com/Gaius-Augustus/Tiberius) on a user-selected
    genomic region to generate de novo gene predictions. Tiberius is an
    end-to-end deep learning gene predictor (CNN + biLSTM + differentiable HMM)
    that takes genomic DNA in FASTA format and outputs gene models in GTF.

    **Completed (Phase 1–4)**:
    - [x] Config file system (`apollo-tools.json`) with auto-detection of
          `tiberius.py` and `singularity` on PATH. Configurable via
          `APOLLO_TOOLS_CONFIG` env var.
    - [x] `ToolsConfigModule` + `ToolsConfigService` — loads config, exposes
          `getToolConfig()`, `isToolAvailable()`, `isSingularityAvailable()`
    - [x] `ToolsModule` with three endpoints:
      - `GET /tools/tiberius/available` (ReadOnly) — availability +
        maxRegionSize
      - `POST /tools/tiberius/run` (User) — starts background job, returns 202
      - `GET /tools/tiberius/status/:jobId` (ReadOnly) — poll for status
    - [x] `ToolsService` — full job lifecycle: region validation, sequence
          fetch, temp FASTA, process spawn (with Singularity bind-mount
          support), GTF parsing, feature import via `AddFeatureChange`, temp
          cleanup, timeout handling, process cleanup on shutdown
    - [x] `parseGtf()` — pure function converting Tiberius GTF to
          `AnnotationFeatureSnapshot[]` with coordinate offset (GTF 1-based
          relative → absolute 0-based) and SO type mapping
    - [x] `RunTiberius` dialog — rubber-band menu item ("Run Tiberius gene
          prediction"), shows region info, max size warning, progress spinner,
          polls status every 3s, completion/error display
    - [x] `CollaborationServerDriver` — `checkTiberiusAvailable()`,
          `runTiberius()`, `getTiberiusStatus()` methods

    **Files (implemented)**:
    - `packages/apollo-collaboration-server/src/config/tools-config.service.ts`
    - `packages/apollo-collaboration-server/src/config/tools-config.module.ts`
    - `packages/apollo-collaboration-server/src/tools/tools.module.ts`
    - `packages/apollo-collaboration-server/src/tools/tools.controller.ts`
    - `packages/apollo-collaboration-server/src/tools/tools.service.ts`
    - `packages/apollo-collaboration-server/src/tools/gtf-parser.ts`
    - `packages/jbrowse-plugin-apollo/src/components/RunTiberius.tsx`

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
