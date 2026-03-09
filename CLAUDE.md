# Apollo3 Development Guide

## Package Manager

This repo uses **Yarn PnP** (Plug'n'Play). There is no `node_modules` directory.

**NEVER use `npx`**. Always use `yarn` to invoke commands. With PnP, `npx`
cannot resolve packages.

## Building

```bash
# Build all TypeScript packages
yarn tsc -b

# Build shared package (needed before plugin)
yarn build:shared
```

## Running Tests

### Unit tests (apollo-entities)

```bash
cd packages/apollo-entities && NODE_OPTIONS='--experimental-vm-modules' yarn jest
```

### E2E tests (Cypress)

Cypress is a devDependency of `packages/jbrowse-plugin-apollo`. Always invoke
via yarn:

```bash
# Run all e2e tests (builds plugin, starts servers, runs cypress)
yarn --cwd packages/jbrowse-plugin-apollo test:e2e

# Debug mode (screenshots + video enabled)
yarn --cwd packages/jbrowse-plugin-apollo test:e2e:debug

# Open Cypress interactive UI
yarn --cwd packages/jbrowse-plugin-apollo cypress:open

# Run cypress directly (if servers are already running)
yarn --cwd packages/jbrowse-plugin-apollo cypress:run

# Run a single spec file (servers must already be running)
yarn --cwd packages/jbrowse-plugin-apollo cypress run --browser chrome --spec cypress/e2e/deleteFeature.cy.ts

# Run tests matching a grep pattern (servers must already be running)
yarn --cwd packages/jbrowse-plugin-apollo cypress run --browser chrome --env grep="Delete and resize"

# Start only the e2e servers (without running tests)
yarn --cwd packages/jbrowse-plugin-apollo start:e2e-servers
```

### Running the collaboration server

```bash
yarn --cwd packages/apollo-collaboration-server start
# Or for e2e: yarn --cwd packages/apollo-collaboration-server cypress:start
```

The server must be run via `yarn node dist/main.js` (not bare `node`) for PnP
resolution.

## Linting

```bash
yarn lint
```

## Monorepo Structure

- `packages/apollo-collaboration-server` - NestJS backend
- `packages/apollo-entities` - MikroORM entities + repositories
- `packages/apollo-common` - Shared interfaces (repository interfaces, check
  registry)
- `packages/apollo-mst` - MobX State Tree models
- `packages/apollo-shared` - Shared utilities
- `packages/jbrowse-plugin-apollo` - JBrowse 2 plugin (frontend + Cypress e2e
  tests)
