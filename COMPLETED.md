# Apollo3 — Completed Work

## Sequence Search Polish (sequence-search.tsx)

- Tab order: NCBI BLAST first (most common use case), then local tools
- NCBI BLAST tab: simplified form (removed confusing assembly selector and
  admin-facing preset shortcuts); query label adjusts based on program type
- BLAT form: added query type selector (DNA / Protein)
- BLAST results: collapsible per-hit alignment detail (click row to expand);
  stats header shows program, database, query length, and DB size; organism
  column for nucleotide searches
- BLAT results: "Copy loc" button per hit for deep-linking to genome view
- miniprot results: "Copy loc" button per gene model; "Copy GFF3" button
- NCBI polling: shows RID with direct link to NCBI results page while waiting
- Admin panel: renamed "Add Remote NCBI BLAST Database" to "Add Remote NCBI
  BLAST Preset" with description; tool chip now shows human-readable label

## Core Infrastructure

- Entity definitions using MikroORM v7 `defineEntity` + `p` builders
- Repository interfaces in `apollo-common/src/repositories/`
- SQL repository implementations in `apollo-entities/src/repositories/`
- Raw SQL for performance-critical tree queries (recursive CTEs)
- Unit tests for all repositories (44 tests passing)
- SQL-optimized `searchText` (LIKE + recursive CTE instead of loading all
  features)
- SQL-optimized `findByIndexedId` (LIKE + recursive CTE instead of loading all
  features)
- Import benchmark (see benchmark results in PRD.md)
- Transactional change execution via `em.transactional()`
- Debug logging cleanup (removed `[DEBUG checkFeature]` and `[DEBUG seed]`)
- WAL mode + synchronous=NORMAL SQLite pragmas
- Check seeding on server startup
- RequestContext middleware — per-request EM isolation, no manual fork
- Removed dead code: `UnitOfWork`, `CountersService`,
  `filesService.create/remove` from interface
- Removed `allowGlobalContext: true` — proper RequestContext everywhere
- Desktop driver simplified — `em.transactional()` instead of manual UnitOfWork
- Simple queries migrated from raw SQL to `em.find()`/`em.findOne()` (findAll,
  findById, findByIds, findByRange, findRootsByRange, findChildren)
- PostgreSQL-compatible raw SQL (CAST(attributes AS TEXT) for LIKE on json)
- E2E server script supports `DB_BACKEND=postgresql`
- Dead code cleanup: duplicate `UploadedFile`, `MessagesService`, stub
  `file.entity.ts`, unused `user` field in `CreateFileDto`
- Stale MongoDB comment cleanup
- Per-feature changelog — `GET /changes?changedIds=...` now accepts multiple
  feature IDs; `FeatureChangeLog` dialog opens from any feature's right-click
  context menu in both linear display and tabular editor; collects all IDs in
  the gene's subtree so child-feature changes appear when viewing the parent
  gene
- MongoDB feature repository (`MongoFeatureRepository`) with iterative BFS tree
  traversal — works with any MikroORM driver
- Repository factory pattern — `DatabaseService` selects
  `MikroOrmFeatureRepository` (SQLite/PostgreSQL) or `MongoFeatureRepository`
  (MongoDB) based on `DB_BACKEND` env var
- `DB_BACKEND=mongo` accepted in Joi validation and mikro-orm module
- `docker-compose.yml` with PostgreSQL service for local development/testing
- Migrated all E2E tests from Cypress to Playwright
- Removed Cypress dependency and configuration
- Debug logging cleanup (`[DEBUG ...]` console.log → `logger.debug`)

## Build & Dev Server Performance

### esbuild migration (build time: 28s → 3s)

The collaboration server build pipeline was migrated from `tsc` to `esbuild`.
The new pipeline uses a single `esbuild` invocation (`scripts/dev-build.mjs`)
that transpiles all five workspace packages in parallel in ~3s.

- `emitDecoratorMetadata` removed. All ~50 constructor parameters now use
  explicit `@Inject(ServiceClass)` decorators.
- TypeScript stays at 5.5 to avoid MST type incompatibilities introduced in TS
  5.6+.
- `scripts/dev-build.mjs` — single Node.js script calling esbuild's JS API once.
- Graceful shutdown — added `app.enableShutdownHooks()` to `main.ts`. Server
  shuts down cleanly on SIGTERM/SIGINT.

