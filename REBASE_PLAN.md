# Plan: Rebase mikro-orm branch onto latest origin/main

## Current State

- **Our branch**: `mikro-orm` — 11 commits ahead of merge base `821b5aab`
- **origin/main**: 19 commits ahead of the same merge base
- Key upstream commits we're missing:
  - `dc338bc2` Update tests to work with JBrowse v4 (#749) — **fixes our Cypress
    test failures**
  - `8833ee19` Update packages to use ESM (#753) — significant module system
    change
  - `94c047fb` Enable verbatimModuleSyntax in tsconfig (#759)
  - `94127535` Add CLI command to add features (#748)
  - `86669752` Add ability to query backend with multiple IDs (#741)
  - `3b510e76` Add configurable INDEXED_IDS to add to MongoDB indexedIds (#705)
  - Various bug fixes and feature additions

## Approach: Rebase onto origin/main

### Step 1: Rebase

```
git rebase origin/main
```

Expect conflicts in:

- `packages/apollo-collaboration-server/` (Mongoose code we removed vs new
  features added upstream)
- `packages/apollo-shared/` (Changes classes modified in both branches)
- `packages/apollo-common/` (repository interfaces)
- `package.json` / `tsconfig.json` files (dependency changes)
- `.github/workflows/pull_request.yml` (CI changes)

### Step 2: Resolve conflicts

For each conflict, our intent is:

- **Keep MikroORM/repository pattern** (our changes) over Mongoose code
- **Keep upstream feature additions** (new endpoints, CLI commands, etc.)
- **Keep upstream JBrowse v4 test fixes** (Cypress selector updates)
- **Keep upstream ESM/verbatimModuleSyntax changes** where they don't conflict
- Any new Mongoose-specific code from upstream needs to be **adapted** to use
  the repository pattern

### Step 3: Adapt new upstream features for MikroORM

New features from upstream that touch Mongoose will need adaptation:

- `3b510e76` INDEXED_IDS — may be MongoDB-specific, evaluate if needed for
  MikroORM
- `86669752` Query backend with multiple IDs — check if it uses Mongoose queries
- `691710d2` Fix indexed ID modification/deletion — same
- `94127535` CLI command to add features — may need repository updates

### Step 4: Re-apply our cleanup changes

After rebase, verify our cleanups still apply:

- [ ] apollo-schemas package deleted
- [ ] declare.d.ts deleted
- [ ] Mongoose deps removed from package.json
- [ ] RefSeqChunksModule deleted
- [ ] ObjectId -> randomBytes replacement
- [ ] Validation consolidation
- [ ] cypress-mongodb -> API-based test cleanup
- [ ] MongoDB CI step removed

### Step 5: Verify

```
yarn tsc -b packages/apollo-common
yarn tsc --noEmit -p packages/apollo-shared/tsconfig.json
yarn tsc --noEmit -p packages/apollo-collaboration-server/tsconfig.json
cd packages/apollo-entities && yarn test
yarn test  # Jest tests
# Then try Cypress with JBrowse v4 (should work with upstream fixes)
```

## Risk Assessment

- **High risk**: The ESM migration (`8833ee19`) may interact badly with our
  changes
- **Medium risk**: New MongoDB features need manual adaptation to repository
  pattern
- **Low risk**: JBrowse v4 test fixes, bug fixes — these should merge cleanly

## Alternative: Merge instead of rebase

If rebase is too painful due to 11 commits of our own, consider:

```
git merge origin/main
```

This preserves history but creates a merge commit. Less clean but fewer conflict
resolution rounds.
