# Apollo3 — Completed Work

## Core Infrastructure

- Entity definitions using MikroORM v7 `defineEntity` + `p` builders
- Repository interfaces in `apollo-common/src/repositories/`
- SQL repository implementations in `apollo-entities/src/repositories/`
- Raw SQL for performance-critical tree queries (recursive CTEs)
- Unit tests for all repositories (44 tests passing)
- SQL-optimized `searchText` (LIKE + recursive CTE instead of loading all features)
- SQL-optimized `findByIndexedId` (LIKE + recursive CTE instead of loading all features)
- Import benchmark (see benchmark results in PRD.md)
- Transactional change execution via `em.transactional()`
- Debug logging cleanup (removed `[DEBUG checkFeature]` and `[DEBUG seed]`)
- WAL mode + synchronous=NORMAL SQLite pragmas
- Check seeding on server startup
- RequestContext middleware — per-request EM isolation, no manual fork
- Removed dead code: `UnitOfWork`, `CountersService`, `filesService.create/remove` from interface
- Removed `allowGlobalContext: true` — proper RequestContext everywhere
- Desktop driver simplified — `em.transactional()` instead of manual UnitOfWork
- Simple queries migrated from raw SQL to `em.find()`/`em.findOne()` (findAll, findById, findByIds, findByRange, findRootsByRange, findChildren)
- PostgreSQL-compatible raw SQL (CAST(attributes AS TEXT) for LIKE on json)
- E2E server script supports `DB_BACKEND=postgresql`
- Dead code cleanup: duplicate `UploadedFile`, `MessagesService`, stub `file.entity.ts`, unused `user` field in `CreateFileDto`
- Stale MongoDB comment cleanup
- Per-feature changelog — `GET /changes?changedIds=...` now accepts multiple feature IDs; `FeatureChangeLog` dialog opens from any feature's right-click context menu in both linear display and tabular editor; collects all IDs in the gene's subtree so child-feature changes appear when viewing the parent gene
- MongoDB feature repository (`MongoFeatureRepository`) with iterative BFS tree traversal — works with any MikroORM driver
- Repository factory pattern — `DatabaseService` selects `MikroOrmFeatureRepository` (SQLite/PostgreSQL) or `MongoFeatureRepository` (MongoDB) based on `DB_BACKEND` env var
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

- `emitDecoratorMetadata` removed. All ~50 constructor parameters now use explicit `@Inject(ServiceClass)` decorators.
- TypeScript stays at 5.5 to avoid MST type incompatibilities introduced in TS 5.6+.
- `scripts/dev-build.mjs` — single Node.js script calling esbuild's JS API once.
- Graceful shutdown — added `app.enableShutdownHooks()` to `main.ts`. Server shuts down cleanly on SIGTERM/SIGINT.

## Developer Experience

- **Dev server startup speed** — Migrated build from `tsc` to `esbuild` (28s → 3s). Added graceful shutdown.
- **Demo dev instance with sample data** — Pre-built SQLite database (`demo-data/demo.sqlite`, 256KB) with two assemblies configured using external FASTA references:
  - **volvox** — bgzip FASTA served locally from `test_data/`
  - **hg38** — remote bgzip FASTA from `jbrowse.org`
  - Usage: `yarn start-with-demo-data` (or `--no-build` to skip rebuilding)
  - To regenerate after schema changes: `bash scripts/regenerate-demo-db.sh`

## Core Annotation Features

- **Set Longest ORF** — `SetCdsBoundsChange` atomically updates CDS min/max. `SetLongestOrf` dialog scans all three reading frames of the spliced exon sequence, finds the longest ATG→stop ORF, and submits the change. Context menu item on transcript features in `GeneGlyph.ts`.
- **Split Transcript** — `SplitTranscriptChange` splits a transcript at a user-selected exon boundary. Dialog shows all possible split points between adjacent exons. Children are partitioned by midpoint. Parent gene bounds are updated. Full undo support via `UndoSplitTranscriptChange`. Available in context menu on transcript features in both the linear display and tabular editor.
  - Unit tests: 12 tests in `packages/apollo-shared/src/Changes/SplitTranscriptChange.test.ts`
  - E2E Playwright tests (3 tests): split at boundary, single-exon error dialog, split-then-undo in `packages/jbrowse-plugin-apollo/pw-tests/splitTranscript.test.ts`