## Developer Experience

- **Dev server startup speed** — Migrated build from `tsc` to `esbuild` (28s →
  3s). Added graceful shutdown.
- **Demo dev instance with sample data** — Pre-built SQLite database
  (`demo-data/demo.sqlite`, 256KB) with two assemblies configured using external
  FASTA references:
  - **volvox** — bgzip FASTA served locally from `test_data/`
  - **hg38** — remote bgzip FASTA from `jbrowse.org`
  - Usage: `pnpm start-with-demo-data` (or `--no-build` to skip rebuilding)
  - To regenerate after schema changes: `bash scripts/regenerate-demo-db.sh`

## Core Annotation Features

- **Set Longest ORF** — `SetCdsBoundsChange` atomically updates CDS min/max.
  `SetLongestOrf` dialog scans all three reading frames of the spliced exon
  sequence, finds the longest ATG→stop ORF, and submits the change. Context menu
  item on transcript features in `GeneGlyph.ts`.
- **Split Transcript** — `SplitTranscriptChange` splits a transcript at a
  user-selected exon boundary. Dialog shows all possible split points between
  adjacent exons. Children are partitioned by midpoint. Parent gene bounds are
  updated. Full undo support via `UndoSplitTranscriptChange`. Available in
  context menu on transcript features in both the linear display and tabular
  editor.
  - Unit tests: 12 tests in
    `packages/apollo-shared/src/Changes/SplitTranscriptChange.test.ts`
  - E2E Playwright tests (3 tests): split at boundary, single-exon error dialog,
    split-then-undo in
    `packages/jbrowse-plugin-apollo/pw-tests/splitTranscript.test.ts`
- **Non-Canonical Splice Site Detection** — `TranscriptCheck` already detects
  non-canonical GT/AG splice sites at exon boundaries. Added GC as valid 5'
  splice donor (matching Apollo Classic behavior).

## Testing

- **Unit tests for untested repositories** — Added 25 tests covering all 27
  interface methods across `CheckRepository`, `CheckResultRepository`,
  `UserRepository`, and `JBrowseConfigRepository`. Total: 65 repository tests
  passing.
- **MongoFeatureRepository integration tests** — 21 tests covering all BFS
  traversal methods (`findDescendants`, `findDescendantsOfMany`,
  `deleteDescendants`, `findRootParent`, `findRootParentsOfMany`) and in-memory
  search methods (`searchText`, `findByIndexedId`). Total: 86 repository tests
  passing.
  - **Files**:
    `packages/apollo-entities/src/repositories/mongo-feature-repository.test.ts`

## Performance

- **N+1 queries in check execution after mutations** — Fixed. Added
  `findRootParentsOfMany()` (single recursive CTE for SQL, batched upward walk
  for MongoDB) to replace per-ID `findRootParent()` loop. Also batched the
  refName gathering with `findByIds()` + deduplication.
- **N+1 queries in GFF3 export** — Fixed. Export now calls
  `findDescendantsOfMany()` once per refSeq instead of `findDescendants()` per
  root feature.
- **N+1 queries in feature count** — Fixed. Added `countByRangeMultiple()` to
  the repository interface. Uses a single `em.count()` with `$in` filter instead
  of looping per refSeq.
- **O(n^2) tree assembly in export** — Fixed. `featureRowToSnapshot()` now takes
  a pre-built `Map<parentId, children[]>` (O(n) construction) instead of
  filtering the full array per node.
- **Missing indexes** — Fixed. Added indexes on `ChangeEntity.assembly`,
  `ChangeEntity.sequence`, and `FileEntity.checksum`.
- **N+1 in bulk feature lookup** — Fixed. `findByFeatureIds()` now uses
  `findByIds()` for direct lookups and `findRootParentsOfMany()` for top-level
  resolution, replacing per-ID loops.

## Data Integrity

- **Counter race condition** — Fixed. Added `LockMode.PESSIMISTIC_WRITE` to the
  counter read (`SELECT ... FOR UPDATE` in PostgreSQL). Prevents two concurrent
  transactions from reading the same value. No-op on SQLite (writes are
  engine-serialized).
  - **Files**:
    `packages/apollo-entities/src/repositories/MikroOrmCounterRepository.ts`

