# Cloud Editor Backend

A stateless, horizontally scalable backend for a collaborative code editor. The
monorepo contains an Express REST API, a Socket.io realtime gateway, and an
isolated terminal runner. PostgreSQL stores metadata, S3-compatible object
storage stores every project file, Redis carries realtime fan-out, and Docker
packages every service.

## Architecture

```text
Browser (Vercel-hosted frontend)
        |
        | HTTPS + WSS
        v
Load balancer / nginx
   |                 |
   v                 v
API (Express)     Realtime (Socket.io)
   |                 |
   |                 +---- Redis pub/sub adapter ----+
   |                                               |
   +---- PostgreSQL (metadata)                     |
   |                                               |
   +---- S3 / Cloudflare R2 (file contents)         |
                                                    |
Runner (Express + WebSocket) ---- ephemeral sandbox containers
```

### Stateless by design

- API and realtime containers never write project or workspace files to their
  own filesystems. They can be killed and replaced at any time.
- File contents live in S3/R2. PostgreSQL stores only metadata such as project,
  file path, storage key, size, checksum, owner, and membership rows.
- Redis is used for ephemeral realtime coordination only: the Socket.io adapter,
  presence, and short-lived collaboration state. It is not a source of truth.
- The runner will materialize user code only inside a disposable sandbox
  container (added in a later prompt). Nothing is persisted on the runner host
  or on a shared volume. Sandboxes are destroyed after the session.
- Logs go to stdout/stderr as JSON in production. No local log files are used.

### Services

| Package | Responsibility | Default port |
| --- | --- | --- |
| `packages/api` | REST API, Postgres access, future auth and S3 operations | 4000 |
| `packages/realtime` | Socket.io gateway with the Redis adapter | 4001 |
| `packages/runner` | Terminal WebSocket entry point and sandbox orchestration | 4002 |
| `packages/shared` | Shared TypeScript types, Zod schemas, constants | n/a |

The realtime service uses `@socket.io/redis-adapter` with separate Redis pub and
sub clients. Any realtime instance can broadcast to clients connected to any
other instance. Sticky sessions are still configured because Socket.io polling
transport and future terminal sessions require affinity; nginx uses `ip_hash`
for the realtime upstream.

## Requirements

- Node.js 20 LTS
- pnpm 9 or newer
- Docker Engine with Docker Compose v2

## Quick start (development)

1. Create the environment file and replace every placeholder secret:

   ```bash
   cp .env.example .env
   ```

2. Start the complete stack:

   ```bash
   docker compose up --build
   ```

   The first build installs the pnpm workspace inside each service image. The
   development targets run `tsx watch`, and the source directories are mounted
   for hot reload.

3. Verify the services:

   ```bash
   curl http://localhost:4000/health
   curl http://localhost:4001/health
   curl http://localhost:4002/health
   ```

4. MinIO is available at `http://localhost:9000` with the console at
   `http://localhost:9001`. The `minio-init` one-shot container creates the
   bucket named by `S3_BUCKET`. The bucket is private by default.

5. Stop the stack:

   ```bash
   docker compose down
   ```

   Add `-v` to delete the Postgres, Redis, and MinIO volumes.

### Running without Docker

Docker is the supported development path. To run the processes directly:

```bash
pnpm install
pnpm build
pnpm dev:api
pnpm dev:realtime
pnpm dev:runner
```

When running on the host, replace Docker service hostnames in `.env` with
`localhost` (for example `DATABASE_URL`, `REDIS_URL`, and `S3_ENDPOINT`). Start
Postgres 16, Redis 7, and an S3-compatible store first.

## Environment

All configuration is validated with Zod at process startup. A missing or invalid
value fails fast with a readable error. Secrets are never hardcoded; every
service reads them from the environment.

Key groups in `.env.example`:

- **App**: `NODE_ENV`, `API_PORT`, `REALTIME_PORT`, `RUNNER_PORT`
- **Postgres**: `DATABASE_URL` plus the `POSTGRES_*` values used by Compose
- **Redis**: `REDIS_URL` (`rediss://` for TLS providers)
- **Auth**: `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_TTL`,
  `JWT_REFRESH_TTL`
- **S3/R2**: `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`,
  `S3_SECRET_KEY`, `S3_FORCE_PATH_STYLE`
