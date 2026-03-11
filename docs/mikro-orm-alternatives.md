# Alternatives to the MikroORM Migration

This document evaluates what it would take to stay on MongoDB and what other
database options exist. For the core migration rationale, see
[mikro-orm-migration-justification.md](./mikro-orm-migration-justification.md).

---

## What Staying on MongoDB Would Require

If the decision were made to keep MongoDB, the challenges described in the core
document would still need to be addressed.

### The data model would still need to be restructured

The nested document design is the source of the concurrent editing risk, the
`allIds` bookkeeping, and the document size limits. None of these can be fixed
without changing how features are stored. Fixing them in MongoDB would require
moving to a flat document model — one document per feature, with a parent
reference field — which is structurally the same change as the relational
migration, but done in MongoDB's query language instead of SQL.

This is a significant effort. It involves migrating existing data and rewriting
the same application logic. The work required is comparable to the relational
migration — but without the benefits described below.

### Electron deployment would still be impossible, requiring a second database system

MongoDB has no embedded or in-process mode. There is no production-grade
document database that can run inside an Electron application the way SQLite
can. The only viable option would be to use a completely different database for
the desktop case — meaning two separate data access implementations would need
to be maintained: one for the server (MongoDB) and one for desktop (SQLite or
similar). This adds significant maintenance cost compared to migrating
everything to a single relational model.

### The replica set requirement may have been unnecessary

As described in the core document, Apollo 3's real-time collaboration is handled
by WebSocket broadcasting, not MongoDB change streams. If change streams were
removed from the MongoDB configuration, the replica set requirement would go
away — and real-time collaboration would continue to work via WebSockets as it
already does.

However, even if the replica set requirement were dropped, the other challenges
(nested documents, `allIds`, document size limits, no Electron support) would
remain. Removing the replica set requirement alone does not address the core
issues.

### Summary

Staying on MongoDB requires approximately the same migration work as the
relational approach, still leaves the Electron case unsolved (or requires
maintaining two separate database systems), and does not reduce the operational
complexity of server deployments. The relational migration addresses all of
these concerns with a single, coherent change.

---

## If the MikroORM Migration Cannot Proceed: Alternatives

If the relational migration is not approved, the challenges with the document
model still need to be addressed. This section evaluates three alternative
paths, including their strengths and limitations.

### Alternative 1: Targeted fixes to the existing MongoDB codebase

Rather than replacing the database layer entirely, the most impactful challenges
could be addressed incrementally within the existing MongoDB code:

**Phase 1 — Eliminate the `allIds` bottleneck (1–2 weeks):** Every feature
operation currently scans a large array field (`allIds`) to find which gene
document contains a given feature. This could be replaced with a secondary index
or a lookup collection mapping feature IDs to their parent document IDs. This is
the single highest-impact performance fix available without restructuring the
data model.

**Phase 2 — Add concurrency protection (2–3 weeks):** The risk of one
annotator's changes overwriting another's could be mitigated by adding
optimistic locking (a version field that rejects stale writes) or pessimistic
locking (a lock flag checked before modifying a gene document). This does not
eliminate the underlying issue — entire gene documents are still loaded and
saved for every edit — but it prevents unintended overwrites.

**Phase 3 — Partial document flattening (4–6 weeks):** The nested document model
could be partially flattened by splitting the nesting at the transcript level.
Currently, one MongoDB document holds an entire gene with all of its
transcripts, exons, and CDS features embedded inside it:

```json
// Current: one document per gene, everything nested
{
  "_id": "gene_1",
  "type": "gene",
  "min": 1000,
  "max": 5000,
  "allIds": [
    "gene_1",
    "mRNA_1",
    "mRNA_2",
    "exon_1",
    "exon_2",
    "exon_3",
    "CDS_1",
    "CDS_2"
  ],
  "children": {
    "mRNA_1": {
      "type": "mRNA",
      "min": 1000,
      "max": 3500,
      "children": {
        "exon_1": { "type": "exon", "min": 1000, "max": 1500 },
        "exon_2": { "type": "exon", "min": 3000, "max": 3500 },
        "CDS_1": { "type": "CDS", "min": 1200, "max": 3400 }
      }
    },
    "mRNA_2": {
      "type": "mRNA",
      "min": 2000,
      "max": 5000,
      "children": {
        "exon_3": { "type": "exon", "min": 2000, "max": 2500 },
        "CDS_2": { "type": "CDS", "min": 2100, "max": 4900 }
      }
    }
  }
}
```

Editing exon_1 requires loading this entire document — including mRNA_2 and all
its children, which are completely unrelated to the edit — modifying the nested
object, and writing it all back.

Partial flattening would split each transcript into its own document, with the
gene becoming a thin wrapper holding references:

```json
// After partial flattening: gene is a thin wrapper
{
  "_id": "gene_1",
  "type": "gene",
  "min": 1000, "max": 5000,
  "childIds": ["mRNA_1", "mRNA_2"]
}

// Each transcript is its own document, with exons still nested
{
  "_id": "mRNA_1",
  "type": "mRNA",
  "parentId": "gene_1",
  "min": 1000, "max": 3500,
  "children": {
    "exon_1": { "type": "exon", "min": 1000, "max": 1500 },
    "exon_2": { "type": "exon", "min": 3000, "max": 3500 },
    "CDS_1":  { "type": "CDS",  "min": 1200, "max": 3400 }
  }
}

{
  "_id": "mRNA_2",
  "type": "mRNA",
  "parentId": "gene_1",
  "min": 2000, "max": 5000,
  "children": {
    "exon_3": { "type": "exon", "min": 2000, "max": 2500 },
    "CDS_2":  { "type": "CDS",  "min": 2100, "max": 4900 }
  }
}
```

