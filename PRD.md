# Apollo3 — Project Requirements Document

Apollo3 is a collaborative gene annotation editor built on JBrowse 2. The
backend uses MikroORM with multi-database support (SQLite, PostgreSQL, MongoDB).

> **Note**: When an item is completed, move it from this file to COMPLETED.md
> and remove it here. Speculative or design-discussion-required items belong in
> EXPERIMENTAL_IDEAS.md, not here.

## Outstanding Issues (Priority Order)

### P1 — Playwright E2E Tests

1. **Playwright test stabilization** — Some tests need timing fixes:
   - showWarnings: changeInProgress timing issues
   - editFeature: MST addChild failure
   - undo: MST detached node during undo

   Speed improvements are also worthwhile where possible.

### P1 — Core Annotation Features (Apollo Classic Parity)

2. **Set Translation Start** — Adjust CDS boundaries based on a user-selected
   start codon position. Needs a position-picking UI.

3. **Attribute/Metadata Editing UI** — Apollo Classic has rich editors for
   dbxrefs, GO terms, gene products, and comments. Apollo3 has no dedicated
   editing UI for these.
   - Database cross-references (e.g., UniProt, NCBI Gene) with autocomplete
   - GO term annotation with evidence codes (EXP, IDA, ISS, etc.)
   - Gene product names and free-text comments
   - GO term autocomplete needs a server-side search endpoint
     (`GET /ontology/go/search?term=...`) — the GO JSON is ~79MB, too large for
     client-side parsing

### P1 — Performance

4. **Import speed** — Currently ~8s for volvox test data; GFF3 parsing dominates
   (~6s). Profile GFF3 parsing to find bottlenecks.

### P2 — UI Updates

5. **Add Assembly UI redesign** — The browser "Add Assembly" dialog needs
   updating after the sequence storage simplification. Sequence files are now
   referenced by server-accessible path or URL (not uploaded). The dialog
   should accept paths/URLs for FASTA+index files instead of file uploads.
   GFF3 feature import also takes a server path. The CLI already supports the
   new workflow; the browser UI currently falls back to an error with
   instructions to use the CLI.

### P2 — Bug Fixes

6. **No tooltip when zoomed in on feature** — Tooltip does not appear when the
   feature glyph is rendered at full detail.

7. **Guest user can right-click → Create annotation** — Should be hidden or
   disabled for users without write access.

### P2 — Collaboration & Workflow

8. **Per-assembly permissions admin UI** — Backend API is complete. Remaining:
   admin UI for assigning users to assemblies (currently API-only).

9. **Feature ownership & audit display** — Apollo3 stores `user` on entities but
   doesn't expose it in the UI.
   - Display last editor and timestamps in "Edit feature details" dialog
   - Optional: highlight features by ownership in the track display

10. **Canned comments/attributes** — Preset comment templates and attribute
    keys/values to speed up annotation (Apollo Classic parity).
    - New `CannedElement` entity (type: comment|key|value, text, assembly?)
    - Admin UI for managing canned elements
    - Autocomplete in attribute editing UI

### P2 — Export/Import

11. **FASTA export** — Export CDS, protein, and transcript sequences. Protein
    export requires codon translation with configurable translation tables.

12. **Filtered/partial export** — Allow exporting specific reference sequences,
    feature types, or coordinate ranges. Currently exports entire assemblies.

### P2 — Analysis Tools

14. **Primer3 integration** — Design primers for a given template sequence.
    Primer3 takes a template + parameters (product size range, Tm, GC%) and
    outputs primer pairs. Complement to isPCR (design primers first, then verify
    in-silico). Requires Primer3 installed on server; uses Boulder-IO
    stdin/stdout protocol.

15. **Analysis tool remaining work**:
    - **Accept/reject workflow**: Show predictions in a preview layer before
      importing, let user accept/reject individual predictions
    - **RNA-seq evidence mode**: Pass BAM/CRAM alignments as evidence to
      Tiberius
    - **Docker backend**: Add Docker as an execution backend (currently
      Singularity and bare-process only)
    - **GPU configuration**: Pass `--nv` (Singularity) or `--gpus all` (Docker)
      when `gpu: true` is set in tool config
    - **Per-assembly model config**: Allow different Tiberius models per
      assembly
    - **E2E test**: Playwright test mocking Tiberius execution (stub GTF
      output), verifying full UI flow
    - **GTF rewriter unit tests**: Rewriter works but has no test coverage

### P2 — Architecture

15. **PostgreSQL E2E CI pipeline** — Add a CI job that starts PostgreSQL via
    docker-compose and runs unit tests + E2E against it.

16. **MongoDB E2E testing** — Add a MongoDB test configuration and test
    `MongoFeatureRepository` against a real MongoDB instance.

### P3 — QC & Validation Checks

17. **Reading frame validation check** — Verify CDS phase is consistent with
    upstream exon lengths across exon boundaries.

18. **Start codon presence check** — Verify CDS begins with ATG (or valid
    alternative start codons per configurable translation table).

### P3 — Collaboration UX

19. **Collaborator location visualization** — Show other users' current viewing
    regions on the annotation track (green rectangles + user names). Use the
    WebSocket `COMMON` channel to broadcast positions.

## Reach goal

- Import genbank format
- Edit small bacterial genomes and plasmids
