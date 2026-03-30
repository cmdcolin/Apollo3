# Public Data Access

## Overview

Apollo now supports anonymous browsing of public assemblies. Users can view
organisms, assemblies, and open public assemblies in JBrowse without signing in.
Administrators mark assemblies as public via the visibility setting; all other
assemblies remain private and require authentication.

## How it works

### Server: transparent filtering

Read endpoints (`GET /assemblies`, `GET /organisms`, etc.) accept anonymous
requests. The controller checks whether a session is present:

- **Authenticated** — returns all data (same as before)
- **Anonymous** — returns only public assemblies and organisms linked to them

This is handled in the controller with `@Public()` + `@Req()`, branching to
`findAll()` or `findPublic()` at the service level. Individual assembly/organism
detail endpoints (`GET /assemblies/by-name/:name`, `GET /organisms/:id`) are also
public; private assemblies return 403 for anonymous requests.

`GET /users/me` returns `null` (not 401) for anonymous requests, so frontend
pages can check auth state without triggering error handling.

### Frontend: no dual-path logic

Frontend pages (`assemblies.tsx`, `organisms.tsx`, `assembly-detail.tsx`) call the
same endpoints regardless of auth state — the server handles filtering. There are
no `useIsAuthenticated` hooks or endpoint-switching patterns.

The nav bar shows File menu items (Organisms, Assemblies) for all users. Tools and
Admin menus are only shown to authenticated users. A "Sign in" button appears in
the nav for anonymous visitors.

### JBrowse plugin: no login dialog

The JBrowse plugin never auto-shows a login dialog. The server's `config.json`
includes public assemblies for anonymous users, and the plugin simply loads
whatever the server provides. The session initialization is a single synchronous
check:

```
afterCreate() {
  if (hasRole) initializeApolloConnection()  // sets up WebSocket
}
```

Anonymous users can browse public assemblies in JBrowse read-only. An "Apollo >
Sign in" menu item lets them authenticate when ready.

### Sign-in page and return URL

Authentication uses a dedicated `/ui/signin/` page. When a user clicks "Sign in"
from JBrowse, the current URL is saved in `sessionStorage`. After login completes
(OIDC or password), the sign-in page redirects back to the saved URL. This is
secure because `sessionStorage` is same-origin and tab-scoped, and the return URL
is validated to be a relative path.

## Administrator actions

- **Making an assembly public**: Edit the assembly and toggle visibility to
  "public". It immediately becomes browsable without authentication.
- **Making an assembly private**: Toggle visibility back to "private". It
  disappears from anonymous views immediately.
- No server restart or configuration change is required.

## Security model

- Anonymous users have implicit read-only access to public assemblies only
- Private assemblies are never exposed to anonymous requests (403)
- No guest user or synthetic session is created — anonymous means no session
- Write operations (`POST`, `PATCH`, `DELETE`) still require authentication and
  appropriate roles
- The `sessionStorage` return URL is validated to start with `/` to prevent open
  redirects