This reduces the blast radius: editing exon_1 now only loads mRNA_1, and two
annotators editing exons in different transcripts of the same gene are working
on separate documents with no contention.

However, this is a partial solution. Two annotators editing different exons
within the _same transcript_ still contend for the same document. Exons still
don't have their own primary keys — finding exon_1 still requires knowing which
transcript document contains it. The `allIds` workaround is still needed (just
at the transcript level instead of the gene level). And none of the other
problems are addressed: no Electron support, MongoDB replica set still required,
no standard SQL querying.

**Assessment:** These changes would address a meaningful portion of the
challenges. However, they do not solve the Electron deployment case, do not
remove the MongoDB replica set requirement, and do not simplify the overall
codebase. The phased approach also carries its own complexity: each phase
modifies the same code paths (the 24 Change classes that depend on the nested
document structure), meaning each change must be carefully coordinated.

### Alternative 2: Firestore / Firebase

Google's Firestore is a managed cloud database that comes with an attractive
ecosystem: built-in authentication (Google, Microsoft, email, and other OAuth
providers), serverless hosting via Firebase Cloud Functions, real-time data
synchronization, and zero infrastructure management.

**Why this is tempting:**

Apollo 3's current authentication setup is complex — roughly 15 files managing
Passport strategies, JWT tokens, session secrets, and OAuth provider
configuration. Getting Google login working requires creating credentials in the
Google Cloud Console, setting multiple environment variables, and handling
redirect URIs. With Firebase Authentication, all of this is replaced by a hosted
service that handles the entire OAuth flow, token management, and user database
out of the box.

The NestJS server can run on Firebase Cloud Functions, making the entire backend
serverless. The pattern is documented and used in production: NestJS is wrapped
in an Express adapter and exported as a Cloud Function.

**Why this is problematic for Apollo 3 specifically:**

- **MikroORM does not support Firestore.** MikroORM supports MongoDB,
  PostgreSQL, MySQL, MS SQL Server, and SQLite. There is no Firestore driver,
  and writing a custom one would be a significant undertaking with uncertain
  compatibility. Adopting Firestore as the database would mean either replacing
  MikroORM entirely (losing the SQLite and PostgreSQL portability that enables
  the Electron and flexible deployment scenarios) or using a separate Firestore
  ORM like `fireorm` or `nestjs-fireorm`, which are much less mature.

- **Vendor lock-in.** Firestore is proprietary to Google Cloud. Data stored in
  Firestore cannot be queried with standard SQL tools, cannot be easily migrated
  to another provider, and is subject to Google's pricing changes. For a
  scientific tool used by research institutions with varying infrastructure
  requirements, this is a significant constraint.

- **No offline / Electron support.** Firestore requires a network connection to
  Google's servers. It cannot run as an embedded, local database inside a
  desktop application. This eliminates the Electron use case entirely — the same
  hard constraint as MongoDB.

- **Cold start and WebSocket limitations.** Firebase Cloud Functions have
  nontrivial cold starts (NestJS adds to this with its module initialization
  overhead), and they do not support persistent WebSocket connections. Apollo
  3's real-time collaboration feature relies on WebSockets. Replacing this with
  Firestore's real-time listeners is possible but would require rearchitecting
  the collaboration layer.

- **Firestore's data model is still document-based.** While Firestore documents
  can be organized in subcollections (avoiding the single-document nesting
  problem), the fundamental trade-offs of a document database remain: no foreign
  keys, no cascade deletes, no joins, and no standard query language.

**A hybrid option — Firebase Auth without Firestore:**

The most compelling part of the Firebase ecosystem for Apollo 3 is the
authentication, not the database. It is possible to use Firebase Authentication
as a standalone service while keeping the relational database (SQLite /
PostgreSQL via MikroORM) for data storage. This would:

- Replace the ~15 files of Passport/JWT/session code with Firebase Auth SDK
  calls
- Provide Google, Microsoft, GitHub, and email login out of the box with minimal
  configuration
- Keep the relational data model, Electron support, and deployment flexibility
  intact
- Require validating Firebase JWT tokens on the server side (a well-documented
  pattern with NestJS)

This hybrid approach captures the biggest quality-of-life improvement from
Firebase (dramatically simpler authentication) without the database lock-in. It
is compatible with the MikroORM migration and could be pursued as a separate,
independent improvement.

### Alternative 3: A parallel backend implementation

The Apollo 3 codebase already uses a repository interface pattern: data access
goes through interfaces like `FeatureRepository`, `AssemblyRepository`, etc.,
with concrete implementations behind them. In principle, a Firestore
implementation (or any other backend) could be added alongside the existing
MikroORM implementations, selected by configuration.

In practice, this means maintaining two complete sets of repository
implementations, two sets of tests, and two sets of deployment configurations.
The maintenance burden is roughly double, and subtle behavioral differences
between backends would be a persistent source of bugs. This was attempted during
the transition period of the MikroORM migration (when both MongoDB and
relational code paths existed simultaneously) and the experience confirmed that
dual backends are expensive to maintain.

This approach is only justified if there is a hard requirement to support two
fundamentally different deployment targets (e.g., Firestore for one customer and
PostgreSQL for another). For Apollo 3's use case, the relational model already
covers the full range from desktop to server.

### Recommendation

The MikroORM / relational migration is the strongest single path because it
solves the desktop case, the deployment complexity, the data model challenges,
and the operational cost — all at once. If it cannot proceed, the most pragmatic
alternative is:

1. **Targeted MongoDB fixes** (Phases 1–2 above) to stabilize the existing
   system in the near term
2. **Firebase Auth as a standalone service** to simplify the authentication
   layer independently of the database choice
3. **Revisit the full relational migration** when the desktop / Electron
   requirement becomes active, since no other path addresses it
