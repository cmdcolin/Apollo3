# E2E Test Fixes — Next Steps

## Current state (2026-03-28)

The E2E test infrastructure has been overhauled:

- Server now uses **in-memory SQLite** (`:memory:`) instead of file-based
- A `POST /health/test-reset-db` endpoint drops+recreates the schema between
  tests, giving each test a clean database
- All test files call `resetDatabase()` in `beforeEach` instead of the old
  `deleteAssemblies()` approach (which missed analysis DB/job records and could
  silently fail)
- Root token is cached across API calls within a test (avoids redundant
  `POST /auth/root` per helper call)
- `OrmLifecycleService` closes MikroORM connections on server shutdown
- `sequenceSearch.test.ts` is skipped pending mock tool and analysis cascade
  fixes

**Verified working:** login (root login test), uploadTest, DB reset endpoint
(idempotent, ~instant on in-memory SQLite).

## Remaining test failures

These are pre-existing test issues unrelated to DB infrastructure. They should
be investigated one at a time by running the individual test file against a
running server (`bash scripts/e2e-servers.sh start` then
`pnpm exec playwright test <file>`).

### `login.test.ts` — logout does not clear auth

The "logout redirects to server and clears auth" test fails because after
clicking Log Out and navigating to `/auth/logout`, the auth cookie is not
cleared. Going back to `/jbrowse/` does not show the login dialog.

**Likely fix:** Check that the `/auth/logout` endpoint properly clears the JWT
cookie (path, domain, httpOnly flags must match what was set during login).

### `downloadGff.test.ts` — assembly dropdown empty in export dialog

Both download tests time out because the "Select assembly" dropdown in the
Export GFF3 dialog is empty even though the assembly was created via API. The
dialog opens but the assembly list never populates.

**Likely fix:** The dialog may need a WebSocket-driven assembly list refresh, or
the dialog component may not be fetching assemblies on mount. Check how the
dialog populates its assembly list.

### `addAssembly.test.ts` — all 5 tests fail

These tests navigate to `/admin/add-assembly/` which is a server-rendered page.
The failures are likely related to the admin UI page not being built or served
correctly during E2E.

**Likely fix:** Check that the admin UI pages are built and served under
`/ui/assembly-admin/`. The `addAssembly` tests may need to be updated to match
the current admin UI.

### `editFeature.test.ts` — table editor changes don't persist after reload

After editing fields in the table editor and reloading, the test can't find the
updated values. The table editor display may not auto-appear after
`page.reload()`.

**Likely fix:** After `page.reload()`, re-enable the table display by calling
`annotationTrackAppearance(page, 'Show both graphical and table display')`
before asserting values.

### `searchFeatures.test.ts` — coordinate assertions fail

The `currentLocationEquals()` assertions fail because JBrowse auto-adjusts the
view to fit the viewport, so coordinates shift slightly beyond the specified
tolerance (currently 10bp).

**Likely fix:** Increase tolerance values, or switch to checking that the
target feature is visible in the viewport rather than checking exact location
bar coordinates.

### `deleteFeature.test.ts` — UI interaction failures

The delete and resize tests fail during UI interactions with the table editor
after feature deletion. Likely timing issues with the table re-rendering after
the delete operation.

### `visualGeneModel.test.ts` — screenshot mismatch

Visual regression test — the reference screenshot needs to be regenerated for
the current rendering. Run with `--update-snapshots` once the test environment
is stable.

### `sequenceSearch.test.ts` — skipped

Deferred. These tests spawn child processes for BLAST/BLAT/isPCR via mock
tools. They also create analysis databases which have cascade gaps (the
`AnalysisDb` ManyToMany pivot table and `AnalysisJob` records are not cleaned up
when assemblies are deleted). The `resetDatabase()` approach handles this for
now, but the mock tool setup needs verification.

### Other tests (featureHistory, splitTranscript, mergeTranscripts, undo, etc.)

These tests involve complex UI interactions (right-click menus, drag-and-drop,
dialog flows). Many likely fail due to selector changes or timing issues in the
JBrowse UI. Investigate individually.

## Architecture notes

### How the test reset works

```
beforeEach:
  1. resetDatabase() → POST /health/test-reset-db (no auth needed, @Public)
     - orm.schema.drop() + orm.schema.create()
     - clears identity map
     - re-seeds check configs (CDS, Transcript)
     - re-registers FeatureHistorySubscriber
  2. loginAsRoot(page) → browser navigates to /jbrowse/, fills password, clicks sign in
```

The reset endpoint is guarded by `ALLOW_TEST_RESET` env var (set in
`e2e-servers.sh`). It is not available in production.

### Key files

- `packages/apollo-collaboration-server/src/health/health.controller.ts` — reset endpoint
- `packages/apollo-collaboration-server/src/mikro-orm/mikro-orm.module.ts` — ORM lifecycle
- `packages/jbrowse-plugin-apollo/pw-tests/helpers.ts` — `resetDatabase()`, `getRootToken()` (cached)
- `packages/jbrowse-plugin-apollo/scripts/e2e-servers.sh` — server startup with `:memory:` SQLite

### Resource leak fixes still needed

- **MessagesGateway**: No `handleDisconnect` — socket references may accumulate
- **Assembly deletion cascade**: `AnalysisDb` pivot table and `AnalysisJob`
  records are not cleaned up when assemblies are deleted (production bug, not
  just test issue)
- **run-command.ts**: No SIGKILL fallback if child process doesn't respond to
  SIGTERM

## Suggested order for fixing remaining tests

- `login.test.ts` logout test (likely 1-line cookie fix)
- `searchFeatures.test.ts` (increase coordinate tolerance)
- `editFeature.test.ts` (add table re-enable after reload)
- `downloadGff.test.ts` (investigate assembly list population in dialog)
- `deleteFeature.test.ts` (timing issues)
- `addAssembly.test.ts` (admin UI serving)
- Other UI interaction tests
- `sequenceSearch.test.ts` (last — needs mock tool + cascade work)
