# CI/Test Migration: MongoDB -> MikroORM/SQLite

## Overview

Migrating CI workflows and test infrastructure from MongoDB to MikroORM/SQLite.

## Tasks

### 1. Remove boilerplate e2e test

- [x] Delete `test/app/app.e2e-spec.ts` (tests `/auth/login` and `/profile`
      which don't exist)

### 2. Update Cypress test infrastructure

- [x] Replace `cypress-mongodb` with API-based test setup/teardown
  - [x] `deleteAssemblies()` -> GET `/assemblies` then POST `/changes` with
        `DeleteAssemblyChange` for each
  - [x] `addOntologies()` -> POST `/changes` with `ImportJBrowseConfigChange`
- [x] Remove `cypress-mongodb` from devDependencies
- [x] Update `cypress.config.js` to remove mongodb plugin
- [x] Update `cypress/support/e2e.ts` to remove mongodb commands import

### 3. Update CI workflow (`pull_request.yml`)

- [x] Remove `Start MongoDB` step (supercharge/mongodb-github-action)
- [x] Server now uses SQLite by default (from .development.env), no MongoDB
      needed

### 4. Migration script

- [x] Fixed import path (`@apollo-annotation/entities/mikro-orm.config` ->
      `@apollo-annotation/entities`)
- [x] `mongodb` kept as devDependency of collab-server (needed by migration
      script)

### 5. Package.json scripts

- [x] Removed `MONGODB_URI` from `cypress:start` and `test:cli:start` scripts

## Changes summary

### Files deleted

- `packages/apollo-schemas/` (entire package)
- `packages/apollo-collaboration-server/src/declare.d.ts`
- `packages/apollo-collaboration-server/src/refSeqChunks/` (empty module)
- `packages/apollo-collaboration-server/test/app/app.e2e-spec.ts`

### Cypress commands updated (API-based reset)

- `deleteAssemblies()`: GET `/auth/guest` for token, GET `/assemblies`, POST
  `/changes` with `DeleteAssemblyChange` per assembly
- `addOntologies()`: POST `/changes` with `ImportJBrowseConfigChange`

### Dependencies removed

- `@apollo-annotation/schemas` (from 3 packages)
- `mongoose`, `@nestjs/mongoose`, `connect-mongodb-session`,
  `mongoose-id-validator` (from collab-server)
- `cypress-mongodb` (from jbrowse-plugin-apollo)
- `mongodb` moved from devDependencies to devDependencies only (kept for
  migration script)

### Code changes

- ObjectId from `mongodb` replaced with `randomBytes(12).toString('hex')` from
  `node:crypto`
- Validation classes consolidated (apollo-shared re-exports from apollo-common)
- Unused `_topLevel` param removed from `FeaturesService.findById()`

## Remaining work (future)

- Run full Cypress suite to verify API-based cleanup works end-to-end
- Consider removing migration script once migration period is over
- `build:shared` script in collab-server may need updating if build order
  changes