- **Runner limits**: `RUNNER_MAX_TIMEOUT_MS`, `RUNNER_MAX_MEMORY_MB`,
  `RUNNER_MAX_CPU`
- **CORS**: `CORS_ORIGIN` (comma-separated origins are accepted)

JWT secrets must be unique random values of at least 32 characters. Generate
them with a password manager or `openssl rand -base64 48`.

## Database

PostgreSQL is the metadata source of truth. The `files` table stores only the
normalized path, size, content hash, and S3 object key. File bytes live in
S3/R2. All timestamps use `timestamptz`, primary keys are UUID v4 generated by
`gen_random_uuid()`, and foreign keys declare an explicit `ON DELETE` behavior.

### Migrations

Migration files live in `packages/api/src/db/migrations/` and are applied by
`packages/api/src/db/migrate.ts`:

```bash
pnpm db:migrate        # dev: tsx against DATABASE_URL from .env
pnpm db:migrate:prod   # release/container: compiled dist/db/migrate.js
```

The runner:

- creates `schema_migrations (version text PRIMARY KEY, applied_at timestamptz)`;
- takes `pg_advisory_lock(1042019801)` so concurrent API instances/release jobs
  cannot apply the same migration at the same time;
- reads `*.sql` files in lexical order, applies each unapplied file inside its
  own transaction, and then records the filename as the version;
- skips versions already present, logs every applied/skipped file, and exits
  non-zero on failure.

For the Docker development database, point the migration command at the exposed
host port:

```bash
DATABASE_URL='postgresql://cloud_editor:YOUR_PASSWORD@localhost:5432/cloud_editor' \
  pnpm db:migrate
```

In production, run migrations as a release/CI job before rolling out new
instances. Do not run migrations from every application replica. The API build
copies the SQL files into `dist/db/migrations`, so the compiled runner works in
the production image.

`0002_seed_dev.sql` adds a demo user (`dev@example.com` / `password123`), one
project, and metadata-only file rows when the `users` table is empty. It is a
no-op on any database that already has users.

### Adding a migration

Create the next numbered file in `packages/api/src/db/migrations/`, for example:

```text
0001_init.sql
0002_seed_dev.sql
0003_add_project_tags.sql
```

Increment the prefix by one. The runner tracks versions, not checksums, so never
edit a migration that has already been applied in an environment; add a new
migration instead.

### ER diagram

```text
users 1 ──────< projects                 (projects.owner_id -> users.id)
users 1 ──────< project_members >────── 1 projects
projects 1 ───< files
projects 1 ───< project_snapshots
users 1 ──────< refresh_tokens
projects 1 ───< runner_sessions >────── 1 users
```

`project_members` is the per-project RBAC join table with roles
`owner|editor|viewer`; a partial unique index enforces exactly one `owner` row
per project. `files` has no content column by design. Deleting a project or file
removes metadata through foreign keys, but the Prompt 4 file service must delete
the corresponding S3/R2 objects at the application level (database triggers
cannot participate in object-storage cleanup).

## Authentication and authorization

### Token model

- **Access token**: short-lived HS256 JWT signed with `JWT_ACCESS_SECRET`.
  TTL comes from `JWT_ACCESS_TTL` (default `15m`). Claims include `sub`,
  `email`, `iat`, `exp`, `jti`, `iss=cloud-editor`, and `aud=access`. It is
  stateless and verified locally by every API instance. Send it as
  `Authorization: Bearer <token>`.
- **Refresh token**: 32 random bytes encoded as base64url. The raw value is
  returned only in the httpOnly cookie. PostgreSQL stores only its SHA-256 hash
  in `refresh_tokens.token_hash`; the raw token is never placed in a JSON body
  or logs.
- **Rotation**: `POST /api/auth/refresh` revokes the old row and inserts a new
  refresh token. If an already-revoked token is presented, the API treats it as
  reuse, revokes **all** active refresh tokens for that user, and returns
  `401 refresh_reuse`.
- **Logout** revokes the current refresh token and clears the cookie.
- Clients must keep the access token in memory only. Never store access or
  refresh tokens in `localStorage` or `sessionStorage`.

### Cookie attributes

The refresh cookie is named `refresh_token` and uses:

```text
httpOnly: true
secure:   NODE_ENV === "production"
sameSite: lax
path:     /api/auth
maxAge:   JWT_REFRESH_TTL (default 7d)
```

