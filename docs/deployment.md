# Apollo3 Deployment Guide

## Architecture Overview

Apollo3 consists of three main components:

```
┌─────────────────────────────────────────────────────────┐
│  Browser                                                │
│  ├─ JBrowse UI (genome browser)                         │
│  └─ Apollo Admin UI (organisms, assemblies, users)      │
└───────────────┬─────────────────────────┬───────────────┘
                │ API / WebSocket         │ Static files
                │                         │ (BAM, CRAM, BigWig...)
                ▼                         ▼
┌──────────────────────────┐  ┌──────────────────────────┐
│  NestJS Backend          │  │  Static File Server      │
│  ├─ REST API             │  │  (nginx, Apache, or      │
│  ├─ WebSocket (socket.io)│  │   Node.js express.static)│
│  ├─ Auth (JWT + cookies) │  │                          │
│  └─ Dynamic config.json  │  │  Serves:                 │
│                          │  │  ├─ JBrowse JS/CSS/HTML  │
│  Port 3999 (internal)    │  │  ├─ BAM / CRAM / VCF     │
└──────────┬───────────────┘  │  ├─ BigWig / 2bit        │
           │                  │  └─ Uploaded files        │
           ▼                  └──────────────────────────┘
┌──────────────────────────┐
│  PostgreSQL / SQLite     │
└──────────────────────────┘
```

## Deployment Options

### Option 1: Single Server (simplest)

NestJS serves everything — static files, API, and WebSocket. Good for
development and small teams (< 10 concurrent users).

Set `JBROWSE_STATIC_DIR` to the directory containing JBrowse web files. The
server uses `express.static` which supports byte-range requests for indexed
file access.

```bash
# .env
JBROWSE_STATIC_DIR=/path/to/jbrowse-web
```

### Option 2: nginx + NestJS (recommended for production)

nginx serves static files (JBrowse UI, BAM, CRAM, BigWig, etc.) with
kernel-level `sendfile()` for zero-copy I/O. NestJS handles only the API and
WebSocket connections. This is the recommended setup for production deployments
with large genomic data files and multiple concurrent users.

See [`deploy/nginx/`](../deploy/nginx/) for a ready-to-use Docker Compose
setup.

```bash
cd deploy/nginx
cp .env.example .env
# Edit .env with your values
docker compose up -d
```

### Option 3: Apache httpd + NestJS (existing CI/CD setup)

The GitHub Actions deployment (`deploy.yml`) uses Apache httpd in the same
role as nginx above. See `.github/workflows/deploy/` for the Apache
configuration.

## Static File Serving Performance

Genomic data files (BAM, CRAM, BigWig, VCF) are accessed by JBrowse using
HTTP byte-range requests (`Range` header). The browser fetches only the
specific byte ranges it needs from the BAM index, then the corresponding
aligned reads — never the full file. This is how JBrowse can browse a 50 GB
BAM file without downloading it.

### Performance characteristics by server

| Server | Byte-range support | Mechanism | Throughput |
|--------|-------------------|-----------|------------|
| nginx | Native | `sendfile()` syscall — zero-copy, no user-space buffering | Excellent |
| Apache httpd | Native | `sendfile()` with `mod_mpm_event` | Excellent |
| Node.js `express.static` | Native (via `send` library) | `fs.createReadStream()` with byte offsets | Adequate |

Node.js handles static files correctly but is single-threaded. Under heavy
concurrent load (many users browsing large BAM files simultaneously), a
dedicated static file server provides significantly better throughput because:

- **Zero-copy I/O**: nginx/Apache use the kernel's `sendfile()` syscall to
  transfer file data directly from disk to the network socket without copying
  through user space
- **Multi-process/threaded**: nginx uses worker processes; Apache uses an
  event-driven MPM — neither blocks on a single thread
- **No GC pauses**: no JavaScript garbage collection during file transfers

### When to use nginx

- Serving BAM/CRAM files > 1 GB
- More than ~10 concurrent users browsing genomic data
- Production deployments where reliability matters
- When you want to terminate TLS at the reverse proxy

### When single-server is fine

- Development and testing
- Small teams (< 10 users)
- Small genomes with moderate-size evidence tracks
- Demo deployments

## nginx Configuration

The [`deploy/nginx/`](../deploy/nginx/) directory contains:

- `nginx.conf` — nginx configuration with byte-range support, WebSocket
  proxying, and upload size limits
- `docker-compose.yml` — three-service setup (nginx + NestJS + PostgreSQL)
- `.env.example` — required environment variables

### How the routing works

```
Request ──► nginx
              │
              ├─ /jbrowse/config.json ──► proxy to NestJS (dynamic)
              ├─ /config.json ──────────► proxy to NestJS (dynamic)
              ├─ /socket.io/ ───────────► proxy to NestJS (WebSocket)
              │
              ├─ /jbrowse/*.bam ────────► serve from disk (sendfile)
              ├─ /jbrowse/*.cram ───────► serve from disk (sendfile)
              ├─ /jbrowse/*.bw ─────────► serve from disk (sendfile)
              ├─ /jbrowse/*.html ───────► serve from disk
              ├─ /jbrowse/*.js ─────────► serve from disk
              │
              ├─ /files/<checksum> ─────► serve from uploads dir
              │
              └─ everything else ───────► proxy to NestJS (API)
```

