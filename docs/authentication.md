# Authentication & Authorization

## Overview

Apollo3 supports three authentication methods:

- **OIDC (OpenID Connect)** — the primary method for production. Works with
  Google, Microsoft, Keycloak, Auth0, Okta, institutional identity providers,
  and any other standard OIDC-compliant provider.
- **Password login (invite-based)** — admin creates a user and shares an invite
  link; the user sets their own password. Matches the Apollo2 workflow where
  admins control access directly. See `docs/password-authentication.md` for
  details.
- **REMOTE_USER (trusted header)** — for deployments behind a reverse proxy that
  handles authentication (e.g. Apache with Shibboleth, nginx with LDAP/CAS).

All methods can coexist — e.g. OIDC for most users, password login for users
without institutional SSO, and REMOTE_USER behind a reverse proxy.

## What is OIDC?

OpenID Connect is an identity layer built on top of OAuth 2.0. Instead of
implementing custom login flows for each identity provider (Google, Microsoft,
Keycloak, etc.), OIDC provides a single standardized protocol that works with
all of them.

The flow:

- User clicks "Sign in with {Provider}" on the Apollo login page
- Browser is redirected to the provider's login page (e.g. Google)
- User authenticates with the provider
- Provider redirects back to Apollo with an authorization code
- Apollo exchanges the code for tokens and extracts the user's email and name
- Apollo issues its own JWT and stores it in an HTTP-only cookie

**Why OIDC instead of provider-specific OAuth?** Earlier versions of Apollo3
had hard-coded Google and Microsoft passport strategies — separate npm packages,
separate strategy classes, separate guards, each with their own quirks. OIDC
replaces all of this with a single generic implementation that works with any
compliant provider. Adding a new provider is pure configuration — no code
changes required.

Apollo uses the `openid-client` library, which handles OIDC discovery
automatically. When the server starts, it fetches each provider's
`.well-known/openid-configuration` endpoint to learn the authorization,
token, and userinfo URLs.

## Configuration

### OIDC providers

Set `OIDC_PROVIDERS` (or `OIDC_PROVIDERS_FILE` for Docker secrets) to a JSON
array of provider configurations:

```bash
OIDC_PROVIDERS='[
  {
    "name": "google",
    "displayName": "Google",
    "issuerUrl": "https://accounts.google.com",
    "clientId": "your-google-client-id",
    "clientSecret": "your-google-client-secret"
  },
  {
    "name": "keycloak",
    "displayName": "Institutional Login",
    "issuerUrl": "https://keycloak.example.edu/realms/myrealm",
    "clientId": "apollo",
    "clientSecret": "your-keycloak-client-secret"
  }
]'
```

Each provider object supports:

| Field          | Required | Description                                         |
| -------------- | -------- | --------------------------------------------------- |
| `name`         | yes      | URL-safe identifier (used in `/auth/oidc/{name}`)   |
| `issuerUrl`    | yes      | The OIDC issuer URL (must have a `.well-known/openid-configuration`) |
| `clientId`     | yes      | OAuth2 client ID from the provider                  |
| `clientSecret` | yes      | OAuth2 client secret                                |
| `displayName`  | no       | Label shown on the login button (defaults to `name`) |
| `scope`        | no       | OIDC scopes (defaults to `openid email profile`)    |

**Common issuer URLs:**

| Provider    | Issuer URL                                              |
| ----------- | ------------------------------------------------------- |
| Google      | `https://accounts.google.com`                           |
| Microsoft   | `https://login.microsoftonline.com/{tenant-id}/v2.0`    |
| Keycloak    | `https://your-host/realms/{realm}`                      |
| Auth0       | `https://your-tenant.auth0.com`                         |
| Okta        | `https://your-org.okta.com`                             |
| GitLab      | `https://gitlab.com`                                    |

**Callback URL:** When registering Apollo with your OIDC provider, set the
callback/redirect URL to `{APOLLO_URL}/auth/oidc/{name}/callback`
(e.g. `https://apollo.example.edu/auth/oidc/google/callback`).

### REMOTE_USER (trusted header)

For deployments behind a reverse proxy that handles authentication (Shibboleth,
CAS, LDAP, etc.), set `REMOTE_USER_HEADER` to the header name your proxy uses:

```bash
REMOTE_USER_HEADER=X-Remote-User
```

When this is set:

- The middleware reads the header value on every request
- If the user doesn't have a JWT cookie yet, they're automatically logged in
  using the header value as both their username and email
- A new user record is created on first visit
- Subsequent requests use the JWT cookie (the header is not re-checked until
  the cookie expires)

**Security:** The proxy _must_ strip this header from incoming client requests
to prevent spoofing. This is standard practice for reverse proxy auth — see
your proxy's documentation for how to enforce this.

REMOTE_USER can be combined with OIDC. Users behind the proxy are
auto-authenticated; users accessing directly see the OIDC login page.

## How authentication works internally

Apollo uses **cookie-based JWT authentication**:

- When a user logs in (OIDC, REMOTE_USER, or password), the server issues a
  signed JWT and stores it in an HTTP-only cookie called `apollo-token`
