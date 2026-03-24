# Analysis Tool Integration

Apollo3 includes a generic server-side analysis framework (`/analysis/`) where
each tool is an independent runner behind a shared job queue and REST API.

## API surface

Three endpoint groups cover the full workflow:

- `GET /analysis/tools` — list available tools and their parameter schemas
- `GET/POST/DELETE /analysis/databases` — CRUD for tool-specific databases
  (BLAST indexes, BLAT databases, etc.) and triggering a build job
- `GET/POST /analysis/jobs` — submit a job, poll status, cancel, and retrieve
  results

## Built-in runners

Five runners ship by default:

| Runner        | Description                                                                 |
| ------------- | --------------------------------------------------------------------------- |
| `local-blast` | blastn/blastp/blastx/tblastn/tblastx against a locally built BLAST database |
| `blat`        | Fast nucleotide/protein alignment against a local BLAT .2bit database       |
| `miniprot`    | Protein-to-genome alignment via miniprot                                    |
| `ispcr`       | In-silico PCR: amplicon prediction from a primer pair via UCSC isPcr        |
| `tiberius`    | Gene prediction via Tiberius deep learning model                            |

NCBI BLAST is not a server-side runner — the sequence search UI posts directly
to blast.ncbi.nlm.nih.gov from the browser, giving users the full NCBI
experience without adding job overhead to the Apollo server.

Each runner implements the `AnalysisRunner` interface (submit, poll, cancel,
parse results). Jobs and databases are stored as `AnalysisJobEntity` and
`AnalysisDbEntity` rows with a `tool` field and flexible `params`/`results` JSON
columns, so no schema changes are needed when adding a new tool.

## Frontend

A tabbed _Sequence Search_ page shows one tab per available tool. Each tab has
its own form and results renderer. Admins have a separate _Jobs_ panel for
building databases.

### Auth gating

Analysis tools are only visible to authenticated users. Unauthenticated visitors
do not see analysis menu items and receive clear error messages if they somehow
attempt to use them.

## Adding a new tool

Adding a new tool requires four steps:

1. Create `runners/my-tool.runner.ts` implementing `AnalysisRunner`
2. Register it in `analysis.module.ts`
3. Inject it in the worker and service constructors
4. Add a results renderer in `sequence-search.tsx` if the output format differs
   from existing tools