- **Non-Canonical Splice Site Detection** — `TranscriptCheck` already detects non-canonical GT/AG splice sites at exon boundaries. Added GC as valid 5' splice donor (matching Apollo Classic behavior).

## Testing

- **Unit tests for untested repositories** — Added 25 tests covering all 27 interface methods across `CheckRepository`, `CheckResultRepository`, `UserRepository`, and `JBrowseConfigRepository`. Total: 65 repository tests passing.
- **MongoFeatureRepository integration tests** — 21 tests covering all BFS traversal methods (`findDescendants`, `findDescendantsOfMany`, `deleteDescendants`, `findRootParent`, `findRootParentsOfMany`) and in-memory search methods (`searchText`, `findByIndexedId`). Total: 86 repository tests passing.
  - **Files**: `packages/apollo-entities/src/repositories/mongo-feature-repository.test.ts`

## Performance

- **N+1 queries in check execution after mutations** — Fixed. Added `findRootParentsOfMany()` (single recursive CTE for SQL, batched upward walk for MongoDB) to replace per-ID `findRootParent()` loop. Also batched the refName gathering with `findByIds()` + deduplication.
- **N+1 queries in GFF3 export** — Fixed. Export now calls `findDescendantsOfMany()` once per refSeq instead of `findDescendants()` per root feature.
- **N+1 queries in feature count** — Fixed. Added `countByRangeMultiple()` to the repository interface. Uses a single `em.count()` with `$in` filter instead of looping per refSeq.
- **O(n^2) tree assembly in export** — Fixed. `featureRowToSnapshot()` now takes a pre-built `Map<parentId, children[]>` (O(n) construction) instead of filtering the full array per node.
- **Missing indexes** — Fixed. Added indexes on `ChangeEntity.assembly`, `ChangeEntity.sequence`, and `FileEntity.checksum`.
- **N+1 in bulk feature lookup** — Fixed. `findByFeatureIds()` now uses `findByIds()` for direct lookups and `findRootParentsOfMany()` for top-level resolution, replacing per-ID loops.

## Data Integrity

- **Counter race condition** — Fixed. Added `LockMode.PESSIMISTIC_WRITE` to the counter read (`SELECT ... FOR UPDATE` in PostgreSQL). Prevents two concurrent transactions from reading the same value. No-op on SQLite (writes are engine-serialized).
  - **Files**: `packages/apollo-entities/src/repositories/MikroOrmCounterRepository.ts`

## Bug Fixes

- **ObjectId `.toString()` assumption in frontend** — Fixed. Removed `.toString()` call on `checkResult._id` in `ApolloInternetAccount/model.ts`.

## Simplification

- **Remove pending import status** — Removed `status` field from all entities. Transactions provide atomicity. Kept `user` field for attribution.

## Tiberius Gene Prediction (Phase 1–4)

- Config file system (`apollo-tools.json`) with auto-detection of `tiberius.py` and `singularity` on PATH. Configurable via `APOLLO_TOOLS_CONFIG` env var.
- `ToolsConfigModule` + `ToolsConfigService` — loads config, exposes `getToolConfig()`, `isToolAvailable()`, `isSingularityAvailable()`
- `ToolsModule` with three endpoints:
  - `GET /tools/tiberius/available` (ReadOnly) — availability + maxRegionSize
  - `POST /tools/tiberius/run` (User) — starts background job, returns 202
  - `GET /tools/tiberius/status/:jobId` (ReadOnly) — poll for status
- `ToolsService` — full job lifecycle: region validation, sequence fetch, temp FASTA, process spawn (with Singularity bind-mount support), GTF parsing, feature import via `AddFeatureChange`, temp cleanup, timeout handling, process cleanup on shutdown
- `parseGtf()` — pure function converting Tiberius GTF to `AnnotationFeatureSnapshot[]` with coordinate offset (GTF 1-based relative → absolute 0-based) and SO type mapping
- `RunTiberius` dialog — rubber-band menu item ("Run Tiberius gene prediction"), shows region info, max size warning, progress spinner, polls status every 3s, completion/error display
- `CollaborationServerDriver` — `checkTiberiusAvailable()`, `runTiberius()`, `getTiberiusStatus()` methods
- **Files**: `packages/apollo-collaboration-server/src/config/tools-config.service.ts`, `tools-config.module.ts`, `src/tools/tools.module.ts`, `tools.controller.ts`, `tools.service.ts`, `gtf-parser.ts`, `packages/jbrowse-plugin-apollo/src/components/RunTiberius.tsx`
