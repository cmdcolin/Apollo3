# InternetAccount Removal

## Change

Removed the `ApolloInternetAccount` JBrowse plugin abstraction (~500 lines, 6
files). Replaced with direct cookie-based auth and session-level connection
management.

## Why

After migrating to cookie-based auth (HTTP-only cookies), the InternetAccount
was redundant:

- `CollaborationServerDriver.fetch()` already used `credentials: 'same-origin'`
- Cookie auth is handled transparently by the browser
- Multi-account selection UI added complexity for a feature no deployment uses
  (Apollo3 is single-server)

## What Moved Where

| Concern | Before | After |
|---------|--------|-------|
| WebSocket management | `ApolloInternetAccount/model.ts` | Session model (`session.ts`) |
| Change sequence tracking | `ApolloInternetAccount/model.ts` | Session model |
| `baseURL`, `role`, `userId` | JWT token decode + `internetAccounts` config | `ApolloPlugin` config in `config.json` |
| API calls | `internetAccount.getFetcher()` | `apolloFetch()` with `credentials: 'same-origin'` |
| Multi-account UI | ~200 lines across 6 components | Deleted |

## Login Flow (Current)

1. Plugin reads `baseURL` from `ApolloPlugin` configuration
2. Session fetches `${baseURL}/jbrowse/config.json` with cookie credentials
3. Server returns config with `role`, `userId`, and assemblies (if authenticated)
4. Session initializes WebSocket and admin menus based on role

## Impact

| Metric | Before | After |
|--------|--------|-------|
| InternetAccount files | 6 | 0 |
| Auth mechanisms | Cookie + JWT + Authorization header | Cookie only |
| Plugin bundle | 1.57 MB | 1.56 MB |