Key points:

- `JBROWSE_STATIC_DIR` is **not set** on the NestJS server when using nginx —
  nginx serves those files directly
- `config.json` is the exception — it's dynamically generated from the database
  (track configs, assembly definitions) so it must be proxied to NestJS
- Uploaded files (`/files/`) can be served by nginx directly from the
  `FILE_UPLOAD_FOLDER` volume. Files are stored gzip-compressed on disk.
- WebSocket connections (`/socket.io/`) require the `Upgrade` and `Connection`
  headers to be forwarded

### Data directory layout

The `JBROWSE_DIR` directory mounted into nginx should contain:

```
/data/jbrowse/
├── index.html          # JBrowse web app
├── *.js, *.css         # JBrowse bundles
├── apollo.js           # Apollo plugin
├── sequence_ontology.json
└── volvox/             # (example) genomic data
    ├── reads.bam
    ├── reads.bam.bai
    ├── variants.vcf.gz
    ├── variants.vcf.gz.tbi
    └── coverage.bw
```

Track configurations in the database reference these files with URIs like
`/jbrowse/volvox/reads.bam`. When using nginx, these are served directly from
disk. When using single-server mode, they're served by `express.static`.

## Database

Apollo3 supports three database backends:

| Backend | Use case | Config |
|---------|----------|--------|
| SQLite | Development, small deployments | Default (no config needed) |
| PostgreSQL | Production | `DB_BACKEND=postgresql DB_CONNECTION_URL=postgresql://...` |
| MongoDB | Legacy (migration from Apollo2) | `DB_BACKEND=mongo DB_CONNECTION_URL=mongodb://...` |

PostgreSQL is recommended for production. The `docker-compose.yml` files
include a PostgreSQL service.

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `URL` | Public URL of the server (e.g., `https://apollo.example.com`) |
| `NAME` | Instance name shown in the UI |
| `FILE_UPLOAD_FOLDER` | Directory for uploaded GFF/FASTA files |
| `PORT` | Server port (default: 3999) |
| `CORS` | Enable CORS (default: true, set false behind reverse proxy) |
| `LOG_LEVELS` | Comma-separated: error,warn,log,debug,verbose |

### Secrets

| Variable | Description |
|----------|-------------|
| `JWT_SECRET` | Secret for signing JWT tokens (min 32 chars) |
| `SESSION_SECRET` | Secret for session cookies (min 32 chars) |

**Auto-generation**: If neither `JWT_SECRET` nor `JWT_SECRET_FILE` is set, the
server auto-generates a cryptographically random secret and persists it to
`dist/.secrets/jwt.key` (same for `SESSION_SECRET` → `session.key`). This
means:

- **Development**: no secret configuration needed — just start the server
- **Restarts**: auto-generated secrets survive restarts (persisted to disk)
- **Production**: set secrets explicitly via env vars or `_FILE` for
  reproducibility across deployments

All secrets support a `_FILE` variant (e.g., `JWT_SECRET_FILE`) that reads the
value from a file path. This works with Docker secrets:

```yaml
# docker-compose.yml
services:
  apollo:
    secrets:
      - jwt_secret
      - session_secret
    environment:
      JWT_SECRET_FILE: /run/secrets/jwt_secret
      SESSION_SECRET_FILE: /run/secrets/session_secret

secrets:
  jwt_secret:
    file: ./jwt.key
  session_secret:
    file: ./session.key
```

### Optional

| Variable | Description |
|----------|-------------|
| `JBROWSE_STATIC_DIR` | Path to JBrowse static files (single-server mode only) |
| `DB_BACKEND` | `sqlite`, `postgresql`, or `mongo` |
| `DB_CONNECTION_URL` | Database connection string |
| `ALLOW_GUEST_USER` | Allow unauthenticated guest access (default: false) |
| `GUEST_USER_ROLE` | Role for guest users: `admin`, `user`, `readOnly` |
| `DEFAULT_NEW_USER_ROLE` | Role for new users: `admin`, `user`, `readOnly`, `none` |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `MICROSOFT_CLIENT_ID` | Microsoft OAuth client ID |
| `MICROSOFT_CLIENT_SECRET` | Microsoft OAuth client secret |
| `ALLOW_ROOT_USER` | Enable root password login (default: false) |
| `ROOT_USER_PASSWORD` | Password for the root admin account |

## First-Time Setup

When the server starts with no admin user in the database, it prints a one-time
setup URL to the console:

```
========================================================
No admin user found. Use the following URL to set up the
first admin account:

  /auth/setup?token=<random-token>

========================================================
Setup URL: http://localhost:3999/auth/setup?token=<random-token>
```

Visit this URL in your browser. The page will show "Admin setup mode active"
and prompt you to sign in. The first account to log in (via Google, Microsoft,
or guest) becomes the admin. The setup token is single-use and invalidated
after the first login.

For development, set `GUEST_USER_ROLE=admin` to skip the setup flow entirely.
