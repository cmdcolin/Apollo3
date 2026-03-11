# Firestore / Firebase Evaluation

This document evaluates Google's Firestore and Firebase ecosystem as a potential
database and infrastructure option for Apollo 3. For the core migration
rationale, see
[mikro-orm-migration-justification.md](./mikro-orm-migration-justification.md).
For other alternatives, see
[mikro-orm-alternatives.md](./mikro-orm-alternatives.md).

---

## Overview

Google's Firestore is a managed cloud database that comes with an attractive
ecosystem: built-in authentication (Google, Microsoft, email, and other OAuth
providers), serverless hosting via Firebase Cloud Functions, real-time data
synchronization, and zero infrastructure management.

**Why this is tempting:**

Apollo's current authentication setup is complex — roughly 15 files managing
Passport strategies, JWT tokens, session secrets, and OAuth provider
configuration. Getting Google login working requires creating credentials in the
Google Cloud Console, setting multiple environment variables, and handling
redirect URIs. With Firebase Authentication, all of this is replaced by a hosted
service that handles the entire OAuth flow, token management, and user database
out of the box.

The NestJS server can run on Firebase Cloud Functions, making the entire backend
serverless. The pattern is documented and used in production: NestJS is wrapped
in an Express adapter and exported as a Cloud Function.

**Why this is problematic for Apollo specifically:**

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
  desktop application. Desktop deployment is a first-class goal for Apollo 3,
  currently handled by the MikroORM / SQLite path — which runs fully
  self-contained with no external services. Firestore cannot serve this use
  case, for the same reason MongoDB cannot.

- **Cold start and WebSocket limitations.** Firebase Cloud Functions have
  nontrivial cold starts (NestJS adds to this with its module initialization
  overhead), and they do not support persistent WebSocket connections. Apollo's
  real-time collaboration feature relies on WebSockets. Replacing this with
  Firestore's real-time listeners is possible but would require rearchitecting
  the collaboration layer.

- **Firestore's data model is still document-based.** While Firestore documents
  can be organized in subcollections (avoiding the single-document nesting
  problem), the fundamental trade-offs of a document database remain: no foreign
  keys, no cascade deletes, no joins, and no standard query language.

---

## A Hybrid Option: Firebase Auth Without Firestore

The most compelling part of the Firebase ecosystem for Apollo is the
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
