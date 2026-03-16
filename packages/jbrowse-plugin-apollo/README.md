# jbrowse-plugin-apollo

## E2E Testing with Playwright

Tests are in `pw-tests/` and use Playwright.

### Full E2E run (build + start servers + test + stop)

```bash
pnpm test:e2e
# or equivalently:
bash scripts/e2e-servers.sh test
```

### Run with servers already running

```bash
pnpm playwright test
```

### Run a single test file

```bash
pnpm playwright test pw-tests/deleteFeature.test.ts
```

### Server management

```bash
bash scripts/e2e-servers.sh start    # build + start servers
bash scripts/e2e-servers.sh stop     # stop servers
bash scripts/e2e-servers.sh status   # check server status
bash scripts/e2e-servers.sh logs     # tail server log
```
