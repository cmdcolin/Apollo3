# InternetAccount Removal

## Change

Removes the `ApolloInternetAccount` JBrowse plugin abstraction (~500 lines, 6
files). Replaces it with direct cookie-based auth and session-level connection
management.

## Why

With cookie-based auth (HTTP-only cookies), the InternetAccount becomes
redundant:

- `CollaborationServerDriver.fetch()` already uses `credentials: 'same-origin'`
- Cookie auth is handled transparently by the browser
- Multi-account selection UI adds complexity for a feature no deployment uses
  (Apollo3 is single-server)

## What Moved Where

| Concern                     | Current (origin/main)                        | Proposed                                          |
| --------------------------- | -------------------------------------------- | ------------------------------------------------- |
| WebSocket management        | `ApolloInternetAccount/model.ts`             | Session model (`session.ts`)                      |
| Change sequence tracking    | `ApolloInternetAccount/model.ts`             | Session model                                     |
| `baseURL`, `role`, `userId` | JWT token decode + `internetAccounts` config | `ApolloPlugin` config in `config.json`            |
| API calls                   | `internetAccount.getFetcher()`               | `apolloFetch()` with `credentials: 'same-origin'` |
| Multi-account UI            | ~200 lines across 6 components               | Deleted                                           |

## Login Flow (Proposed)

1. Plugin reads `baseURL` from `ApolloPlugin` configuration
2. Session fetches `${baseURL}/jbrowse/config.json` with cookie credentials
3. Server returns config with `role`, `userId`, and assemblies (if
   authenticated)
4. Session initializes WebSocket and admin menus based on role

## Impact

| Metric                | Current (origin/main)               | Proposed    |
| --------------------- | ----------------------------------- | ----------- |
| InternetAccount files | 6                                   | 0           |
| Auth mechanisms       | Cookie + JWT + Authorization header | Cookie only |
| Plugin bundle         | 1.57 MB                             | 1.56 MB     |
