# Apollo3 Architecture Refactoring Report

## What We Delivered

Apollo3 is a collaborative genome annotation editor built on JBrowse 2. This
document describes architectural changes that expanded where and how Apollo3
can be deployed.

**Database migration (MongoDB → MikroORM).** Previously, an entire gene was
packed into a single MongoDB document. Every edit rewrote the whole gene, and
two annotators editing different exons could silently overwrite each other. Now
each feature is its own database row — edits touch only what they change, and
concurrent edits to different features no longer risk overwriting each other.

**Simplified dev and production setup.** MongoDB required multiple Docker
containers and orchestration scripts even for local development. Now SQLite is
the default: `pnpm install && pnpm start` is the complete setup. For
production, PostgreSQL needs only one container. This can reduce hosting costs
and operational burden.

**Per-assembly storage and permissions.** Previously, a single config document
held every assembly and track with no access control. Now each is its own
record, and the server generates config per request filtered by user
permissions. Assemblies can be public or private with per-user roles, enabling
multi-team deployments on shared infrastructure.

**Multi-page application.** Previously, all of Apollo3's UI — admin panels,
organism management, user management — was packed into the JBrowse plugin
itself. This made the plugin heavy and made it difficult to add new pages or
workflows. We moved to a multi-page Vite application where JBrowse is one page
among several. This allows lightweight, purpose-built pages: a BLAST search
portal, an assembly management dashboard, organism and user admin pages, and
a recent changes feed with per-gene history tracking.

**Analysis tool integration.** Added a generic server-side analysis framework
with four built-in runners: local BLAST, NCBI remote BLAST, BLAT, and
miniprot. Each tool has its own database type, job queue, and results renderer.
New tools can be added by implementing a single runner interface and registering
it — no changes to the job or API layer are required.

**Performance.** 7-20x speedups across import, query, export, and delete. The
largest win (20x): quality checks were re-running on every pan/zoom even when
nothing changed. Checks now run only after edits.

**Security.** Fixed 7 pre-existing vulnerabilities including an open redirect
for OAuth token theft, missing cookie security flags, and a WebSocket CORS
wildcard.

**Code simplification.** Removed redundant abstraction layers, consolidated
WebSocket channels, reduced developer setup from 4 parallel processes to 1, and
eliminated legacy Mongoose schema packages.
