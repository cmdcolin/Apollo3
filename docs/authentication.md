# Authentication System

## How it works

Apollo3 uses **cookie-based JWT authentication**. When a user logs in (via
Google, Microsoft, or root), the server issues a signed JWT and stores it
in an HTTP-only cookie called `apollo-token`. Every subsequent request includes
this cookie automatically. The JBrowse plugin uses `credentials: 'same-origin'`
on all fetches, so auth is transparent to the frontend.

Tokens expire after 24 hours. There is no refresh token or server-side session
store — the JWT is self-contained and stateless.

### Cookie security

| Option     | Value                                  |
| ---------- | -------------------------------------- |
| `httpOnly` | `true` (not accessible to JavaScript)  |
| `secure`   | `true` in production, `false` in dev   |
| `sameSite` | `lax` (blocks cross-site POST attacks) |
| `path`     | `/`                                    |
| `maxAge`   | 24 hours                               |

### Change from origin/main

On origin/main, the JBrowse plugin used the JBrowse `InternetAccount`
abstraction — a ~500-line multi-account framework that decoded JWTs client-side,
managed WebSocket lifecycles, and presented a multi-account selection UI.
Because Apollo3 is a single-server application, this was unnecessary complexity.
The `InternetAccount` has been replaced entirely by standard cookie auth with
`credentials: 'same-origin'`. See `docs/internet-account-removal.md` for the
full before/after comparison.

## Login methods

### OAuth (Google and Microsoft)

Configured via environment variables. At least one OAuth provider is recommended
for production deployments.

| Variable                  | Purpose                        |
| ------------------------- | ------------------------------ |
| `GOOGLE_CLIENT_ID`        | Google OAuth2 client ID        |
| `GOOGLE_CLIENT_SECRET`    | Google OAuth2 client secret    |
| `MICROSOFT_CLIENT_ID`     | Microsoft OAuth2 client ID     |
| `MICROSOFT_CLIENT_SECRET` | Microsoft OAuth2 client secret |

Each variable has a `_FILE` suffix variant (e.g. `GOOGLE_CLIENT_ID_FILE`) for
Docker secrets or mounted files. Only one of the pair may be set.


### Root login

**What it is.** A password-based login that creates a synthetic admin user with
email `root_user`. It exists as a last-resort emergency mechanism — if all OAuth
providers are misconfigured, or the admin has locked themselves out, root login
provides a way to regain access.

**Why it might look risky.** A static password in an environment variable feels
like a backdoor. However:

- It is **disabled by default** (`ALLOW_ROOT_USER=false`). The endpoint returns
  401 unless explicitly enabled.
- The password is never stored in the database — it lives only in the
  environment or a mounted file.
- The plaintext `===` comparison against the env var is intentional: hashing an
  environment variable provides no additional security, because an attacker with
  access to the environment already has the password.

**Recommendation.** Use root login only during initial setup or recovery. In
steady-state production, it should remain disabled. If you use it, set a strong
password (32+ characters) and disable it again once a real OAuth admin account
exists.

| Variable                  | Purpose                                             |
| ------------------------- | --------------------------------------------------- |
| `ALLOW_ROOT_USER`         | Enable/disable root login (default: `false`)        |
| `ROOT_USER_PASSWORD`      | The root password                                   |
| `ROOT_USER_PASSWORD_FILE` | Alternative: path to a file containing the password |

## First-time admin setup

When the server starts and finds **no admin user** in the database (excluding
the synthetic root account), it generates a one-time setup URL and
prints it to the server log:

```
========================================================
No admin user found. Use the following URL to set up the
first admin account:

  /auth/setup?token=<64-char-hex>

========================================================
```

The flow:

- An operator with access to the server log opens this URL in a browser
- The server enters "setup mode" (a single boolean flag, held in memory)
- The next person to log in via any method (Google or Microsoft) is
  automatically promoted to Admin
- Setup mode is consumed after one use — the token becomes invalid and the flag
  is cleared

