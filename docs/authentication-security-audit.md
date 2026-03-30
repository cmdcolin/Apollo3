# Authentication & Security Audit

Two rounds of audits covering authentication, controllers, data handling, and
injection surfaces on origin/main. All critical/high issues addressed in this
branch.

## Issues Found and Fixed

| #   | Severity | Issue                                                                                                                         | Fix                                                                      |
| --- | -------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1   | CRITICAL | **Open redirect** — OAuth callback accepts arbitrary `redirect_uri`, allowing token theft via `redirect_uri=https://evil.com` | Validate origin against configured `URL` env var                         |
| 2   | CRITICAL | **Missing Secure flag** — session cookie set without `secure: true`                                                           | `secure: true` when `NODE_ENV=production`                                |
| 3   | HIGH     | **WebSocket CORS wildcard** — `cors: { origin: '*' }` on WebSocket gateway                                                    | Locked to server's configured `URL` origin                               |
| 4   | HIGH     | **JWT logged in plaintext** — full token logged at DEBUG level                                                                | Log only email and role                                                  |
| 5   | HIGH     | **Root login backdoor removed** — `POST /auth/root` accepted a static plaintext server password to log in as a synthetic admin user with no audit trail, loose rate-limiting (100 req/min vs 10 for regular login), and no bcrypt hashing | Endpoint and all supporting config (`ALLOW_ROOT_USER`, `ROOT_USER_PASSWORD`) removed. First-admin bootstrapping now uses the one-time setup token flow, which is consumed on first use and creates a real account with a bcrypt-hashed password. |
| 6   | BUG      | **OAuth client ID file-read** — file contents overwritten by file path (`microsoftClientID = clientIDFile?.trim()`)           | Correctly read and trim file contents                                    |
| 7   | MEDIUM   | **Session cookies lacked security options** — no `httpOnly`, `secure`, `sameSite`, `maxAge`                                   | Added `httpOnly: true`, `secure: true`, `sameSite: 'lax'`, `maxAge: 24h` |
| 8   | MEDIUM   | **No minimum secret length** — single-char secrets accepted                                                                   | Require 32+ characters for `JWT_SECRET` and `SESSION_SECRET`             |

### Code citations (origin/main)

**Open redirect** — `authentication.controller.ts` passes the `redirect_uri`
query parameter directly through to the OAuth flow without validating it against
the server's configured URL:

```typescript
// authentication.controller.ts — handleLogin()
const url = redirect_uri
  ? `${type}?${new URLSearchParams({ redirect_uri }).toString()}`
```

**WebSocket CORS wildcard** — `messages.gateway.ts` accepts connections from any
origin:

```typescript
// messages.gateway.ts
@WebSocketGateway({ cors: { origin: '*' } })
```

**Session cookie without Secure flag** — `main.ts` configures express-session
without cookie security options:

```typescript
// main.ts
app.use(
  session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: new MongoDBStore({ uri: mongodbURI, collection: 'expressSessions' }),
    // no cookie options — defaults to insecure
  }),
)
```

**JWT logged in plaintext** — `authentication.service.ts` logs the full token:

```typescript
// authentication.service.ts
this.logger.debug(
  `First time login successful. Apollo token: ${JSON.stringify(returnToken)}`,
)
```

## Frontend Auth Gating

Write actions (adding features, creating annotations) and analysis tools are
hidden from unauthenticated and read-only users in the UI. Previously some of
these actions were visible but would silently fail.

## Additional Hardening (post-audit)

| # | Issue | Fix |
| - | ----- | --- |
| 9 | **Invite tokens never expire** — tokens valid indefinitely | Added `inviteTokenCreatedAt` field; `acceptInvite()` rejects tokens older than 7 days |
| 10 | **No server-side password length validation** — bcrypt silently truncates >72 bytes | `validatePassword()` enforces 8–72 chars on all password-setting endpoints |
| 11 | **JWT algorithm not pinned** — defaults to HS256 but could be misconfigured | `signOptions.algorithm` and `verifyOptions.algorithms` pinned to `['HS256']` in both JwtModule registrations |

## Verified Secure

- All 14 controllers have class-level auth decorators; default is `Role.Admin`
- SQL queries use MikroORM parameterized queries (no injection risk)
- File uploads store by checksum, not user-provided filename (no path traversal)
- No shared-secret backdoors; every login path creates or validates a real user account
- JWT algorithm pinned to HS256; `none` algorithm attack impossible
- Invite tokens expire after 7 days; password length validated server-side

## Accepted Risks

- Token in OAuth redirect URL: mitigated by origin validation + short-lived
  popup
- No CSRF middleware: mitigated by `SameSite=lax`
- No refresh token: 24-hour JWT expiry is acceptable
- No token revocation on logout: standard for stateless JWT
