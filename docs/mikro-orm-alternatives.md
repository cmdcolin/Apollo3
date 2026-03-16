# Alternatives to the MikroORM Migration

Evaluation of other paths. For the chosen approach, see
[mikro-orm-migration-justification.md](./mikro-orm-migration-justification.md).

## Option 1: Stay on MongoDB With Targeted Fixes

### Phase 1 — Eliminate `allIds` bottleneck (1-2 weeks)

Replace the `allIds` array scan with a secondary index or lookup collection
mapping feature IDs to their parent document.

### Phase 2 — Add concurrency protection (2-3 weeks)

Optimistic locking (version field) or pessimistic locking to prevent one
annotator's save from overwriting another's. Doesn't eliminate the root issue
(full document load/save) but prevents silent data loss.

### Phase 3 — Partial document flattening (4-6 weeks)

Split at the transcript level: each transcript becomes its own document (exons
still nested inside). Reduces blast radius — editing exon_1 no longer loads
unrelated mRNA_2.

**Remaining problems**: Two annotators editing different exons in the _same_
transcript still conflict. No Electron/desktop support. Replica set still
required. `allIds` still needed at the transcript level.

### Assessment

Comparable effort to the relational migration, but doesn't solve desktop
deployment, doesn't simplify ops, and only partially fixes the concurrent
editing problem.

## Option 2: Firestore / Firebase

**Why tempting**: Built-in auth (Google, Microsoft, email), serverless Cloud
Functions, real-time sync, zero infrastructure. Would replace ~15 files of
Passport/JWT/session code.

**Why problematic for Apollo3**:

| Issue | Impact |
|-------|--------|
| No MikroORM driver | Would need to replace the ORM entirely, losing SQLite/PostgreSQL portability |
| Vendor lock-in | Proprietary to Google Cloud; no standard SQL; pricing subject to change |
| No offline/Electron | Requires network to Google servers — same hard constraint as MongoDB |
| No WebSocket support | Cloud Functions don't support persistent connections; would need to rearchitect collaboration |
| Still document-based | No FKs, no cascades, no joins, no standard query language |

**Viable hybrid**: Use Firebase Authentication (standalone) while keeping
MikroORM for data. This captures the auth simplification without database
lock-in. Compatible with the relational migration as an independent improvement.

## Option 3: Parallel Backend Implementations

The repository interface pattern technically allows multiple backend
implementations. In practice, maintaining two complete repository sets, test
suites, and deployment configs roughly doubles maintenance burden. The
MikroORM migration period (when both MongoDB and relational paths coexisted)
confirmed this cost.

Only worthwhile if two fundamentally different deployment targets are needed.
The relational model already covers desktop (SQLite) through production server
(PostgreSQL).

## Recommendation

The relational migration addresses desktop deployment, operational complexity,
data model challenges, and hosting cost in one coherent change. If not
preferred, a pragmatic fallback:

1. Targeted MongoDB fixes (Phases 1-2) for near-term stability
2. Firebase Auth as standalone service for auth simplification
3. Revisit relational migration when desktop/Electron becomes a priority
