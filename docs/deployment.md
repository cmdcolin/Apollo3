# Deployment Guide

## Architecture

```
┌──────────────────────────────────────────────────┐
│  Browser                                         │
│  ├─ JBrowse UI (genome browser)                  │
│  └─ Apollo Admin UI (organisms, assemblies)      │
└──────────┬──────────────────────┬────────────────┘
           │ API / WebSocket      │ Static files
           ▼                      ▼
┌────────────────────┐  ┌────────────────────────┐
│  NestJS Backend    │  │  Static File Server    │
│  REST + WebSocket  │  │  (nginx / Apache /     │
│  Auth + config.json│  │   express.static)      │
│  Port 3999         │  │  BAM, CRAM, VCF, BigWig│
└────────┬───────────┘  └────────────────────────┘
         ▼
┌────────────────────┐
│  PostgreSQL/SQLite  │
└────────────────────┘
```

## Deployment Options

### Option 1: Single Server (simplest)

NestJS serves everything. Set `JBROWSE_STATIC_DIR` to the JBrowse web directory.
Good for development and small teams (< 10 users).

### Option 2: nginx + NestJS (recommended for production)

nginx serves static files with zero-copy `sendfile()`. NestJS handles API and
WebSocket only. See [`deploy/nginx/`](../deploy/nginx/).

```bash
cd deploy/nginx && cp .env.example .env && docker compose up -d
```

### Option 3: Apache httpd + NestJS

Same role as nginx. See `.github/workflows/deploy/` for Apache configuration.

### Static file performance

| Server  | Mechanism                                 | Notes                                     |
| ------- | ----------------------------------------- | ----------------------------------------- |
| nginx   | `sendfile()` — zero-copy                  | Multi-process, excellent throughput       |
| Apache  | `sendfile()` via `mod_mpm_event`          | Multi-threaded, excellent throughput      |
| Node.js | `fs.createReadStream()` with byte offsets | Single-threaded, adequate for small teams |

Use nginx/Apache when: BAM/CRAM > 1GB, 10+ concurrent users, or production.

## nginx Routing

```
nginx
  ├─ /jbrowse/config.json → proxy to NestJS (dynamic, generated from DB)
  ├─ /config.json          → proxy to NestJS
  ├─ /socket.io/           → proxy to NestJS (WebSocket upgrade)
  ├─ /jbrowse/*.bam|cram|bw|html|js → serve from disk (sendfile)
  ├─ /files/<checksum>     → serve from uploads dir
  └─ everything else       → proxy to NestJS (API)
```

`JBROWSE_STATIC_DIR` is **not set** on NestJS when using nginx. `config.json` is
always proxied (dynamically generated from track/assembly records in DB).

## Database

| Backend    | Use case                                        | Config                                                     |
| ---------- | ----------------------------------------------- | ---------------------------------------------------------- |
| SQLite     | Dev, desktop, small deployments                 | Default (no config)                                        |
| PostgreSQL | Production collaborative                        | `DB_BACKEND=postgresql DB_CONNECTION_URL=postgresql://...` |
| MongoDB    | Existing deployments migrating from origin/main | `DB_BACKEND=mongo DB_CONNECTION_URL=mongodb://...`         |

## Environment Variables

### Required

| Variable             | Description                                    |
| -------------------- | ---------------------------------------------- |
| `URL`                | Public URL (e.g. `https://apollo.example.com`) |
| `NAME`               | Instance name shown in UI                      |
| `FILE_UPLOAD_FOLDER` | Directory for uploaded files                   |
| `PORT`               | Server port (default: 3999)                    |

### Secrets

| Variable         | Description                          |
| ---------------- | ------------------------------------ |
| `JWT_SECRET`     | JWT signing secret (min 32 chars)    |
| `SESSION_SECRET` | Session cookie secret (min 32 chars) |

If not set, the server auto-generates random secrets and persists them to
`dist/.secrets/`. Survives restarts. For production, set explicitly or use
`_FILE` variants (e.g. `JWT_SECRET_FILE=/run/secrets/jwt`) for Docker secrets.

### Optional

| Variable                          | Description                                           |
| --------------------------------- | ----------------------------------------------------- |
| `JBROWSE_STATIC_DIR`              | JBrowse static files (single-server only)             |
| `DB_BACKEND`                      | `sqlite` / `postgresql` / `mongo`                     |
| `DB_CONNECTION_URL`               | Database connection string                            |
| `DEFAULT_NEW_USER_ROLE`           | New user role: `admin` / `user` / `readOnly` / `none` (default: `readOnly`) |
| `OIDC_PROVIDERS`                  | JSON array of OIDC provider configs (see docs/authentication.md) |
| `REMOTE_USER_HEADER`              | HTTP header for trusted reverse proxy auth            |
| `ALLOW_PASSWORD_LOGIN`            | Enable email/password login (default: `true`; set `false` for OIDC-only) |
| `ALLOWED_REDIRECT_ORIGINS`        | Extra origins for post-login redirects (dev only)     |

## First-Time Setup

On first start with no admin, the server prints a one-time setup URL:

```
Setup URL: http://localhost:3999/auth/setup?token=<random-token>
```

Visit it, fill in email, display name, and password. That account becomes admin with a bcrypt-hashed password.
Token is single-use and is invalidated immediately after the account is created.
