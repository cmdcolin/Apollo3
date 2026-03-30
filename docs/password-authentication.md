# Password Authentication via Invite Links

## Summary

Apollo3 now supports admin-managed password authentication alongside OIDC and
root login. This restores a key workflow from Apollo2 where administrators had
direct control over who could access the system, without requiring external
identity providers.

## Motivation

Apollo is typically deployed as a controlled annotation platform for a specific
research group or lab — not as an open public service. Administrators know
exactly who should have access. In many deployment contexts (small labs,
institutional servers without OIDC infrastructure), requiring Google or
institutional SSO adds unnecessary complexity.

Apollo2 handled this with a straightforward admin-creates-accounts model. Users
received credentials from their administrator and logged in with
username/password. This was simple and worked well for the typical Apollo
deployment scenario.

The new implementation brings back this workflow with modern security practices.

## How It Works

- **Admin creates a user** in the admin panel (`/admin/users/`) by entering
  their email, username, and role
- **System generates a one-time invite link** — the admin copies it and sends it
  to the user (via email, Slack, etc.)
- **User clicks the link** and is taken to a "Set Your Password" page where they
  choose their own password (no plaintext passwords are ever transmitted)
- **User logs in** with their email and password on the main login page
- **Admin can reinvite** a user at any time to generate a new link (e.g. if the
  original expired or the user needs to reset their password)

## Comparison with Apollo2

| Aspect | Apollo2 | Apollo3 |
|--------|---------|---------|
| Account creation | Admin creates user with password | Admin creates user, generates invite link |
| Password delivery | Admin emails raw password to user | User chooses their own password via invite link |
| Password storage | SHA-256 hash (no salt) | bcrypt with salt (industry standard) |
| Login method | Username + password | Email + password |
| Coexists with SSO | No | Yes — OIDC, password, and root login can all be active |
| Self-registration | No | No (admin-controlled) |

The key improvement over Apollo2 is that **no plaintext passwords are ever
shared** — the user sets their own password. The invite token is one-time use and
is cleared once the password is set.

## Security Details

- Passwords are hashed with **bcrypt** (cost factor 10) — the current industry
  standard for password storage
- The `/auth/login` endpoint is **rate-limited** to 10 requests per minute to
  mitigate brute-force attacks
- The `/auth/accept-invite` endpoint is similarly rate-limited
- Invite tokens are random 256-bit values (32 bytes hex-encoded)
- Invite tokens are single-use — cleared from the database once a password is
  set
- Password hashes and invite tokens are **never returned** in API responses
  (stripped at the controller layer)
- Minimum password length of 8 characters enforced on the client

## Configuration

Password login is always available — there is no configuration flag needed. If
no users have been created with invite links, the email/password form simply
won't match any accounts.

The feature works with all supported database backends (SQLite, PostgreSQL,
MongoDB).

## User-Facing Pages

- `/ui/invite/?token=...` — Set password page (linked from invite)
- Main login page — Shows OIDC buttons and email/password form as applicable

## API Endpoints

- `POST /users` — Admin creates a user, returns invite token
- `POST /users/:id/reinvite` — Regenerate invite token for existing user
- `PATCH /users/:id/password` — Admin resets a user's password directly
- `POST /auth/login` — Email/password login
- `POST /auth/accept-invite` — Accept invite and set password
- `GET /auth/types` — Now includes `passwordLogin: true` in response
