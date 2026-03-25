# Apollo3 — Experimental Ideas

Ideas that are speculative, not yet committed to, or require design discussion
before pursuing. These are not on the active roadmap. Move an item to PRD.md
when it becomes a concrete actionable task.

## Per-exon CDS storage

Currently CDS is stored as one row spanning the full coding region. GFF3 export
must split it per-exon and compute phases. If CDS were stored as multiple rows
(one per exon, with pre-computed phases), export would be trivial raw-row
output. This would require changing all CDS mutation operations (create, resize,
split, merge) to maintain per-exon rows.

Only worth pursuing if the GFF3 export phase-computation becomes a maintenance
burden or correctness problem.

## JBrowse launcher page

Currently, "Open in JBrowse" links use `?config=` with a URL-encoded config path
(`/jbrowse/?config=%2Fjbrowse%2Fconfig.json%3Fassemblies%3Dabc123`) which is
functional but ugly. A dedicated launcher page
(`/jbrowse-open/?assemblies=abc123`) would provide a cleaner entry point that
reads query params, configures the JBrowse session (e.g. sets
`window.__jbrowseConfigPath`), and loads JBrowse — either inline or via iframe.
This would also allow adding pre-load UI (assembly name display, loading
indicator) and could support deep-linking to specific coordinates
(`?loc=chr1:1000-2000`).

Trade-offs to discuss before pursuing:

- **iframe isolation** — simpler but limited integration
- **inline loading** — better UX but tighter coupling to JBrowse internals
- **simple redirect** — minimal code but no pre-load UI

The current `?config=` approach works; this is a UX polish item, not a blocker.
