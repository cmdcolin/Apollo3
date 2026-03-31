# Change Tracking: Current Approach and Alternatives

## What We Have

Apollo3's change tracking uses two complementary mechanisms:

### FeatureHistoryEntity (row-level audit log)

`packages/apollo-entities/src/entities/FeatureHistoryEntity.ts`

A MikroORM subscriber (`FeatureHistorySubscriber`) hooks `onFlush` and writes one
row to `feature_history` per affected feature, capturing **the pre-change full
snapshot** (all columns: `min`, `max`, `strand`, `type`, `attributes`, `parentId`,
`refSeq`). Each row carries:

- `changeType` — `insert | update | delete`
- `changedBy` — user email from `AsyncLocalStorage` context
- `sequence` — global monotonic counter (via pessimistic-locked `CounterEntity`)
- `changedAt` — wall clock timestamp

Rows with the same `sequence` value belong to one atomic operation (e.g. a
merge-exons touching 3 features at once). The `changes.controller.ts` groups them
for the recent-changes UI.

Undo (`POST /features/undo`) fetches all history rows at a given `sequence` and
inverts them: insert → delete, delete → re-insert, update → restore the snapshot.
The undo itself is written as a new sequence, so it is itself undoable.

### What is NOT stored

- **Deltas/diffs** — the history row records the state *before* the change, not
  what changed. To see what changed you must diff the history row against the
  current `FeatureEntity`.
- **Operation intent** — there is no `"user ran merge-exons"` record; only the
  resulting row-level mutations are stored.
- **Parent context for child-only changes** — a change to an exon records the
  exon's `featureId`, not its gene's ID. `GET /changes/gene/:id` compensates by
  fetching all descendant IDs first.

---

## How This Compares to Other Systems

### Apollo 2 (WebApollo)

Stored named **operation objects** (`AddExon`, `SetTranslationStart`, …) with full
before/after state and a `getInverse()` method per operation type. History was
per-gene, browsable, and undoable. Undo replayed the inverse operation.

Apollo3's design is lower-level (row snapshots rather than named operations) but
more general: it handles any feature mutation without requiring a hand-written
`getInverse()` for every operation type.

Trade-off: Apollo2's named operations are richer for audit display ("user added an
exon at 1000-2000") whereas Apollo3 shows "update on feature X" and requires a
diff to reconstruct the prose.

### Hibernate Envers / SQL:2011 Temporal Tables

Both store full row snapshots per revision, identical to our approach. Envers
writes to `_AUD` shadow tables; SQL:2011 temporal tables use `valid_time` ranges.

Our `FeatureHistoryEntity` is essentially Envers done manually — same storage
cost, same query patterns. The main difference is Envers also stores a `REVEND`
(when the revision was superseded), enabling cheap point-in-time queries
(`SELECT * WHERE feature_id = X AND rev <= Y`). We don't store `REVEND`, so
reconstructing state at a past sequence requires finding the latest history row
with `sequence <= N`, which requires a subquery rather than a direct lookup.

### Axon / EventStoreDB (full event sourcing)

The aggregate (feature tree) is never stored as a mutable row — it is derived by
replaying all events. Snapshots are taken every N events to cap replay cost.

For genomics this is impractical at the data volume we deal with:
- A gene with years of annotations could have thousands of events
- Loading a genomic region with 200 genes would require up to 200,000 event replays
  per page view, even with per-aggregate snapshots
- Schema evolution (renaming an event field) requires a migration of the entire
  event log

Full event sourcing is a good fit when the event log *is* the product (financial
ledgers, compliance trails). For genomic annotation the feature coordinates are
the product; history is secondary.

### Linear (issue tracker)

Stores per-field change events: `{field: "min", from: 1000, to: 1050}`. Undo is
per-user and limited to a recent window. No full event replay — reads always hit
the current-state table.

This is the closest to a practical improvement over our current design: storing
**field-level diffs** rather than full pre-state snapshots. See the assessment
below.

### Google Docs / Figma (OT / CRDT)

OT and CRDTs are designed for character-level concurrent text edits. For
structured genomic data (coordinate integers, controlled-vocabulary attributes,
strict parent-child trees) they add complexity without benefit. Apollo uses a
**server-serialises-all-writes** model (sequence counter + pessimistic lock) which
is the right trade-off: simpler, no merge conflicts, correct ordering guaranteed.

### Dolt / Nessie (Git-like branching)

Git-like branching for annotation review workflows (annotator branch → curator
review → merge to main) is genuinely useful and not provided today. The cost is
that online transaction throughput drops: maintaining a DAG per write is expensive
under concurrent editing. A practical middle ground is coarse-grained snapshots
at submission/publication milestones rather than per-edit commits.

---

## Assessment: Is Storing Diffs Worth It?

### The gap today

`FeatureHistoryEntity` stores the **pre-change state** but not the **delta**. To
answer "what exactly changed in sequence 4217?" requires:

```sql
SELECT * FROM feature_history WHERE sequence = 4217;
-- Then compare each row against current FeatureEntity for the same featureId
```

This breaks for deleted features (no current entity to compare against) and
requires application-layer diffing rather than a simple query.

### Adding a diff column: cost vs benefit

Adding a `diff` column (e.g. `JSONB` storing `{field: [before, after]}` pairs)
would allow:

- Rich audit display without a second query ("min changed from 1000 to 1050,
  strand changed from 1 to -1")
- Cheaper "what changed" queries in the recent-changes UI
- Foundation for operation-level undo (reverse only the changed fields)

Storage cost is low: genomic feature rows are narrow (6–8 numeric/string columns),
diffs will typically be 1–3 fields. A diff entry is smaller than the full snapshot
already stored.

The subscriber already has access to both the original and the new entity at
`onFlush` time via MikroORM's change sets (`unitOfWork.getChangeSets()`), so
computing the diff is a few lines of code.

**Verdict: worth adding.** The subscriber change is small, the storage overhead is
negligible, and the benefit to the history UI and future audit tooling is
significant. It does not require any architectural change.

### Is CQRS worth formalising?

The read/write split already exists informally: `GET /changes`, `GET /features`
are reads; `POST/PATCH/DELETE /features` are writes. Formalising CQRS (separate
read-model projections, command bus, query bus) would add an abstraction layer for
no concrete improvement at current scale.

If the history UI becomes complex enough to need pre-aggregated projections (e.g.
per-user activity summaries, assembly-level diff stats), a lightweight projection
table populated by the existing subscriber would be the right approach — not a
full CQRS framework.

### Is full event sourcing worth it?

No. The reasons:

- Feature reads dominate over history reads; mutating the current state table is
  the right trade-off
- Replay cost at genomic data volume is prohibitive without per-feature snapshots,
  at which point you've reinvented the current design
- Schema evolution of event payloads is painful in a codebase that already changes
  frequently

### What *is* worth considering

- **Diff column on `FeatureHistoryEntity`** — small change, immediate UI benefit
- **`geneId` index on history** — already described in
  `apollo2-migration-and-history-tracking.md`; enables cheap per-gene history
  without traversing descendants at query time
- **`REVEND` / superseded-at tracking** — recording when a history row was
  superseded by the next change enables cheap point-in-time queries; analogous to
  SQL:2011 temporal tables. Medium complexity, high value for audit use cases.
- **Coarse snapshots at annotation milestones** (submission, publication) — not
  per-edit, just named checkpoints. Enables "compare to submitted version" without
  full event replay.
