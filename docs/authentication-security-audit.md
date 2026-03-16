# Authentication & Security Audit

Two rounds of audits covering authentication, controllers, data handling, and
injection surfaces. All critical/high issues fixed.

## Issues Fixed

| # | Severity | Issue | Fix |
|---|----------|-------|-----|
| 1 | CRITICAL | **Open redirect** — OAuth callback accepted arbitrary `redirect_uri`, allowing token theft via `redirect_uri=https://evil.com` | Validate origin against configured `URL` env var |
| 2 | CRITICAL | **Missing Secure flag** — JWT cookie sent over plain HTTP | `secure: true` when `NODE_ENV=production` |
| 3 | HIGH | **WebSocket CORS wildcard** — `cors: { origin: '*' }` on WebSocket gateway | Locked to server's configured `URL` origin |
| 4 | HIGH | **JWT logged in plaintext** — full token + user object at DEBUG level | Log only email and role |
| 5 | BUG | **OAuth client ID file-read** — file contents overwritten by file path (`microsoftClientID = clientIDFile?.trim()`) | Correctly read and trim file contents |
| 6 | MEDIUM | **Session cookies lacked security options** — no `httpOnly`, `secure`, `sameSite`, `maxAge` | Added `httpOnly: true`, `secure: true`, `sameSite: 'lax'`, `maxAge: 24h` |
| 7 | MEDIUM | **No minimum secret length** — single-char secrets accepted | Require 32+ characters for `JWT_SECRET` and `SESSION_SECRET` |

## Verified Secure

- All 14 controllers have class-level auth decorators; default is `Role.Admin`
- SQL queries use MikroORM parameterized queries (no injection risk)
- File uploads store by checksum, not user-provided filename (no path traversal)
- Root password comparison uses plaintext `===` against env var (intentional —
  hashing env vars provides no security since attacker with env access already
  has the password)

## Accepted Risks

- Token in OAuth redirect URL: mitigated by origin validation + short-lived popup
- No CSRF middleware: mitigated by `SameSite=lax`
- No refresh token: 24-hour JWT expiry is acceptable
- No token revocation on logout: standard for stateless JWT
