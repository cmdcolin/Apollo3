# E2E Test Fixes — Next Steps

## Current state (2026-03-29)

**Verified passing (12 tests):**

- `login.test.ts` — 2/2
- `searchFeatures.test.ts` — 7/7
- `editFeature.test.ts` — 2/3 ("Edit feature", "Suggest SO terms" pass;
  "Can delete feature" deadlocks)
- `uploadTest.test.ts` — 1/1

### Fixes applied this round

- **SlidingWindowInterceptor** re-set the auth cookie after `/auth/logout`
  cleared it. Fixed by skipping the interceptor for the logout path.
- **`searchFeatures` helper** had three issues: (a) `not.toHaveValue(query)`
  resolved instantly because JBrowse clears the input before navigating;
  (b) multi-hit dialog locator `getByText('Search results').locator('..')`
  only went to the `<h2>` parent, not the `[role="dialog"]` ancestor that
  contains the `<table>`;
  (c) `currentLocationEquals` read the value once instead of polling — now
  uses `waitForFunction` with tolerance.
- **`annotationTrackAppearance`** now detects when the annotation track is
  already open (e.g. after feature-name navigation) and skips the track
  selector.
- **`editFeature` "Edit feature"** no longer calls `annotationTrackAppearance`
  after `page.reload()` — JBrowse remembers the display mode. Assertions
  changed from `input[value="CDS"]` to `getByText('CDS')`.
- **`editFeature` "Can delete"** fixed `=tx1` strict-mode violation (matched
  both `ID=tx1` and `Parent=tx1`). Still deadlocks the server — see below.

## Server deadlock on database reset

After certain test interactions (especially feature deletion), the in-memory
SQLite database gets into a state where `POST /health/test-reset-db` hangs
indefinitely. The log shows repeated "Resetting database for test..." without
"Database reset complete".

**Root cause hypothesis:** `schema.drop()` or `schema.create()` acquires a
write lock, but another in-flight request (e.g., the `broadcastAndCheck`
pipeline triggered by a feature mutation) holds a read lock or is waiting for
one. With a single-connection in-memory SQLite, this creates a deadlock.

**Possible fixes:**
- Add a mutex/semaphore around the reset endpoint so concurrent resets queue
- Force-close all open entity-manager forks before calling `schema.drop()`
- Use WAL mode (not available for `:memory:`, but works for file-based SQLite)
- Add a timeout on the `schema.drop()` call with a fallback to kill+restart
  the ORM connection

## Table editor coordinate mismatch

Tests that use `onegene.fasta.gff3` expect CDS end=99 (from the GFF3 file),
but the table displays 95. This affects: `featureHistory` (3), `undo` (2),
`showWarnings` (2), `deleteFeature` (indirectly).

**Investigation needed:** Check whether the coordinate conversion (GFF3
1-based inclusive to internal 0-based half-open) or the `addAssemblyFromGff`
API helper is changing the end coordinate. Verify the stored value in the
database after upload.

## Remaining test failures

### `downloadGff.test.ts` — assembly dropdown empty

Both tests time out because the "Select assembly" dropdown in the Export GFF3
dialog is empty. The dialog opens (via Apollo > View > Download GFF3) but the
assembly list never populates.

### `editFeature.test.ts` "Can delete feature" — server deadlock

Right-click delete triggers `broadcastAndCheck` which holds the database.
Subsequent `resetDatabase()` calls deadlock. See "Server deadlock" above.

### `featureHistory.test.ts` — coordinate mismatch

All 3 tests fail because the table shows CDS end=95 instead of 99.
See "Table editor coordinate mismatch" above.

### `undo.test.ts` — same coordinate issue

Both tests fail at the same CDS end=99 locator.

### `showWarnings.test.ts` — same coordinate issue + check interaction

Both tests fail. Additionally, the CDSCheck runs after mutations and may
interfere.

### `addAssembly.test.ts` — admin UI tests

- **2bit**: times out — check if 2bit source type selector and Create Assembly
  button work
- **Source type switch**: `getByLabel('Sequence source type')` may not find the
  MUI Select

### `splitTranscript.test.ts`

- "Split at first exon boundary" — check if split-transcript dialog submit
  sends `POST /features/split-transcript`
- "Split and undo" — depends on split working plus undo

### `visualGeneModel.test.ts` — screenshot mismatch

Reference screenshot needs regeneration. Run with `--update-snapshots`.

### `largeAssembly.test.ts`

Uses SM_V10_3 assembly which may have a missing `.fai` file.

### Other tests

- **mergeTranscripts**: times out — likely stuck on table editor interaction
- **runTiberius**: GTF track test may need route or UI adjustments
- **sequenceSearch**: skipped — needs mock tool setup + analysis cascade fixes

## Key files

- `packages/apollo-collaboration-server/src/authentication/sliding-window.interceptor.ts` — cookie fix
- `packages/apollo-collaboration-server/src/health/health.controller.ts` — reset endpoint
- `packages/jbrowse-plugin-apollo/pw-tests/helpers.ts` — search, location, track helpers
- `packages/jbrowse-plugin-apollo/pw-tests/editFeature.test.ts` — table editor + delete tests
- `packages/jbrowse-plugin-apollo/scripts/e2e-servers.sh` — server startup with `:memory:` SQLite