## Bug Fixes

- **ObjectId `.toString()` assumption in frontend** — Fixed. Removed
  `.toString()` call on `checkResult._id` in `ApolloInternetAccount/model.ts`.

## Security

- **Authentication security audit** — Audit completed, critical issues fixed:
  - Open redirect in OAuth callback — `redirect_uri` now validated against
    configured server `URL` origin
  - Missing `secure` flag on auth cookies — now set in production
  - Session middleware lacked cookie security options — added httpOnly, secure,
    sameSite, maxAge
  - No minimum length for JWT_SECRET/SESSION_SECRET — now requires 32+
    characters
  - OAuth client ID file-read bug — `getLoginTypes()` was using the file path
    instead of file contents (pre-existing bug)
  - Remaining low-risk items: token in OAuth redirect URL (needed for popup auth
    flow); no CSRF middleware (mitigated by SameSite=lax cookies); no refresh
    token mechanism (24h expiry is acceptable)

## Data Integrity

- **CheckResult JSON array denormalization** — Replaced `ids: string[]` JSON
  array with a single indexed `featureId: string` column. Both existing checks
  (CDSCheck, TranscriptCheck) only ever referenced one feature per check result.
  Eliminates LIKE queries, in-memory filtering, and false-positive risk. All
  queries now use direct indexed lookups.

## Database Optimization

- **Repository instance recreation** — Repository instances are now created once
  in the `DatabaseService` constructor and reused. Safe because the injected
  EntityManager uses AsyncLocalStorage (via RequestContext middleware) for
  per-request isolation.

## Simplification

- **Remove chunked RefSeqChunk storage & unify sequence sources** — Sequence
  data is no longer stored in the database. All sequences are referenced by path
  or URL, read on demand via `@gmod/indexedfasta` or `@gmod/twobit`.

  **What was removed:**
  - `RefSeqChunkEntity`, `MikroOrmRefSeqChunkRepository`,
    `RefSeqChunkRepository` interface — deleted entirely
  - `chunkSize` field from `RefSeqRow` and `RefSeqEntity` — vestigial after
    chunk removal
  - Chunk buffering logic from `FromFileBaseChange` (~100 lines)
  - `addRefSeqIntoDb` method — replaced by reading `.fai` for sequence metadata
  - Five `SequenceSource` type variants (`external`, `indexed`, `chunked`,
    `upload-fasta`, `upload-gff3`) — replaced by two
  - File-upload-based sequence storage — FASTA files are no longer uploaded to
    the server; paths are provided instead
  - `fileRepository` and `filesService` from `ServerDataStore` interface — the
    change protocol no longer does file I/O
  - `getDecompressedFileContents`, gzip compression in file storage — files are
    now stored as-is (no automatic gzip on upload)

  **What was added/simplified:**
  - Unified `SequenceSource` type — two variants:
    `{ type: 'fasta'; fa: string; fai: string; gzi?: string }` and
    `{ type: 'twobit'; twobit: string }`. Values are local paths or URLs. The
    server auto-detects local vs remote via protocol prefix.
  - `SequenceService.buildAdapter()` — single method that opens any sequence
    source as the right adapter (`IndexedFasta`, `BgzipIndexedFasta`, or
    `TwoBitFile`) using a unified `openFilehandle()` helper
  - `ExportService` — uses `SequenceService` for FASTA export instead of reading
    chunks or streaming raw files
  - `ServerDataStore` interface — simplified to just repositories + `parseGFF3`
    stream transformer + `pluginsService`. No file I/O.
  - GFF3 annotation import reads from a server-accessible path (`gff3Path`)
    instead of uploading to the file store
  - `AddAssemblyFromFileChange` — collapsed from five handler methods
    (`executeOnServerExternal`, `executeOnServerIndexed`,
    `executeOnServerChunked`, `executeOnServerUploadFasta`,
    `executeOnServerUploadGff3`) to a single `getSequenceSizes()` that works
    with any adapter
  - CLI `add-from-fasta` — simplified from ~160 lines (upload detection, file ID
    management, editable flag) to ~60 lines (just provide paths)
  - CLI `add-from-gff` — now requires separate FASTA+index files via `--fasta`
    flag, matching standard bioinformatics workflows
  - MongoDB migration script updated to skip chunk migration with a warning
  - Added `@gmod/twobit` support for `.2bit` sequence files