- Every subsequent request includes this cookie automatically
- The `JwtAuthGuard` extracts and verifies the token, then looks up the user's
  current role from the database (roles are never read from the JWT payload)
- If the user has been deleted, the guard returns 401

### Sliding window sessions

The JWT expires after 7 days, but a **sliding window interceptor** re-stamps
the cookie on every authenticated request. This means the 7-day expiry resets
on every visit — users stay logged in as long as they use the site at least
once a week. They only need to re-login after 7 days of complete inactivity.

### Cookie security

| Option     | Value                                  |
| ---------- | -------------------------------------- |
| `httpOnly` | `true` (not accessible to JavaScript)  |
| `secure`   | `true` in production, `false` in dev   |
| `sameSite` | `lax` (blocks cross-site POST attacks) |
| `path`     | `/`                                    |
| `maxAge`   | 7 days (reset on each request)         |

### Rate limiting

A global rate limit of 100 requests per minute applies to all endpoints. The
root login endpoint has a tighter limit of 5 requests per minute.

## First-time admin setup

When the server starts and finds no admin user in the database, it prints a
one-time setup URL to stdout:

```
SETUP_TOKEN=a3f9...
[start] Setup URL (create first admin account): https://apollo.example.org/auth/setup?token=a3f9...
```

The operator reads this from the server logs and visits the URL. The flow:

- Operator opens the URL — the server activates "setup mode" and the browser
  lands on the account-creation form
- Operator fills in email, display name, and password
- The server creates the account with a bcrypt-hashed password and admin role
- Setup mode is consumed: the token is invalidated and the endpoint rejects all
  further requests

**How to read the log in common environments:**

| Environment | Command |
| ----------- | ------- |
| Docker | `docker logs <container>` |
| systemd | `journalctl -u apollo` |
| Kubernetes | `kubectl logs <pod>` |
| Heroku / Railway / Render | Dashboard log stream |

The `SETUP_TOKEN=` line is intentionally machine-readable for automated
provisioning scripts. A new token is generated each time the server restarts
without an admin account (in-memory only — old tokens from previous boots are
forgotten).

## Role system

| Role       | Access                                                       |
| ---------- | ------------------------------------------------------------ |
| `admin`    | Full access, user management                                 |
| `user`     | Read + write annotations                                     |
| `readOnly` | View only (default for new registrations — pending approval) |
| `none`     | Authenticated but no access                                  |

Roles are hierarchical: admin inherits all lower roles. Role changes take
effect immediately (the guard checks the database on every request, not the
JWT payload).

### New user approval workflow

By default (`DEFAULT_NEW_USER_ROLE=readOnly`), new users get `readOnly` access
and are flagged as `pendingApproval`. Admins review pending users at
**Admin → Users** and can approve (promote to `user`) or reject (delete).

To skip the approval workflow (e.g. a trusted internal deployment), set
`DEFAULT_NEW_USER_ROLE=user`. To require explicit approval for all access, set
`DEFAULT_NEW_USER_ROLE=none`.

### Guard architecture

Two global guards run on every request:

- **JwtAuthGuard** — extracts the JWT from the cookie (or `Authorization:
  Bearer` header), verifies it, and looks up the current role from the database.
  For `@Public()` endpoints, a missing token is allowed.
- **RolesGuard** — checks the user's role against the endpoint's requirement.
  Every controller must have a class-level decorator — just pick one of two:
  - `@Public()` — no login needed
  - `@Roles(Role.ReadOnly | Role.User | Role.Admin)` — specific minimum role
    (use `@Roles(Role.None)` for any authenticated user regardless of role)

Missing auth returns 401. Insufficient role returns 403.

## Redirect validation

All OIDC callbacks validate the `redirect_uri` against the server's configured
`URL` origin. Unrecognized origins are rejected and the redirect falls back to
the server root. This prevents open-redirect attacks.

In development, set `ALLOWED_REDIRECT_ORIGINS=http://localhost:5173` to allow
post-login redirects back to the Vite dev server.

## Environment variable reference

| Variable                   | Required | Description                                          |
| -------------------------- | -------- | ---------------------------------------------------- |
| `OIDC_PROVIDERS`           | no       | JSON array of OIDC provider configs                  |
| `OIDC_PROVIDERS_FILE`      | no       | Path to a file containing the JSON array             |
| `REMOTE_USER_HEADER`       | no       | HTTP header name for trusted reverse proxy auth      |
| `ALLOW_PASSWORD_LOGIN`     | no       | Enable email/password login (default: `true`; set `false` for OIDC-only deployments) |
| `JWT_SECRET`               | yes*     | Secret for signing JWTs (min 32 chars)               |
| `JWT_SECRET_FILE`          | yes*     | Path to file containing JWT secret                   |
| `SESSION_SECRET`           | yes*     | Secret for express-session (min 32 chars)            |
| `SESSION_SECRET_FILE`      | yes*     | Path to file containing session secret               |
| `DEFAULT_NEW_USER_ROLE`    | no       | Role for new users: `admin`, `user`, `readOnly` (default), `none` |
| `ALLOWED_REDIRECT_ORIGINS` | no       | Comma-separated list of allowed redirect origins     |

\* One of the pair (value or file) must be set.
