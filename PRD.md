# Apollo3 — Project Requirements Document

## Overview

Apollo3 is a collaborative gene annotation editor built on JBrowse 2. The
backend uses MikroORM with multi-database support (SQLite, PostgreSQL, MongoDB).
The repository pattern abstracts the database layer behind interfaces in
`apollo-common`, with implementations in `apollo-entities`.

## Getting Started with Demo Data

Apollo3 ships with a pre-built SQLite database (`demo-data/demo.sqlite`)
containing sample assemblies and evidence tracks. Starting a fully functional
instance requires only two commands:

```sh
pnpm install
pnpm start
```

This starts the server on http://localhost:3999 with the demo database
automatically seeded on first run. The demo includes:

- **volvox** — a synthetic test assembly with GFF3 annotations and six evidence
  tracks (BAM, CRAM, VCF, BigWig)
- **Volvox carteri organism** — the volvox assembly is assigned to an organism,
  demonstrating the organism/assembly hierarchy

### Login and First-Time Admin Setup

Guest login is enabled by default for development. The guest user has
**read-only** access — they can browse assemblies and view tracks but cannot
make changes.

On a fresh database with no admin user, the server prints a one-time **setup
URL** to the console:

```
No admin user found. Use the following URL to set up the first admin account:
  /auth/setup?token=<random-token>
Setup URL: http://localhost:3999/auth/setup?token=<random-token>
```

Visiting this URL activates setup mode. The next user who logs in (via Google,
Microsoft, or root login — not guest) is promoted to admin. This is a one-time
operation; the token is consumed after use. For local development, the root
login (`root`/`password` as configured in `.development.env`) is the simplest
way to get admin access.

### User Roles

Apollo3 has four global roles, in order of increasing privilege:

| Role       | Capabilities                                                    |
| ---------- | --------------------------------------------------------------- |
| `none`     | Authenticated but no access (pending approval)                  |
| `readOnly` | Browse assemblies, view tracks and annotations                  |
| `user`     | All read-only capabilities, plus create/edit/delete annotations |
| `admin`    | Full access: manage users, assemblies, organisms, permissions   |

Roles inherit downward — an `admin` can do everything a `user` can, and a `user`
can do everything `readOnly` can.

New users who register via OAuth get the role configured by
`DEFAULT_NEW_USER_ROLE` (defaults to `none`, meaning they need admin approval).

### Per-Assembly Permissions

Beyond global roles, Apollo3 supports **per-assembly access control** for
multi-assembly deployments where different teams manage different genomes:

- **Assembly visibility** — each assembly is either `public` (visible to all
  authenticated users as read-only) or `private` (visible only to users with
  explicit permission). The demo volvox assembly is set to `public`.

- **Per-assembly roles** — admins can assign individual users a role (`admin`,
  `user`, or `readOnly`) on specific assemblies. This allows, for example,
  giving a collaborator edit access to one assembly while keeping others
  restricted.

- **Resolution order** — when a user accesses an assembly, the system checks:
  1. Global admin → full access to all assemblies
  2. Per-assembly permission → use that role
  3. Assembly is public → read-only access
  4. Otherwise → access denied (403)

### Per-Assembly Track Management

Evidence tracks (BAM, VCF, BigWig, CRAM, etc.) are stored in the database and
associated with specific assemblies. Track access follows the assembly
permission model:

- Viewing tracks requires at least `readOnly` access to the assembly
- Creating, updating, or deleting tracks requires `user`-level access to all
  associated assemblies
- Admins can manage tracks on any assembly

This means a team with `user` access to their assembly can upload and manage
their own evidence tracks without affecting other assemblies.

### Regenerating the Demo Database

After schema changes, regenerate the demo database:

```sh
pnpm -C packages/apollo-collaboration-server dev:build
bash scripts/regenerate-demo-db.sh
```

This starts a temporary server, authenticates as root, uploads the volvox GFF3,
creates evidence tracks, and saves the resulting database to
`demo-data/demo.sqlite`.

## Outstanding Issues (Priority Order)

### P1 — Playwright E2E Tests

This tends to be important. Improving the speed of the tests is important also,
however possible

1. **Playwright test stabilization** — All Cypress tests have been ported to
   Playwright (`pw-tests/`), but some may need timing adjustments:
   - showWarnings: changeInProgress timing issues
   - editFeature: MST addChild failure
   - undo: MST detached node during undo

### P1 — Core Annotation Features (Apollo Classic Parity)

2. **Set Translation Start** — adjusts CDS boundaries based on a user-selected
   start codon position. Needs a position-picking UI.

