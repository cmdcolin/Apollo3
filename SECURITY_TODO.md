Remaining issues, roughly by impact:

1. ~~Invite tokens never expire~~ **FIXED** — invite tokens now have a 7-day
   TTL via `inviteTokenCreatedAt` field. Expired tokens are rejected in
   `acceptInvite()`.

2. ~~No server-side password length validation~~ **FIXED** — `validatePassword()`
   enforces 8–72 character range in `setupAccount()`, `acceptInvite()`, and
   admin `resetPassword()`. The 72-char upper bound matches bcrypt's truncation
   limit.

3. MemoryStore for OIDC sessions (main.ts) — express-session defaults to
   MemoryStore when no store is configured. This is used to hold OIDC state
   tokens (the anti-CSRF nonce) during the login flow. Consequences: OIDC login
   breaks on any server restart or across multiple instances; MemoryStore leaks
   memory in production. For single-instance deployments this is survivable but
   it's a real gap.

4. OIDC_PROVIDERS JSON.parse without error handling (oidc.service.ts) — if
   OIDC_PROVIDERS contains malformed JSON, the server crashes on startup with an
   uncaught exception. Wrapping in try/catch with a clear error message would
   make misconfigurations much easier to diagnose.

5. 50MB body limit applies to all endpoints (main.ts) — auth endpoints should
   not accept 50MB payloads. The large limit should be applied only to the file
   upload routes.

6. 24-hour server timeout applies to all connections (main.ts) — should be set
   selectively on file upload handlers rather than globally.

---

Lower priority:

- REMOTE_USER header has no proxy IP validation — direct server access allows
  header forgery. A TRUSTED_PROXY_CIDR env var with IP allowlisting would fix
  this.
- ~~JWT algorithm not specified explicitly~~ **FIXED** — pinned to HS256 in
  both `authentication.module.ts` and `messages.module.ts`.

---

Not real concerns (things that look scary but aren't):

- The setup token race condition — Node.js event loop is single-threaded.
- The setup URL being logged — intentional; operator needs it to bootstrap.
- JWT revocation on logout — standard accepted trade-off for stateless JWTs.
- The 7-day JWT expiry — the sliding-window interceptor refreshes the cookie on
  every request, so this is effectively "expires 7 days after last activity."

---

Next priority: MemoryStore replacement (use the MikroORM-backed session or a
simple file store), then OIDC_PROVIDERS error handling.
