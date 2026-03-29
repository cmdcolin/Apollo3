# E2E Test Fixes — Next Steps

See `E2E_COMPLETED.md` for all completed fixes and passing tests (19/~30).

## Instructions for future agents

- Tests are VERY slow (~30s–2min each). Run only the specific test you're
  working on: `pnpm exec playwright test pw-tests/foo.test.ts -g "test name"`
- After changing server code, you must rebuild and restart:
  `pnpm -C packages/apollo-collaboration-server dev:build` (fast esbuild, ~1s)
  then `bash scripts/e2e-servers.sh stop && bash scripts/e2e-servers.sh start`
- After changing client UI code (in `client/src/`), use the full build:
  `pnpm -C packages/apollo-collaboration-server build` (includes Vite client build)
- After changing the JBrowse plugin code, it needs a plugin rebuild
  (`pnpm -C packages/jbrowse-plugin-apollo build`) AND a server restart
- Add `console.log` debug logging to tests/helpers freely — it shows up in
  the Playwright output and is essential for diagnosing timing issues
- Check failed screenshots at `test-results/*/test-failed-1.png` — they often
  reveal the actual page state immediately
- MUI Select components need `id` on `InputLabel` + `labelId` on `Select` for
  Playwright's `getByLabel()` to work
- MUI Select click: use `locator('[role="combobox"]').click()`, NOT
  `locator('input').click()` (the native input is hidden/aria-hidden)
- Playwright's `response.text()` returns empty for NestJS `StreamableFile`
  responses — use direct Node.js `fetch()` instead
- Statements in this doc about what is/isn't working should be treated with
  skepticism — always verify by running the test

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

## Table editor locator pattern

The table editor renders number values inside `<input>` elements, not as text
content. Playwright's `hasText` and `getByText` do NOT match input values.

**Working patterns:**
- `row.locator('input').nth(2)` — position-based (0=type, 1=start, 2=end)
- `row.locator('input')` + loop with `inputValue()` — value-based matching
- `page.locator('input[type="text"][value="CDS"]')` — CSS attribute selector

**Broken patterns:**
- `td.filter({ hasText: '99' }).locator('input')` — `hasText` never matches
- `row.getByText('99')` — same issue

## Remaining test failures

### `editFeature.test.ts` "Can delete feature" — server deadlock

Right-click delete triggers `broadcastAndCheck` which holds the database.
Subsequent `resetDatabase()` calls deadlock. See "Server deadlock" above.

### `visualGeneModel.test.ts` — features not rendering

The canvas overlay is blank — the gene model features don't appear at all.
This is NOT a simple snapshot mismatch; the data isn't loading/rendering.
May be a timing issue or a data-loading problem with the `so_types.gff3`
assembly.

### `featureHistory.test.ts` — likely coordinate/table issues

3 tests. May have table editor locator issues and/or depend on feature
history UI that may not be implemented.

### `undo.test.ts` — edits not persisting

2 tests. Feature edits don't persist after `refreshTableEditor` toggle.

### `showWarnings.test.ts` — table editor + CDSCheck interaction

2 tests. Table editor locator issues plus CDSCheck may interfere.

### `splitTranscript.test.ts` — dialog/API interaction

2 tests. Check if split-transcript dialog submit works.

### `mergeTranscripts.test.ts` — likely stuck on table editor

Times out — probably table editor interaction issue.

### `deleteFeature.test.ts` — server deadlock

Same SQLite deadlock issue as editFeature "Can delete".

### `addAssembly.test.ts` — DONE (5/5 passing)

### `downloadGff.test.ts` — DONE (2/2 passing)

### `largeAssembly.test.ts` — external dependency

Uses SM_V10_3 assembly which may have a missing `.fai` file.

### `runTiberius.test.ts` — GTF track test

May need route or UI adjustments.

### `sequenceSearch.test.ts` — skipped

Needs mock tool setup + analysis cascade fixes.
