# E2E Test Status and Next Steps

## Current State (24 tests passing, up from 19)

### Passing Tests
- **login.test.ts** — 2/2
- **searchFeatures.test.ts** — 5/5
- **uploadTest.test.ts** — 1/1
- **addAssembly.test.ts** — 5/5
- **downloadGff.test.ts** — 2/2
- **editFeature.test.ts** — 3/3 (was 2/3)
- **deleteFeature.test.ts** — 2/2 (was 0/2)
- **undo.test.ts** — 2/2
- **splitTranscript.test.ts** — 2/2 (already passing)

### Remaining Failing Tests

- **mergeTranscripts.test.ts** — Not investigated
- **featureHistory.test.ts** — "View feature history" UI not implemented
- **showWarnings.test.ts** — CDSCheck results not rendering in table editor
- **visualGeneModel.test.ts** — Canvas rendering in headless Chromium
- **largeAssembly.test.ts** — External dependency (SM_V10_3 assembly)
- **runTiberius.test.ts** — GTF track test
- **sequenceSearch.test.ts** — Skipped (needs mock tool setup)

### Key Fixes Made

**SQLite transaction deadlock in raw SQL queries**
- `MikroOrmFeatureRepository.sql()` now passes `em.getTransactionContext()` to `getConnection().execute()`. Without this, raw SQL inside `em.transactional()` deadlocked on SQLite.
- File: `packages/apollo-entities/src/repositories/MikroOrmFeatureRepository.ts`

**`testResetDb` deadlock prevention**
- Changed from `schema.drop() + schema.create()` to `schema.clear()` (DELETE FROM instead of DDL)
- Added mutex and FeatureHistorySubscriber cleanup
- File: `packages/apollo-collaboration-server/src/health/health.controller.ts`

**`propagateAncestorBounds` bug**
- Was skipping the direct parent, only updating grandparents. Now starts from the parent itself.
- File: `packages/apollo-collaboration-server/src/features/features.service.ts`

**Synchronous `applyResult` from mutation response**
- Following the same pattern as old Apollo: server response is applied synchronously to the client store via `applyFeatureUpdate`. No async refetch needed.
- MST detached node warnings handled by `setLivelinessChecking('warn')`
- `applyFeatureUpdate` does adds first, then deletes, to avoid detached node errors during tree replacement
- File: `packages/jbrowse-plugin-apollo/src/FeatureService.ts`

**DeleteFeature error handling**
- Added try/catch so the dialog shows errors instead of staying open
- File: `packages/jbrowse-plugin-apollo/src/components/DeleteFeature.tsx`

### Architecture Notes

- Client applies mutation responses synchronously (like old Apollo's ScratchPad store)
- `setLivelinessChecking('warn')` suppresses MST detached node errors during feature tree updates
- All raw SQL in MikroOrmFeatureRepository passes transaction context
- `propagateAncestorBounds` correctly walks from parent upward, recalculating bounds at each level
- Feature IDs still use `Math.random()` in `gff3LineToSnapshot` — should use GFF3 ID attributes
