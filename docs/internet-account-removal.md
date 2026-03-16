# InternetAccount Removal

## Summary

Removed the `ApolloInternetAccount` JBrowse plugin abstraction, replacing it
with direct cookie-based authentication and session-level connection management.
This eliminates ~500 lines of indirection, removes the multi-account UI, and
simplifies the client-server authentication flow.

## Motivation

Apollo3 previously used JBrowse's `InternetAccount` system to manage the
connection to the collaboration server. This system was designed for
multi-provider authentication (Google, Microsoft, guest) with JWT tokens stored
in browser sessionStorage and sent as Authorization headers.

After migrating to cookie-based authentication (HTTP-only cookies set by the
server), the InternetAccount became redundant:

- The `CollaborationServerDriver.fetch()` method already used
  `credentials: 'same-origin'` and ignored the InternetAccount for actual HTTP
  calls
- Cookie auth is handled transparently by the browser — no manual token
  management needed
- The multi-account selection UI added complexity for a feature no deployment
  uses (Apollo3 is always single-server)

## What Changed

### Server (`apollo-collaboration-server`)

The `config.json` endpoint now includes `baseURL`, `role`, and `userId` directly
in the `ApolloPlugin` configuration:

```json
{
  "configuration": {
    "ApolloPlugin": {
      "hasRole": true,
      "baseURL": "http://localhost:3999",
      "role": "admin",
      "userId": "abc123",
      "ontologies": [...]
    }
  },
  "assemblies": [...]
}
```

Previously these values were either in a separate `internetAccounts` array
(baseURL) or decoded from a JWT token on the client (role, userId).

The `internetAccounts` array is no longer included in the server response.
Assembly metadata no longer includes `internetAccountConfigId` — just
`apollo: true` to identify collaboration-server assemblies.

### Plugin (`jbrowse-plugin-apollo`)

**Deleted:** The entire `src/ApolloInternetAccount/` directory (6 files):

- `model.ts` — MST model with OAuth flow, WebSocket, change tracking
- `configSchema.ts` — baseURL and tokenType configuration
- `components/AuthTypeSelector.tsx` — Login method picker dialog
- `components/LoginButtons.tsx` — Google/Microsoft/Guest buttons
- `components/LoginIcons.tsx` — SVG brand icons
- `index.ts` — exports

**Moved to session model (`session.ts`):**

- WebSocket (socket.io) connection management
- Change sequence tracking (`lastChangeSequenceNumber`)
- `getMissingChanges()` — fetches changes missed during disconnection
- `updateLastChangeSequenceNumber()` — syncs with server
- `addSocketListeners()` — listens for real-time changes on COMMON channel
- `initializeApolloConnection()` — sets up WebSocket and admin menus based on
  role
- Admin menu registration (previously in InternetAccount's `initialize()`)

**New utility functions (`util/index.ts`):**

- `getBaseURL(session)` — reads baseURL from plugin config
- `getRole(session)` — reads role from plugin config
- `getUserId(session)` — reads userId from plugin config
- `apolloFetch(url, init?)` — `fetch()` wrapper with
  `credentials: 'same-origin'`

**Simplified components (~15 files):**

- Removed multi-account selection dropdowns from all admin dialogs
- Replaced `internetAccount.getFetcher()` with `apolloFetch()`
- Replaced `internetAccount.baseURL` with `getBaseURL(session)`
- Replaced `internetAccount.role` with `getRole(session)`
- Removed `internetAccountId` from `ChangeManager.submit()` options

**Display state models (3 files):**

- Replaced `apolloInternetAccount` getter (which looked up the InternetAccount
  from the root model) with a simple `role` getter that reads from plugin config

### Shared packages

- `apollo-common`: Removed `internetAccounts` and `getInternetAccount()` from
  the `ClientDataStore` interface
- `apollo-shared`: Updated `filterJBrowseConfig()` to strip server-generated
  fields (`baseURL`, `role`, `userId`) instead of filtering
  `ApolloInternetAccount` entries

### E2E tests

- Removed sessionStorage token injection from `loginAsGuest()` — only the
  HTTP-only cookie is needed now
- Removed token re-injection logic from `addAssemblyFromGff()`

## Impact

| Metric | Before | After |
| --- | --- | --- |
| ApolloInternetAccount files | 6 | 0 |
| Lines in InternetAccount model | ~430 | 0 |
| Multi-account UI code | ~200 lines across 6 components | 0 |
| Auth mechanisms | Cookie + JWT token + Authorization header | Cookie only |
| Plugin bundle size | 1.57 MB | 1.56 MB |

## Login Flow (Current)

1. User navigates to JBrowse with Apollo plugin
2. Plugin reads `baseURL` from `ApolloPlugin` configuration
3. Session fetches `${baseURL}/jbrowse/config.json` with cookie credentials
4. If authenticated: server returns config with `role` and assemblies
5. If not authenticated: server returns minimal config without assemblies
6. User can log in via the Apollo menu (guest login clears/sets cookie and
   reloads)
7. After config loads, session initializes WebSocket and admin menus based on
   role

## Backwards Compatibility

- The `apollo: true` flag in assembly metadata (used to identify
  collaboration-server assemblies) was already present and is retained
- The `internetAccountConfigId` field in assembly metadata is no longer
  generated by the server; client code no longer checks for it
- Existing deployments need to update their initial `jbrowse_config.json` to
  move `baseURL` from `internetAccounts` to `configuration.ApolloPlugin.baseURL`