The cookie is scoped to `/api/auth`, so it is not sent to project, file, or
runner routes. CORS must use an exact allowed origin plus `credentials: true`.

### Endpoints

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/auth/register` | Create a user, return access token, set refresh cookie |
| `POST` | `/api/auth/login` | Verify credentials, return access token, set refresh cookie |
| `POST` | `/api/auth/refresh` | Rotate refresh cookie, return new access token |
| `POST` | `/api/auth/logout` | Revoke refresh token and clear cookie |
| `GET` | `/api/auth/me` | Return the authenticated user (requires Bearer token) |

Validation errors return `400` with
`error.details: [{ field, message }]`. Login failures use the generic
`invalid_credentials` code and still perform a dummy Argon2 verification to
reduce timing leaks.

### Rate limits

Rate limiting is shared across API replicas via Redis (`REDIS_URL`):

- login and register: 10 attempts per 15 minutes per IP + email;
- refresh: 30 requests per 15 minutes per IP.

Exceeded limits return `429` with a `Retry-After` header.

### Environment and RBAC

Authentication uses `DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET`,
`JWT_REFRESH_SECRET`, `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL`, and `NODE_ENV`
(cookie `secure` flag). `CORS_ORIGIN` must include the frontend origin.

`requireAuth` and `optionalAuth` populate `req.user`. Project routes use
`requireProjectRole(...)`, `requireOwner`, `requireEditor`, or `requireViewer`.
Roles are read from `project_members`; missing membership and insufficient role
both return `403` without revealing whether the project exists.

### curl examples

```bash
# Login. Save the refresh cookie in a jar; read accessToken from the JSON body.
curl -s -c cookies.txt   -H 'Content-Type: application/json'   -d '{"email":"dev@example.com","password":"password123"}'   http://localhost:4000/api/auth/login

# Register a new user.
curl -s -c cookies.txt   -H 'Content-Type: application/json'   -d '{"email":"new@example.com","password":"Password123","displayName":"New User"}'   http://localhost:4000/api/auth/register

# Use the access token from the login/register response.
curl -s -H "Authorization: Bearer $ACCESS_TOKEN"   http://localhost:4000/api/auth/me

# Rotate the refresh token. Always send and update the cookie jar.
curl -i -b cookies.txt -c cookies.txt -X POST   http://localhost:4000/api/auth/refresh

# Logout and clear the cookie.
curl -i -b cookies.txt -c cookies.txt -X POST   http://localhost:4000/api/auth/logout
```

### Tests

```bash
pnpm test
```

Unit tests cover Argon2id hashing and JWT signing/expiry. Refresh rotation and
RBAC integration tests run only when `TEST_DATABASE_URL` is set, and expect the
migrations to have been applied to that test database:

```bash
TEST_DATABASE_URL='postgresql://cloud_editor:password@localhost:5432/cloud_editor_test'   pnpm test
```

Email verification and password reset are intentionally out of scope for v1.

## Object storage model

The API will issue S3 operations with the configured credentials. A recommended
key layout is:

```text
projects/{projectId}/files/{fileId}
projects/{projectId}/snapshots/{snapshotId}
```

PostgreSQL stores the mapping from a normalized POSIX file path to its storage
key. File path validation in `@cloud-editor/shared` rejects absolute paths,
backslashes, control characters, and `..` traversal segments. Clients should
upload through short-lived presigned URLs or through the API; the API must not
write uploads to its local disk.

For Cloudflare R2:

```dotenv
S3_ENDPOINT=https://ACCOUNT_ID.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET=your-private-bucket
S3_FORCE_PATH_STYLE=false
```

Keep the bucket private. Use presigned URLs with short expirations for downloads
and uploads, and configure R2 CORS for the Vercel frontend origin.

## Deployment

The backend services are long-running containers. Deploy them to a platform
that supports persistent processes and WebSockets, such as Railway, Render, or
Fly.io.

### Frontend: Vercel

Deploy the Next.js frontend to Vercel. Set its public environment variables to
the HTTPS/WSS endpoints exposed by the backend load balancer:

```text
NEXT_PUBLIC_API_URL=https://api.example.com
NEXT_PUBLIC_REALTIME_URL=https://api.example.com
NEXT_PUBLIC_TERMINAL_URL=wss://terminal.example.com
```

Vercel hosts only the frontend. **Vercel cannot host the API, realtime, or runner
services.** Serverless functions have execution time limits, cannot hold
long-lived WebSocket/PTY connections, and do not provide the process or container
isolation needed for terminals. Do not deploy `packages/api`,
`packages/realtime`, or `packages/runner` as Vercel functions.

### Backend: Railway, Render, or Fly.io

Create one long-running service per package, all built from this monorepo:

- API: Dockerfile `packages/api/Dockerfile`, target `runtime`, health check
  `/health`, public HTTPS port.
- Realtime: Dockerfile `packages/realtime/Dockerfile`, target `runtime`, health
  check `/health`, public HTTPS/WSS port, sticky sessions enabled at the load
  balancer.
- Runner: Dockerfile `packages/runner/Dockerfile`, target `runtime`, health check
  `/health`, internal or separately protected WebSocket endpoint.

Set all variables from `.env.example` in each platform's secret manager. Do not
commit `.env`. Use the platform's managed Postgres and Redis when available, or:

- **Postgres**: Neon. Use the pooled connection string and `sslmode=require`.
- **Redis**: Upstash Redis. Use the standard Redis protocol URL, not the REST
  API; the Socket.io adapter needs pub/sub support. Prefer `rediss://` with TLS.
