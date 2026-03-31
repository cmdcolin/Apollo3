# RefSeq Table Removal

## Motivation

The `ref_seq` SQL table stored reference sequence metadata (name, length,
aliases) as rows linked to assemblies via foreign key. This was redundant
because the same information is already available in the assembly's external
sequence files (FASTA index or TwoBit). Removing it simplifies the data model
and eliminates a synchronization point between the database and filesystem.

## What Changed

### Data model

- **Before**: Features stored `refSeq` as a foreign key to the `ref_seq` table.
  The `ref_seq` table linked to `assembly` via FK. To find which assembly a
  feature belonged to, you joined feature -> refSeq -> assembly.
- **After**: Features store `refSeq` as a plain name string (e.g. "chr1") and
  have a direct `assembly` FK. RefSeq names and lengths are read on-demand from
  the assembly's `sequenceSource` (FASTA .fai or TwoBit file).

### Deleted files

- `packages/apollo-entities/src/entities/RefSeqEntity.ts`
- `packages/apollo-entities/src/repositories/MikroOrmRefSeqRepository.ts`
- `packages/apollo-common/src/repositories/RefSeqRepository.ts`
- `packages/apollo-collaboration-server/src/refSeqs/` (entire module:
  controller, service, DTOs, specs)
- `packages/apollo-cli/src/commands/refseq/get.ts`
- `packages/apollo-cli/src/commands/refseq/add-alias.ts`

### New endpoint

- `GET /assemblies/:id/sequences` - Returns `[{name, length}]` by reading the
  assembly's sequenceSource. Replaces the old `GET /refSeqs?assembly=` endpoint.

### Server changes

- `DatabaseService` no longer has a `refSeq` property
- `FeaturesService` queries by `(assemblyId, refSeq)` pair instead of refSeq ID
- `ChecksService` filters by assembly instead of refSeq IDs
- `ExportService` reads refSeq names from sequenceSource
- `SequenceService` looks up assembly by name, passes refSeq name directly
- Analysis runners (BLAST, miniprot, Tiberius) use assembly + refSeq name
- Feature schemas updated: `getFeatures` takes `{assembly, refSeq, start, end}`

### Client changes

- `CollaborationServerDriver` and `DesktopSQLiteDriver` simplified: no refSeq
  table loading, features fetched by assembly name + refSeq name
- `ClientDataStore` no longer stores a refSeq map
- `ApolloAssembly` MST model simplified
- `AddFeature`, `CopyFeature`, `RunTiberius` components pass refSeq names
  directly

### CLI changes

- Deleted `refseq get` and `refseq add-alias` commands
- `feature get` now requires `--assembly` and `--refseq` flags
- `feature copy` now requires `--assembly` flag
- `feature add` passes refSeq names directly (no ID lookup)
- `assembly add-from-gff` uses GFF3 seq_id as refSeq name directly
- `assembly sequence` uses assembly + refSeq name directly
- Removed `getRefseqId()` and `getAssemblyFromRefseq()` from utils

### Migration script

- `migrate-mongo-to-mikroorm.ts` still reads MongoDB refSeqs collection to build
  a name mapping (ObjectId -> name), but no longer creates RefSeqEntity rows.
  Features and check results are migrated with refSeq names and assembly FKs.

### Test changes

- Entity tests: removed RefSeqEntity/MikroOrmRefSeqRepository usage, tests
  create assemblies directly and use refSeq names as plain strings
- `features.service.spec.ts`: same pattern
- CLI integration tests: removed `refseq get`/`refseq add-alias` usage, updated
  feature commands to use new required flags
- Playwright helpers: use refSeq names from GFF3 directly

## Verification

- `pnpm tsc -b` passes (full type-check)
- `pnpm -C packages/apollo-collaboration-server dev:build` succeeds
- Entity tests: 94/94 passing
- ESLint: no new errors from these changes
