# Authentication & Data Security Audit

## Summary

Two rounds of security audits were performed on Apollo3. The first focused on
authentication; the second covered all controllers, data handling, and injection
surfaces. All critical and high-severity issues have been fixed.

## Critical Issues Fixed

### 1. Open Redirect Vulnerability (CRITICAL — Pre-existing)

**File**: `authentication.service.ts:handleRedirect()`

The OAuth callback accepted an arbitrary `redirect_uri` and redirected the user
to it with their access token appended. An attacker could craft a login URL with
`redirect_uri=https://evil.com` to steal tokens.

**Fix**: The `redirect_uri` origin is validated against the configured `URL`
environment variable. External origins are blocked and logged.

### 2. Missing Secure Flag on Authentication Cookies (CRITICAL — Pre-existing)

**File**: `authentication.controller.ts:COOKIE_OPTIONS`

The JWT cookie lacked `secure: true`, allowing transmission over plain HTTP.

**Fix**: `secure: true` is set when `NODE_ENV=production`.

### 3. WebSocket CORS Wildcard (HIGH — Pre-existing)

**File**: `messages.gateway.ts`

The WebSocket gateway had `cors: { origin: '*' }`, allowing any website to
connect and receive real-time annotation updates.

**Fix**: WebSocket CORS origin is now set to the server's configured `URL`
origin, matching the REST API's security posture.

### 4. JWT Token Logged in Plaintext (HIGH — Pre-existing)

**File**: `authentication.service.ts:logIn()`

The full JWT token and user object (including role) were logged at DEBUG level.
Tokens in logs can be extracted by anyone with log access.

**Fix**: Replaced with a minimal log message containing only email and role.
Token is no longer logged.

### 5. OAuth Client ID File-Read Bug (BUG — Pre-existing)

**File**: `authentication.service.ts:getLoginTypes()`

When OAuth client IDs were provided via Docker secret files, the code overwrote
the file contents with the file path:

```typescript
// Before (buggy):
microsoftClientID = clientIDFile && (await fs.readFile(clientIDFile, 'utf8'))
microsoftClientID = clientIDFile?.trim() // Overwrites with file PATH
```

Docker-secrets-based OAuth deployments would never enable OAuth login.

**Fix**: Correctly reads and trims file contents.

## Medium Issues Fixed

### 6. Session Middleware Lacked Security Options (MEDIUM — Pre-existing)

**File**: `main.ts:session()`

Session cookies had no `httpOnly`, `secure`, `sameSite`, or `maxAge` settings.

**Fix**: Added `httpOnly: true`, `secure: true` (production), `sameSite: 'lax'`,
`maxAge: 24h`.

### 7. No Minimum Length for JWT/Session Secrets (MEDIUM — Pre-existing)

**File**: `app.module.ts:validationSchema`

Secrets of any length were accepted. Single-character secrets are trivially
brute-forceable.

**Fix**: Both `JWT_SECRET` and `SESSION_SECRET` require minimum 32 characters.

## Verified as Secure

- **All 14 controllers** have class-level auth decorators (`@Public`, `@Roles`,
  or `@Authenticated`). Default fallback is `Role.Admin` (secure by default).
- **SQL queries** use MikroORM's parameterized queries — no SQL injection risk.
  Raw SQL in `MikroOrmFeatureRepository` uses placeholder functions.
- **File uploads** store by checksum, not user-provided filenames — no path
  traversal.
- **Root password comparison** uses plaintext `===` against env var. This is
  intentional for simple deployments where the password is already in the
  environment. Hashing env vars provides no additional security since the
  attacker with env access already has the password.
- **Plugin dynamic import** loads from admin-configured URLs, not user input.
- **`changedIds` LIKE pattern** in ChangeRepository uses JSON array queries with
  in-memory false-positive filtering. This is acceptable because: (1) changes
  genuinely affect multiple features, (2) feature IDs are 24-char hex strings
  making partial matches negligible, (3) MikroORM parameterizes the query.

## Remaining Items (Acceptable Risk)

- **Token in OAuth redirect URL**: Needed for the popup auth flow. Mitigated by
  origin validation, simultaneous cookie setting, and short-lived popup.
- **No CSRF middleware**: Mitigated by `SameSite=lax` cookies.
- **No refresh token**: 24-hour JWT expiry is acceptable.
- **No token revocation on logout**: Cookie is cleared but JWT remains valid
  until expiry. Standard for stateless JWT systems.

## Files Changed

- `packages/apollo-collaboration-server/src/authentication/authentication.controller.ts`
- `packages/apollo-collaboration-server/src/authentication/authentication.service.ts`
- `packages/apollo-collaboration-server/src/messages/messages.gateway.ts`
- `packages/apollo-collaboration-server/src/main.ts`
- `packages/apollo-collaboration-server/src/app.module.ts`
