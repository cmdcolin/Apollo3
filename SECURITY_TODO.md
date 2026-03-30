Real issues, roughly by impact:

1. Invite tokens never expire (authentication.service.ts:167) An invite link
   created today is still valid in 6 months. If an admin sends an invite to a
   wrong email, or a user never claims it, that token is permanently usable.
   Standard practice is a 7-day TTL. There's no inviteTokenCreatedAt or expiry
   field anywhere in the user schema.

2. No server-side password length validation
   (authentication.service.ts:132, 178) The service calls
   bcrypt.hash(password, 10) with no length check. Two problems: the client
   enforces 8 chars but the service doesn't (so the API can be called directly
   with a 1-char password); and bcrypt silently truncates passwords longer than
   72 bytes, so password123... (73+ chars) hashes identically to the first 72
   chars. Users who set very long passwords get weaker security than they
   expect.

3. MemoryStore for OIDC sessions (main.ts:107) express-session defaults to
   MemoryStore when no store is configured. This is used to hold OIDC state
   tokens (the anti-CSRF nonce) during the login flow. Consequences: OIDC login
   breaks on any server restart or across multiple instances; MemoryStore leaks
   memory in production (documented as not suitable for it). For single-instance
   deployments this is survivable but it's a real gap.

4. OIDC_PROVIDERS JSON.parse without error handling (oidc.service.ts:82) If
   OIDC_PROVIDERS contains malformed JSON, the server crashes on startup with an
   uncaught exception. Wrapping in try/catch with a clear error message would
   make misconfigurations much easier to diagnose.

5. 50MB body limit applies to all endpoints (main.ts:102) json({ limit: '50mb'
   }) is set globally. Auth endpoints (login, setup-account) have no business
   accepting 50MB bodies. A client can send a 50MB JSON payload to POST
   /auth/login and the server will parse it. This is a memory/DoS amplifier —
   the throttler won't help because the body is parsed before the throttler
   acts. The large limit should be applied only to the upload routes.

6. 24-hour server timeout applies to all connections (main.ts:173)
   server.requestTimeout = 24 _ 60 _ 60 \* 1000 is needed for large GFF3
   uploads, but applying it globally means a slow-loris connection (dribbling
   data very slowly) can hold a connection open for a day. Should be set
   selectively on the file upload handler rather than globally.

---

Real but lower priority:

- REMOTE_USER header has no proxy IP validation — if REMOTE_USER_HEADER is set
  and someone hits the server directly (not through the proxy), they can forge
  the header and authenticate as anyone. This is documented as a requirement but
  nothing in the code enforces it. A TRUSTED_PROXY_CIDR env var with IP
  allowlisting would close this.
- JWT algorithm not specified explicitly — defaults to HS256 which is fine, but
  the none algorithm attack (where an attacker sends alg: none) is defeated by
  @nestjs/jwt / jsonwebtoken by default. Still worth pinning algorithms:
  ['HS256'] in the JwtModule config so it can never be misconfigured.

---

Not real concerns (things that look scary but aren't):

- The setup token race condition — Node.js event loop is single-threaded, so
  validateAndActivateSetup is not actually racy.
- The setup URL being logged — intentional; operator needs it to bootstrap.
- JWT revocation on logout — standard accepted trade-off for stateless JWTs.
- The 7-day JWT expiry — the sliding-window interceptor refreshes the cookie on
  every request, so this is effectively "expires 7 days after last activity."
  The maxAge: 24h on the cookie just means the browser will prompt again after
  24h of complete inactivity, but the JWT itself is still valid. Slightly
  confusing but not a vulnerability.

---

The three I'd fix first are invite token expiry, server-side password length,
and MemoryStore — all straightforward changes.