- **Object storage**: Cloudflare R2 with a private bucket and scoped API token.

Scale API instances freely behind the platform load balancer. For realtime,
enable sticky sessions and run at least two instances so Redis adapter fan-out is
exercised. The runner should be isolated from the API network and given explicit
CPU/memory limits.

### Single-host production reference

`docker-compose.prod.yml` builds the runtime stages, removes source mounts, adds
`restart: unless-stopped`, and places nginx in front of the API and realtime
services. It also applies CPU and memory limits to the runner. Managed Postgres,
Redis, and R2 remain external.

```bash
cp .env.example .env
# Set production values in .env first.
docker compose -f docker-compose.prod.yml up -d --build
```

The nginx configuration:

- Load-balances the API with `least_conn`.
- Uses `ip_hash` for realtime and forwards WebSocket upgrade headers.
- Keeps realtime connections open for up to 3600 seconds.
- Applies per-IP rate limits to REST and Socket.io routes.
- Enables gzip and a 10 MB request body limit.

For multi-node production, replace or supplement nginx with the platform load
balancer and make sure realtime affinity is enabled. The Redis adapter handles
message fan-out, not transport affinity.

## Terminal runner security model

`packages/runner/Dockerfile.runner` defines the base image for untrusted user
code. It runs as a non-root user and contains no project files. The terminal
implementation added later must:

- Create one disposable sandbox per terminal session.
- Mount no host paths and no shared workspace volumes.
- Materialize files from S3 inside the sandbox, then discard them.
- Enforce `RUNNER_MAX_TIMEOUT_MS`, `RUNNER_MAX_MEMORY_MB`, and `RUNNER_MAX_CPU`.
- Disable or restrict outbound networking as required by the product.
- Authenticate WebSocket upgrades with short-lived access tokens.
- Destroy the sandbox on disconnect, timeout, or runner shutdown.

The current runner exposes `/health` and a `/pty` WebSocket skeleton. It does not
spawn processes or PTYs yet; prompt 6 adds that logic.

## Operational notes

- All services expose `/health` for liveness checks.
- API and runner perform graceful shutdown on `SIGTERM`/`SIGINT`; realtime closes
  Socket.io and both Redis clients.
- Postgres pool size is capped per instance. Size the total across replicas
  against the database connection limit; use Neon pooling where appropriate.
- Request IDs are accepted from `X-Request-Id` when safe, otherwise generated,
  and echoed on responses for log correlation.
- CORS is deny-by-default for unknown browser origins.
- The API body limit is 1 MB. Large file content must go directly to S3, not
  through JSON endpoints. nginx independently enforces a 10 MB request limit.
- Never store uploads, generated files, or workspace data on the API, realtime,
  or runner host disk.

## Repository layout

```text
cloud-editor/
├── docker-compose.yml
├── docker-compose.prod.yml
├── .env.example
├── package.json
├── pnpm-workspace.yaml
├── README.md
├── packages/
│   ├── shared/
│   ├── api/
│   ├── realtime/
│   └── runner/
└── infra/
    ├── nginx/nginx.conf
    └── scripts/migrate.sh
```
