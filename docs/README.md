# Apollo3 Refactoring Proposal

Colin Diesh

AI disclaimer: I used AI to generate this document. I manually reviewed most of
the text in this document but it is AI generated so it could contain mistakes. I
am not normally a fan of using AI to write but I found it helpful to keep track
of all the sweeping changes that were made. Claude Code was also extensively
used during the refactoring.

## Intro

This document describes a large proposal to make new features and improvements
for Apollo 3. However, due to its size and change to the data model and schema,
it could be seen as disruptive. Despite this, my hope is that this change will
expand functionality, improve user experience, improve developer velocity, and
help expand Apollo3 deployment options going forward.

Some context on how this came about: the original goal was desktop/Electron
support, which I tried to accomplish by targeting SQLite — to avoid limiting
desktop users to in-memory-only annotation. Initially, SQLite via MikroORM was
added as a separate backend alongside MongoDB. However, maintaining two parallel
backends roughly doubled the testing and maintenance burden, and the two code
paths kept diverging. At a fork in the road, the decision was made to commit
fully and make MikroORM the primary system replacing MongoDB, rather than
keeping both indefinitely. This turned the desktop effort into a larger
refactoring, but it made the SQLite story complete — one data layer that works
across desktop, development, and production — rather than a second-class backend
that would always lag behind.

**Database migration (MongoDB to MikroORM).** On origin/main, we use MongoDB to
serve Apollo 3. In the MongoDB data model, an entire gene is packed into a
single MongoDB document. Now each feature and subfeature is given its own
database row. This simplifies the server code significantly — most edit
operations go from 30+ lines of nested-document tree navigation down to a few
targeted row updates. It also means the database itself enforces data
relationships via foreign keys and cascade deletes, rather than relying on
application code to keep things consistent (e.g. the manually maintained
`allIds` arrays on every gene). See
[From MongoDB to Relational Databases](#from-mongodb-to-relational-databases)
for the full rationale and tradeoff analysis.

**Simplified developer setup.** On origin/main, the dev container configures a
MongoDB replica set (required because MongoDB transactions only work with
replica sets) and development requires 4 parallel processes. With this proposed
refactoring, `pnpm install && pnpm start` is the complete setup — it creates a
SQLite database on the fly with no external dependencies.

**Simplified production deployment.** On origin/main, production deployment
requires a MongoDB replica set (minimum two database containers, init scripts,
extra Docker volumes, and an elevated transaction timeout setting). With this
change, a single PostgreSQL container is sufficient, or SQLite for smaller
deployments. Without analysis tools enabled, hosting could potentially run on a
nano-sized instance. Analysis tools (BLAST, BLAT, miniprot, Tiberius) are more
resource-intensive and would increase hosting requirements when enabled.

**Desktop/Electron deployment.** SQLite has no server process requirement,
enabling fully self-contained desktop deployment — something not possible with
MongoDB.

**Per-assembly storage and permissions.** On origin/main, a single config.json
holds every assembly and track and is served to all users with no access
control. This limits scalability to large numbers of organisms. Now each
assembly and track is its own record, and the server generates config.json per
request filtered by user permissions. Assemblies can be public or private with
per-user roles.

**Multi-page application.** On origin/main, all of Apollo3's UI (admin panels,
organism management, user management) is packed into the JBrowse plugin itself.
This makes the plugin heavy and makes it difficult to add new pages or
workflows. This proposed refactoring moves to a multi-page Vite application
where the JBrowse is one page among several. This allows lightweight,
purpose-built pages.

**Analysis tool integration.** Added a generic server-side analysis framework
with five built-in runners: local BLAST, NCBI remote BLAST, BLAT, miniprot, and
Tiberius (deep learning gene prediction). Each tool has its own database type,
job queue, and results renderer. New tools can be added by implementing a single
runner interface and registering it — no changes to the job or API layer are
required.

**Per-gene history tracking.** On origin/main, Apollo3's change log is a global
stream with no way to query the history of a single gene — a capability Apollo2
had. This adds an indexed `geneId` column to the change log and a Recent Changes
UI page with per-gene lookup.

**Performance.** 7-20x speedups across import, query, gff3 export, etc. The
largest win (20x) came from discovering that on origin/main, every
`GET /features/getFeatures` call deletes and re-computes all quality check
results for every feature in the viewport — even when nothing has changed. Code
citations from origin/main proving this are included in
[Performance Fix Discovered During Migration](#performance-fix-discovered-during-migration)
and [Performance Optimization Report](#performance-optimization-report).

**Security.** Fixed 7 pre-existing vulnerabilities including an open redirect
for OAuth token theft, missing cookie security flags, and a WebSocket CORS
wildcard. Code citations from origin/main are included in
[Authentication & Security Audit](#authentication--security-audit). Also
significantly simplified the auth setup by not using InternetAccounts and
instead using standard cookie and JWT workflows.

**Bug fixes.** Found and fixed 3 pre-existing bugs on origin/main: check results
being iterated as features, a refSeq delete that deleted the wrong scope, and a
user location endpoint that sent garbled data on every update.

**API simplification.** The REST API was consolidated from a mix of ad-hoc
routes into clean CRUD patterns. Assembly routes went from 6 to 5 by merging
single-purpose PATCH endpoints into one unified update route. Six JBrowse plugin
dialogs (AddAssembly, ManageChecks, ManageUsers, etc.) were deleted and replaced
by lightweight Vite admin pages. The CLI was cleaned up by removing a deprecated
`localhostToAddress` hack from 24 files and adding a `--features-only` flag for
loading GFF3 annotations without sequence data. Integration tests now cover the
full workflow end-to-end.