3. **Attribute/Metadata Editing UI** — Apollo Classic has rich editors for
   dbxrefs, GO terms, gene products, and comments. Apollo3 stores attributes as
   generic key-value pairs but has no dedicated editing UI.
   - Database cross-references (e.g., UniProt, NCBI Gene) with autocomplete
   - GO term annotation with evidence codes (EXP, IDA, ISS, etc.)
   - Gene product names
   - Free-text comments/notes
   - **GO term autocomplete** — the Gene Ontology JSON is ~79MB, too large for
     client-side in-memory parsing. Strategy depends on deployment:
     - **Collaboration server**: load GO at server startup, expose REST search
       endpoints (`GET /ontology/go/search?term=...`). Client calls these lazily
       when the GO autocomplete is opened.
     - **Desktop (Electron)**: parse GO JSON once on first launch, store in a
       local SQLite file via `better-sqlite3`. Query with SQL on subsequent
       uses. The `OntologyLookup` interface stays the same; a
       `SqliteOntologyLookup` implementation wraps the local DB.
     - The Sequence Ontology (2MB) continues to work client-side in-memory via
       `OntologyLookup`. Only GO needs the server/SQLite path due to size.
   - **Files**: new components in
     `packages/jbrowse-plugin-apollo/src/components/`, extend "Edit feature
     details" dialog

### P1 — Performance

4. **Import speed** — Current: ~8s for volvox test data. Breakdown:

- GFF3 parsing + file I/O: ~6s (dominant)
- DB writes: ~2s (already optimized with `insertMany` batching)
- Transaction wrapping gives ~12% speedup on DB writes (WAL+NORMAL config)
- **Investigation needed**: Profile GFF3 parsing to find bottlenecks.

### P2 — Simplification

5. ~~**Remove InternetAccount from Apollo plugin**~~ **DONE** — Removed the
   `ApolloInternetAccount` abstraction entirely. The server now includes
   `baseURL`, `role`, and `userId` in the ApolloPlugin configuration returned by
   `config.json`. WebSocket connection and change sequence tracking moved to the
   session model. All API calls use plain `fetch` with
   `credentials: 'same-origin'` (cookie auth). Components read `baseURL`,
   `role`, and `userId` from the plugin config via utility functions.
   Multi-account selection UI removed (single server per deployment).

6. **Remove chunked RefSeqChunk storage** — Apollo3 currently stores reference
   sequences as chunked text blobs in the `ref_seq_chunk` table. This is
   redundant with JBrowse 2's existing sequence adapters (IndexedFastaAdapter,
   BgzipFastaAdapter, etc.) which handle indexed FASTA efficiently. The chunked
   storage adds import time (~6s for FASTA parsing), database bloat, and
   maintenance complexity (chunk size management, assembly sequence source
   types). Instead, always refer to an external indexed FASTA file (or any other
   JBrowse 2 sequence adapter) for sequence data.
   - Remove `RefSeqChunkEntity` and `MikroOrmRefSeqChunkRepository`
   - Remove `refSeqChunk` from `DatabaseService` and `ServerDataStore`
   - Remove chunked FASTA parsing from `FromFileBaseChange`
   - Simplify `Assembly.sequenceSource` to always reference an external adapter
     config (indexed FASTA, bgzip FASTA, or other JBrowse 2 adapter)
   - Update `SequenceService` to always read from the adapter, never from chunks
   - Migration script: existing chunked data → export to FASTA file + index
   - **Files**: entity definitions, `FromFileBaseChange`, `SequenceService`,
     `assemblies.service.ts`, `DatabaseService`

7. ~~**GFF3 export code deduplication**~~ **DONE** — The export service had its
   own copy of the gene hierarchy assembly logic (`buildChildrenMap` +
   `featureRowToSnapshot`). Replaced with the shared `assembleFeatureTrees()`
   function, removing ~40 lines of duplicate code.
   - **Future: per-exon CDS storage** — Currently CDS is stored as one row
     spanning the full coding region. GFF3 export must split it per-exon and
     compute phases. If CDS were stored as multiple rows (one per exon, with
     pre-computed phases), export would be trivial raw-row output. This would
     require changing all CDS mutation operations (create, resize, split, merge)
     to maintain per-exon rows.

### P2 — Collaboration & Workflow

8. ~~**Per-assembly permissions**~~ **DONE** — `AssemblyPermissionEntity` maps
   user → assembly → role. `PermissionService` checks global admin →
   per-assembly permission → public visibility. Assemblies have
   `public`/`private` visibility. `PermissionsController` provides admin API for
   managing per-assembly roles. Track access follows assembly permissions. See
   "Per-Assembly Permissions" section above for details.
   - **Remaining**: Admin UI for assigning users to assemblies (currently
     API-only)

9. **Feature ownership & audit display** — Apollo Classic tracks who
   created/last edited each feature. Apollo3 stores `user` on entities but
   doesn't expose this in the UI.
   - Display last editor in "Edit feature details" dialog
   - Show creation/modification timestamps
   - Optional: highlight features by ownership in the track display
   - **Files**: plugin "Edit feature details" components

