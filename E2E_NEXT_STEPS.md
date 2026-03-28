# E2E Test Fixes — Next Steps

Status: 14/45 passing (was 0). Changes so far are uncommitted on `mikro-orm2`.

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
`resp.request().method() === 'PATCH'` or match more specific URL patterns like
`/features/` + a featureId.

## Download GFF3 menu path

Fixed in helpers.ts to `['View', 'Download GFF3']` but the two downloadGff
tests still time out at 2 minutes. Need to investigate whether the Download
GFF3 dialog actually opens and whether the assembly selector works.

## addAssembly admin UI tests

- **2bit**: times out — need to check if the 2bit source type selector and
  Create Assembly button work
- **Source type switch**: times out — the `getByLabel('Sequence source type')`
  click may not be finding the MUI Select

## space.gff3 search tests

These depend on `addAssemblyFromGff` which posts features via `POST /features`.
If the CDSCheck crash causes 500 errors during feature creation, the features
won't be searchable. Fix CDSCheck first, then re-test.

## splitTranscript tests

- "Split at first exon boundary" fails — need to check if the split-transcript
  dialog submit actually sends `POST /features/split-transcript`
- "Split and undo" fails — depends on the split working plus undo via
  `POST /features/undo`

## Other individual test issues

- **largeAssembly**: uses SM_V10_3 assembly which has a missing `.fai` file
  (`SM_V10_3.fasta.gff3.gz.fai`) — the assembly creation fails
- **runTiberius**: the GTF track test may need route or UI adjustments
- **visualGeneModel**: fails at selectAssemblyToView — may be a navigation
  timing issue
- **searchFeatures "Select from multiple hits"**: fails after ~20s, likely an
  assertion mismatch
- **mergeTranscripts**: times out at 2 minutes — likely stuck on table editor
  interaction

## Recommended fix order

- Fix CDSCheck crash (already done, just needs rebuild + test)
- Fix table editor locators (biggest bang — unblocks ~12 tests)
- Fix waitForResponse specificity
- Fix individual test assertions
- Fix admin UI tests last (lower priority)
