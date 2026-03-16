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

**Database migration (MongoDB to MikroORM).** On origin/main, we use MongoDB to
serve Apollo 3. In the MongoDB data model, an entire gene is packed into a
single MongoDB document. Now each feature and subfeature is given its own
database row. This simplifies the server code significantly — most edit
operations go from 30+ lines of nested-document tree navigation down to a few
targeted row updates. It also means the database itself enforces data
relationships via foreign keys and cascade deletes, rather than relying on
application code to keep things consistent (e.g. the manually maintained
`allIds` arrays on every gene). See _From MongoDB to Relational Databases_ for
the full rationale and tradeoff analysis.

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
largest win (20x) came from quality checks that were re-running on every
pan/zoom even when nothing had changed.

**Security.** Fixed 7 pre-existing vulnerabilities including an open redirect
for OAuth token theft, missing cookie security flags, and a WebSocket CORS
wildcard. Also significantly simplified the auth setup by not using
InternetAccounts and instead leverages just 'normal' auth workflows using
cookies and JWT.

**Bug fixes.** Found and fixed 3 pre-existing bugs on origin/main: check results
being iterated as features, a refSeq delete that deleted the wrong scope, and a
user location endpoint that sent garbled data on every update.