- **Remove pending import status** — Removed `status` field from all entities.
  Transactions provide atomicity. Kept `user` field for attribution.
- **Remove InternetAccount from Apollo plugin** — Removed the
  `ApolloInternetAccount` abstraction entirely. The server now includes
  `baseURL`, `role`, and `userId` in the ApolloPlugin configuration returned by
  `config.json`. WebSocket connection and change sequence tracking moved to the
  session model. All API calls use plain `fetch` with
  `credentials: 'same-origin'` (cookie auth). Components read `baseURL`, `role`,
  and `userId` from the plugin config via utility functions. Multi-account
  selection UI removed (single server per deployment).

## Collaboration & Workflow

- **Per-assembly permissions** — `AssemblyPermissionEntity` maps user → assembly
  → role. `PermissionService` checks global admin → per-assembly permission →
  public visibility. Assemblies have `public`/`private` visibility.
  `PermissionsController` provides admin API for managing per-assembly roles.
  Track access follows assembly permissions.

## Export/Import

- **GFF3 export code deduplication** — The export service had its own copy of
  the gene hierarchy assembly logic (`buildChildrenMap` +
  `featureRowToSnapshot`). Replaced with the shared `assembleFeatureTrees()`
  function, removing ~40 lines of duplicate code.

## Generic Analysis Tool Framework

Pluggable analysis runner system where each tool (BLAST, BLAT, Miniprot,
Tiberius, etc.) is a self-contained `AnalysisRunner` implementation. Adding a
new tool requires only creating a runner class and registering it in the module.

- `AnalysisRunner` interface — `tool: string`, `isInstalled()`, `run(context)`,
  optional `buildDb(context)`, optional `getConfig()` for tool-specific metadata
- `AnalysisService` — tool discovery (`getTools()`), database management, job
  submission (`submitJob()`), job monitoring, cancellation
- `AnalysisWorkerService` — background job poller (5s interval), max-concurrent
  enforcement, timeout handling, orphan recovery on startup, abort via
  `AbortController`
- `AnalysisController` — REST API under `/analysis/`:
  - `GET /analysis/tools` — list tools with install status and config
  - `POST /analysis/jobs` — submit job (tool + params)
  - `GET /analysis/jobs/:id` — poll status/results
  - `DELETE /analysis/jobs/:id` — cancel
  - `GET /analysis/jobs/:id/files/:filename` — serve output files
  - Database CRUD endpoints for tool-specific databases
- Generic `AnalysisJobEntity` — `tool` field + JSON
  `params`/`results`/`metadata` columns, no per-tool schema
- Plugin config: `availableAnalysisTools: string[]` array (set by server from
  `getTools()`) replaces per-tool boolean flags
- `isAnalysisToolAvailable(session, toolName)` utility for conditional menu
  items
- `CollaborationServerDriver` — generic `getAnalysisTools()`,
  `submitAnalysisJob()`, `getAnalysisJob()` methods
- Admin jobs page — unified table showing all analysis jobs with tool column

### Registered Runners

- **local-blast** — local BLAST+ via `makeblastdb`/`blastn`/etc.
- **ncbi-blast** — remote NCBI BLAST via REST API
- **blat** — BLAT via `gfClient`/`gfServer`
- **miniprot** — Miniprot protein-to-genome alignment
- **tiberius** — Tiberius de novo gene prediction (see below)

### Tiberius Runner

- Auto-detection of `tiberius.py` via `TIBERIUS_PATH` env var,
  `apollo-tools.json` config file, PATH lookup, or common filesystem locations
- Model config listing from `$TIBERIUS_DIR/model_cfg/*.yaml`
- Region size validation, sequence fetch, temp FASTA, process spawn (with
  optional `--singularity` flag), GTF coordinate rewriting (relative →
  absolute), track config creation
- `RunTiberius` dialog — rubber-band menu item, species model autocomplete,
  Singularity checkbox, progress polling, track display on completion
- **Files**: `analysis/runners/tiberius.runner.ts`, `analysis/gtf-rewriter.ts`,
  `jbrowse-plugin-apollo/src/components/RunTiberius.tsx`
