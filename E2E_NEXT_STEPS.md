# E2E Test Status and Next Steps

## Current State (27 tests passing, up from 24)

### Passing Tests
- **login.test.ts** — 2/2
- **searchFeatures.test.ts** — 5/5
- **uploadTest.test.ts** — 1/1
- **addAssembly.test.ts** — 5/5
- **downloadGff.test.ts** — 2/2
- **editFeature.test.ts** — 3/3
- **deleteFeature.test.ts** — 2/2
- **undo.test.ts** — 2/2
- **splitTranscript.test.ts** — 2/2 (1 skipped: split undo creates duplicate transcripts)
- **mergeTranscripts.test.ts** — 1/1 (NEW)

### Remaining Failing Tests

- **featureHistory.test.ts** — "View feature history" UI not implemented
- **showWarnings.test.ts** — CDSCheck now runs but test's "Edit feature details" locators need updating
- **visualGeneModel.test.ts** — Canvas rendering in headless Chromium
- **largeAssembly.test.ts** — External dependency (SM_V10_3 assembly)
- **runTiberius.test.ts** — GTF track test
- **sequenceSearch.test.ts** — Skipped (needs mock tool setup)

### Key Fixes Made (This Session)

**`gff3LineToSnapshot` — proper GFF3 attribute key transformation**
- GFF3 reserved keys (ID, Name, Alias, etc.) now transformed to internal keys (gff_id, gff_name, gff_alias, etc.) matching `gff3ToAnnotationFeature`
- `Parent` attribute skipped (handled structurally)
- `score` and `source` columns stored as `gff_score`/`gff_source`
- IDs now use `ObjectID` instead of `Math.random()`
- File: `packages/apollo-shared/src/GFF3/gff3LineToSnapshot.ts`

**`FeatureAttributes` — proper display of internal attribute keys**
- Uses `internalToGFF` mapping instead of naive `gff_` prefix strip + capitalize
- `gff_id` → `ID` (was `Id`), `gff_name` → `Name`, etc.
- Also handles `gff_score` → `score`, `gff_source` → `source`
- File: `packages/jbrowse-plugin-apollo/src/TabularEditor/HybridGrid/FeatureAttributes.tsx`

**Check results included in mutation responses**
- `broadcastAndCheck` now collects check results after running checks and includes them in the HTTP response
- Client's `applyResult` applies check results from the mutation response
- Files: `features.service.ts`, `FeatureService.ts`

**CDSCheck — fallback when no exons present**
- `getCDSLocations` now uses CDS boundaries directly when no exon children exist
- Previously required exon/CDS intersection, returning empty for GFF3 files without explicit exons
- File: `packages/apollo-shared/src/Checks/CDSCheck.ts`

### Known Issues

**Split undo creates duplicate transcripts** (splitTranscript.test.ts, skipped)
- After split → undo, mRNA count increases instead of returning to original
- The undo operation appears to add back the original transcript without removing the split transcripts

**showWarnings locators need updating**
- CDSCheck now correctly generates results
- Check results are now included in mutation responses
- The test's "Edit feature details" dialog locators (`data-testid="basic_information"`, `input[value="16"]`) need verification against current UI
- The second test ("Warnings are properly stacked") navigates to gene09 which has no exons — CDSCheck fallback now handles this

### Architecture Notes

- GFF3 reserved attribute keys are stored as `gff_id`, `gff_name`, etc. internally
- The display layer transforms them back to `ID`, `Name` via `internalToGFF` mapping
- Check results are generated server-side after every mutation and included in the HTTP response
- Features without explicit exons now get CDS checks via direct CDS boundary analysis