10. **Canned comments/attributes** — Apollo Classic lets admins configure preset
    comment templates and attribute keys/values, speeding up annotation
    significantly.
    - New `CannedElement` entity (type: comment|key|value, text, assembly?)
    - Admin UI for managing canned elements
    - Autocomplete in attribute editing UI (integrates with item 3 above)
    - **Files**: new entity, new admin component, new API endpoints

### P2 — Export/Import

11. **FASTA export (CDS, protein, transcript sequences)** — Apollo Classic
    exports CDS sequences, protein translations, and genomic sequences. Apollo3
    only exports GFF3 + optional genomic FASTA.
    - Export types: CDS FASTA, protein FASTA, transcript FASTA
    - Protein export requires codon translation using configurable translation
      tables (NCBI tables, default table 1)
    - **Files**: `packages/apollo-collaboration-server/src/export/`, new
      `TranslationService`

12. **Filtered/partial export** — Apollo Classic allows exporting specific
    reference sequences. Apollo3 exports entire assemblies.
    - Filter by: reference sequence(s), feature type(s), coordinate range
    - Frontend: checkboxes/filters in "Download GFF3" dialog
    - **Files**: export controller + frontend DownloadGFF3 component

### P2 — Search & Navigation

13. **Sequence search (BLAT/BLAST integration)** — Apollo Classic has pluggable
    BLAT/BLAST search. Annotators paste a sequence and get genomic hits.
    Essential for evidence-based annotation.
    - Pluggable `SequenceSearchProvider` interface (backend)
    - Default implementation: BLAT via `gfClient`/`gfServer`
    - Frontend: "Sequence Search" dialog, results displayed as track
    - Config: search tool URL/path per assembly
    - **Files**: new module in server, new component in plugin

### P2 — Gene Prediction

14. **Tiberius on-the-fly gene prediction** — Run
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

15. **PostgreSQL E2E CI pipeline** — E2E script supports PostgreSQL and
    `docker-compose.yml` provides a local PostgreSQL service, but no CI pipeline
    runs tests against PostgreSQL yet.
    - **Action**: Add a CI job that starts PostgreSQL via docker-compose and
      runs unit tests + E2E against it.

16. **MongoDB E2E testing** — `MongoFeatureRepository` exists but has no test
    coverage beyond type-checking. Unit tests run only against SQLite (and
    optionally PostgreSQL).
    - **Action**: Add a MongoDB test configuration and test the
      `MongoFeatureRepository` against a real MongoDB instance.

### P3 — QC & Validation Checks

17. **Reading frame validation check** — Verify CDS features maintain proper
    reading frame across exon boundaries. Phase must be consistent with upstream
    exon lengths.
    - New check in `CheckRegistry`
    - Requires sequence context to compute expected phase per exon
    - **Files**: `packages/apollo-shared/src/Checks/`

18. **Start codon presence check** — Verify CDS features begin with ATG (or
    valid alternative start codons per translation table).
    - New check in `CheckRegistry`
    - Requires reading first 3bp of CDS sequence
    - Respects configurable translation table (some organisms use GTG, TTG)
    - **Files**: `packages/apollo-shared/src/Checks/`

### P3 — Collaboration UX

19. **Collaborator location visualization** — Previously removed to simplify the
    codebase. Apollo Classic and the old Apollo3 code showed green rectangles on
    the genome view indicating where other users were browsing. Re-add as a
    lightweight feature: show collaborator cursors/regions on the annotation
    track, with user names. Could use the WebSocket `COMMON` channel to
    broadcast viewing positions.

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

### P3 — JBrowse Integration

21. **JBrowse launcher page** — Currently, "Open in JBrowse" links use
    `?config=` with a URL-encoded config path (`/jbrowse/?config=%2Fjbrowse%2F
    config.json%3Fassemblies%3Dabc123`) which is functional but ugly. A
    dedicated launcher page (`/jbrowse-open/?assemblies=abc123`) would provide a
    cleaner entry point that reads query params, configures the JBrowse session
    (e.g. sets `window.__jbrowseConfigPath`), and loads JBrowse — either inline
    or via iframe. This would also allow adding pre-load UI (assembly name
    display, loading indicator) and could support deep-linking to specific
    coordinates (`?loc=chr1:1000-2000`).

    **Note**: Discuss implementation approach before pursuing — there are
    trade-offs between iframe isolation (simpler but limited integration),
    inline loading (better UX but tighter coupling to JBrowse internals), and
    a simple redirect (minimal code but no pre-load UI). The current
    `?config=` approach works and this is a UX polish item, not a blocker.

## More changes to add

No tooltip when zoomed in on feature

Right click->Create annotation worked as guest
