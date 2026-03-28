# E2E Test Fixes — Next Steps

## Current state

12 of 44 E2E tests pass. The root cause is that the auth system was refactored
from Google/Microsoft-specific Passport strategies to a generic OIDC provider
system, but the JBrowse plugin `LoginDialog.tsx` and E2E test helpers haven't
been updated to match.

## What changed on the server

The `GET /auth/types` endpoint now returns:

```json
{ "oidc": [{ "name": "google", "displayName": "Google" }, ...] }
```

Previously it returned `["google", "microsoft", "root", ...]`.

OAuth login routes changed from `/auth/google`, `/auth/microsoft` to
`/auth/oidc/:provider` with callback at `/auth/oidc/:provider/callback`.

The `root` login type is no longer included in `getLoginTypes()`. Root login
still works via `POST /auth/root` — it just isn't advertised in the types
response.

## What needs to change

### `LoginDialog.tsx` (JBrowse plugin)

- `fetchLoginTypes` parses the response as `string[]` — needs to handle the
  new `{ oidc: OidcProviderInfo[] }` shape
- OAuth buttons use `handleOAuthLogin('google')` which builds a URL to
  `/auth/login?type=google` — needs to point to `/auth/oidc/:provider` instead
- Root login form checks `loginTypes.includes('root')` — since root is no
  longer in the types response, the form should be shown unconditionally (the
  `POST /auth/root` endpoint returns 401 if disabled, so the UI can just try
  and show an error) or `getLoginTypes` should include `allowRootUser: true`

### `client/src/index.tsx` (server admin UI)

Already updated by the user to use the new OIDC format. The `RootLoginForm`
component was removed during the refactor — needs to be re-added if root login
UI is desired on the admin page.

### `pw-tests/helpers.ts`

- `getRootToken()` calls `POST /auth/root` — this still works, no change needed
- `loginAsRoot()` fills a "Root password" field and clicks "Sign in as Root" —
  this depends on the LoginDialog rendering the root form. Once LoginDialog is
  fixed, this should work

### `pw-tests/login.test.ts`

- Tests the root login flow via the UI — depends on LoginDialog fix

### E2E server startup

- `e2e-servers.sh` and `package.json` `e2e:start` may need `ALLOW_ROOT_USER=true`
  and `ROOT_USER_PASSWORD=password` — verify these are set (they come from
  `.development.env`)

### `getLoginTypes()` in `authentication.service.ts`

Consider adding `allowRootUser: boolean` to the response so the frontend knows
whether to show the root password form:

```typescript
getLoginTypes() {
  return {
    oidc: this.oidcService.getProviderNames(),
    allowRootUser: this.configService.get('ALLOW_ROOT_USER', { infer: true }),
  }
}
```

## Likely non-issues

- MST detachment errors (`OntologyRecord` not part of state tree) — pre-existing,
  not related to auth changes
- `net::ERR_ABORTED` on chunk loads — likely flaky test timing, not auth-related
- `visualGeneModel.test.ts` screenshot mismatch — visual regression, unrelated