This replaces the behavior on origin/main where the very first user to log in
was silently promoted to admin. The new setup link requires deliberate action by
someone with server access.

If an existing user with role `readOnly` or `none` logs in while setup is
active, they are promoted to Admin.

## Role system

| Role       | Access                                                   |
| ---------- | -------------------------------------------------------- |
| `admin`    | Full access, user management                             |
| `user`     | Read + write annotations                                 |
| `readOnly` | View only (default for new registrations — pending approval) |
| `none`     | Authenticated but no access                              |

Roles are hierarchical: admin inherits all lower roles.

### New user approval workflow

By default (`DEFAULT_NEW_USER_ROLE=readOnly`), every user who registers gets
`readOnly` access immediately and is flagged as `pendingApproval`. This lets
them log in and browse public assemblies, but they cannot create or edit
annotations until an admin approves their account.

The home page shows a banner to pending users explaining their status and
providing the admin's contact email.

Admins review pending users at **Admin → Users**. The Admin nav button shows a
badge with the count of pending users so admins notice new registrations
without visiting the page. A **Pending Approval** section at the top of the
Users page lists only users flagged `pendingApproval=true` — users deliberately
set to `readOnly` by an admin do not appear here. From there an admin can:

- **Approve** — promotes the user to `user` role and clears the pending flag
- **Reject** — deletes the account

After approval the user must log out and back in for the new role to take
effect (JWTs are stateless and valid for 24 hours).

To skip the approval workflow entirely (e.g. a trusted internal deployment),
set `DEFAULT_NEW_USER_ROLE=user`. To tighten it further (no access until
explicitly granted), set `DEFAULT_NEW_USER_ROLE=none`.

### Guard architecture

Two global guards run on every request, in order:

- **JwtAuthGuard** extracts and validates the JWT from the cookie (or
  `Authorization: Bearer` header as a fallback). For `@Public()` endpoints, a
  missing token is allowed (user is `null`).
- **RolesGuard** checks the user's role against the endpoint's requirement.
  Every controller must have a class-level decorator:
  - `@Public()` — no login needed
  - `@Authenticated()` — any role, including `none`
  - `@Roles(Role.User)` — specific minimum role

Missing auth returns 401. Insufficient role returns 403.

## Redirect validation

All login flows that redirect the user (OAuth callbacks) validate
the `redirect_uri` against the server's configured `URL` origin. If the origin
doesn't match (e.g. `redirect_uri=https://evil.com`), the redirect falls back to
the server root. This prevents open-redirect token theft.

On origin/main, the OAuth callback accepted arbitrary redirect URIs with no
validation — a critical vulnerability that has been fixed.

## Changes from origin/main (summary)

| Area                 | origin/main                           | This branch                                                  |
| -------------------- | ------------------------------------- | ------------------------------------------------------------ |
| Auth mechanism       | InternetAccount + JWT header          | HTTP-only cookie                                             |
| First admin          | Silent race (first user wins)         | Explicit setup link from server log                          |
| Root login           | Always accessible if password set     | Gated by `ALLOW_ROOT_USER` flag (default off)                |
| Root password file   | Schema declared but never read        | Fully supported                                              |
| Guest redirect       | Open redirect (no origin check)       | Origin-validated                                             |
| OAuth redirect       | Open redirect (no origin check)       | Origin-validated                                             |
| OAuth callback crash | Crashes if no `redirect_uri` in state | Falls back to server root                                    |
| Cookie security      | No `httpOnly`/`secure`/`sameSite`     | Full cookie hardening                                        |
| JWT secret length    | Any length accepted                   | Minimum 32 characters                                        |
| Role guard           | 5-file `Validations` decorator chain  | Single `RolesGuard` with `@Public`/`@Roles`/`@Authenticated` |
| `getLoginTypes`      | Did not report root                   | Reports all enabled login types                              |
| JWT `role` field     | Optional in shared type               | Required                                                     |
| WebSocket CORS       | `origin: '*'`                         | Locked to server origin                                      |
| JWT in logs          | Full token logged at DEBUG            | Only email + role logged                                     |
