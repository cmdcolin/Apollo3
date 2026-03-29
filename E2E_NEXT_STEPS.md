# E2E Test Fixes — Next Steps

## Current state (2026-03-28)

The E2E test infrastructure has been overhauled:

- Server uses **in-memory SQLite** (`:memory:`) instead of file-based
- `POST /health/test-reset-db` drops+recreates schema between tests, giving
  each test a guaranteed clean database
- All test files call `resetDatabase()` in `beforeEach` instead of the old
  `deleteAssemblies()` (which missed analysis records and could silently fail)
- Root token cached across API calls within a test
- `OrmLifecycleService` closes MikroORM connections on server shutdown
- `sequenceSearch.test.ts` skipped pending mock tool + analysis cascade fixes

**Verified working:** login (root login), uploadTest, DB reset (idempotent).

## Server bug: CDSCheck crash

The CDSCheck in `packages/apollo-shared/src/Checks/CDSCheck.ts` crashes with
`Cannot read properties of undefined (reading 'min')` when a CDS has no
overlapping exons (empty `phasedLocs` array). Fix is already staged — skip
pushing empty arrays into `cdsLocations`. This crash fires during
`broadcastAndCheck` after every feature mutation, causing 500 errors that block
many tests.

## Table editor locators

Tests use locators like `input[type="text"][value="EST_match"]` which break
after Playwright's `.fill()` changes the value — the locator no longer matches.
Fix: use cell-based locators (`td.filter(...).locator('input')`) or grab the
input reference before filling.

Affected tests: editFeature (all 3), featureHistory (all 3), undo (2),
showWarnings (2), deleteFeature (2).

## waitForResponse too broad

`resp.url().includes('/features') && resp.status() === 200` matches any GET to
`/features/*` endpoints, not just PATCH mutations. Fix: check
`resp.request().method() === 'PATCH'` or match more specific URL patterns.

## Remaining test failures

### `login.test.ts` — logout does not clear auth

The "logout redirects to server and clears auth" test fails because after
clicking Log Out and navigating to `/auth/logout`, the auth cookie is not
cleared. Going back to `/jbrowse/` does not show the login dialog.

**Likely fix:** Check that `/auth/logout` clears the JWT cookie with matching
path/domain/httpOnly flags.

### `downloadGff.test.ts` — assembly dropdown empty

Both tests time out because the "Select assembly" dropdown in the Export GFF3
dialog is empty even though the assembly was created. The dialog opens but the
assembly list never populates.

### `addAssembly.test.ts` — admin UI tests

- **2bit**: times out — check if 2bit source type selector and Create Assembly
  button work
- **Source type switch**: `getByLabel('Sequence source type')` may not find the
  MUI Select

### `editFeature.test.ts` — changes don't persist after reload

After editing fields and reloading, the table display may not auto-appear.

**Likely fix:** After `page.reload()`, call
`annotationTrackAppearance(page, 'Show both graphical and table display')`.

### `searchFeatures.test.ts` — coordinate assertions fail

`currentLocationEquals()` fails because JBrowse auto-adjusts the view,
shifting coordinates beyond the tolerance (10bp).

**Likely fix:** Increase tolerance or check feature visibility instead of exact
coordinates.

### `deleteFeature.test.ts` — UI interaction failures

Delete/resize tests fail during table editor interactions after deletion.
Likely timing issues with table re-rendering.

### `visualGeneModel.test.ts` — screenshot mismatch

Reference screenshot needs regeneration. Run with `--update-snapshots`.

### `splitTranscript.test.ts`

- "Split at first exon boundary" — check if split-transcript dialog submit
  sends `POST /features/split-transcript`
- "Split and undo" — depends on split working plus undo

### `largeAssembly.test.ts`

Uses SM_V10_3 assembly which may have a missing `.fai` file — assembly
creation fails.

### Other tests

- **mergeTranscripts**: times out — likely stuck on table editor interaction
- **runTiberius**: GTF track test may need route or UI adjustments
- **sequenceSearch**: skipped — needs mock tool setup + analysis cascade fixes

## Resource leak fixes still needed

- **MessagesGateway**: No `handleDisconnect` — socket references may accumulate
- **Assembly deletion cascade**: `AnalysisDb` pivot table and `AnalysisJob`
  records not cleaned up on assembly delete (production bug)
- **run-command.ts**: No SIGKILL fallback for unresponsive child processes

## Recommended fix order

- Fix CDSCheck crash (already staged, rebuild + test)
- Fix table editor locators (biggest bang — unblocks ~12 tests)
- Fix `login.test.ts` logout (likely 1-line cookie fix)
- Fix `searchFeatures.test.ts` tolerance
- Fix `editFeature.test.ts` table re-enable after reload
- Fix waitForResponse specificity
- Fix `downloadGff.test.ts` assembly list population
- Fix individual UI interaction tests
- Fix admin UI tests (lower priority)
- Re-enable `sequenceSearch.test.ts` (last)

## Key files

- `packages/apollo-collaboration-server/src/health/health.controller.ts` — reset endpoint
- `packages/apollo-collaboration-server/src/mikro-orm/mikro-orm.module.ts` — ORM lifecycle
- `packages/jbrowse-plugin-apollo/pw-tests/helpers.ts` — `resetDatabase()`, cached `getRootToken()`
- `packages/jbrowse-plugin-apollo/scripts/e2e-servers.sh` — server startup with `:memory:` SQLite
