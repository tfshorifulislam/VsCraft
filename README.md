# CodeFigma

A Figma-style, browser-based code editor. The dashboard feels like Figma Web,
the editor feels like VS Code (Monaco), and every project gets a real shell
through an in-browser terminal backed by a PTY over WebSocket.

## Core principle

- The **Next.js app owns everything persistent**: users, projects, files and
  file contents are stored in **PostgreSQL via Prisma**.
- The **Express backend is realtime-only**: WebSocket terminal (PTY) and
  optional live editor sync. It never keeps project files on disk after a
  session ends and has no upload/storage/import/AI/extension routes.
- **No backend disk persistence, no S3, no uploads.** The only place a project
  file ever lives is the `files` table (+ an ephemeral temp directory for the
  duration of a terminal session).

```
Browser (Next.js / Vercel)
  ├─ Auth (JWT cookie) ─────────────┐
  ├─ Dashboard (Figma-style)         │  CRUD
  ├─ Monaco Editor ──────────────────┼──────────► PostgreSQL
  └─ xterm.js terminal               │            (users, projects, files,
          │ WSS + short-lived token  │             terminal_logs)
          ▼                          │
Express realtime container (Render / Railway / Fly.io)
  ├─ /terminal  → node-pty session (ephemeral tmp dir)
  ├─ /sync      → optional editor broadcast (no persistence)
  └─ syncs session files back into `files` in PostgreSQL
```

## Status

- [x] Audit of the existing codebase
- [x] Removed conflicting file-storage / execution / upload code
- [x] Database schema + migration (`users`, `projects`, `files`, `terminal_logs`)
- [x] Auth (signup, login, logout, session cookie, route protection)
- [x] Figma-style dashboard + project cards + New Project
- [x] New Project creates a DB record and opens the terminal in a modal
- [x] Real PTY terminal over WebSocket (`xterm.js` ↔ `node-pty`)
- [x] Terminal files sync to the `files` table (ephemeral dir, DB only)
- [x] "Open Editor" button + Monaco loaded from the database
- [x] Autosave (800 ms debounce) + manual save (`Ctrl/Cmd+S`)
- [x] Serverless/container deployment config
- [x] Type-check clean and lint with zero errors

## Repository layout

```
frontend/                 Next.js App Router app (all DB CRUD + UI)
  prisma/schema.prisma    Canonical database schema + migration
  src/app/(auth)/         /login, /signup
  src/app/(dashboard)/    /dashboard, /project/[id]
  src/app/api/            Auth + project + file route handlers
  src/components/dashboard/ProjectCard.tsx, NewProjectButton.tsx
  src/components/ui/TerminalModal.tsx
  src/components/terminal/Terminal.tsx
  src/components/editor/CodeEditor.tsx, FileTree.tsx
  src/lib/db.ts           Prisma client
  src/lib/auth.ts         Password hashing + session helpers
  src/lib/api.ts          Client fetch helper
  src/lib/jwt.ts          Shared JWT sign/verify (used by middleware too)
  vercel.json             Vercel config

backend/                  Realtime-only Express + `ws` server
  prisma/schema.prisma    Copy of the canonical schema (same DATABASE_URL)
  src/index.ts            Express + WebSocket upgrade routing
  src/pty/terminal.ts     One PTY per WebSocket connection
  src/socket/editorSync.ts Optional live editor broadcast
  src/auth/verify.ts      Token validation for WebSocket connections
  src/services/fileSync.ts Ephemeral dir ↔ `files` table reconciliation
  Dockerfile              Long-lived container image (Render/Railway)
```

## Audit summary

**Already matched the spec:** Monaco + xterm dependencies, a `node-pty` based
terminal manager, JWT auth helpers, a project/file data model, and a
dashboard/editor split.

**Conflicted with the spec (removed):**

- Backend disk persistence of project files: `workspaceDisk.ts`,
  `workspaceManager.ts`, `workspaceEnv.ts`, `projectStorage.ts`, the
  `workspaces/` directory and `WORKSPACES_DIR`.
- Backend project execution/build logic: `frameworkEngine.ts`,
  `projectDetector.ts`, `projectImportService.ts`, `previewCompiler` and the
  related project routes.
- Upload/import/sync/preview/raw/admin routes that wrote files to the server.
- AI, Open VSX extension, and workspace routes.
- The entire WebContainer-based frontend runtime (`lib/webcontainer/*`,
  `lib/runtime/*`, `lib/import/*`, `lib/extensions/*`, `lib/cache/*`).
- Marketing/landing UI, the old multi-pane editor, project import dialogs,
  terminal modal, material-icon sync scripts, and unused UI primitives.
- The SQLite database file and on-disk workspace data.

**Was missing (added):** a real Figma dashboard, a project → terminal → editor
flow, a PostgreSQL schema matching the spec, Next.js CRUD route handlers,
route protection, terminal→DB file syncing, autosave/manual save, and
deployment configuration.

### Files deleted (and why)

- **Backend storage/execution:** `src/services/projectStorage.ts`,
  `workspaceDisk.ts`, `workspaceManager.ts`, `workspaceEnv.ts`,
  `frameworkEngine.ts`, `projectDetector.ts`, `projectImportService.ts`,
  `projectService.ts`, `rateLimit.ts`, `terminalPtyManager.ts` — violated the
  "no backend file storage / no server-side execution" rule.
- **Backend routes/controllers/middleware:** `src/routes/{ai,auth,extensions,
  files,projects,terminal,workspaces}.ts`, `src/controllers/authController.ts`,
  `src/middleware/{auth,rateLimit}.ts`, `src/auth/{jwt,passwords,session}.ts`,
  `src/types/editor.ts`, `src/utils/detectFramework.ts`, `src/config/index.ts`,
  `src/server.ts` — replaced by the realtime-only server and Next.js CRUD.
- **Backend scripts:** `scripts/*.cjs` — tested the removed storage/execution
  APIs.
- **Frontend runtime/import/execution:** `src/lib/webcontainer/*`,
  `src/lib/runtime/*`, `src/lib/import/*`, `src/lib/extensions/*`,
  `src/lib/cache/*`, `src/lib/editor/*`, `src/lib/monaco/*`,
  `src/lib/project/*`, `src/lib/search/*`, `src/lib/storage/*`,
  `src/lib/tree/*`, `src/lib/icons/*`, `src/lib/cloud/cloudApi.ts`,
  `src/lib/utils.ts` — obsolete after moving to DB-backed files + real PTY.
- **Frontend UI:** `src/components/Landing/*`, `src/components/Projects/*`,
  `src/components/Editor/*`, `src/components/Auth/*`,
  `src/components/SmoothScroll.tsx`, `src/components/ui/card.tsx`, and the old
  `/editor`, `/projects`, `/login`, `/signup` pages — replaced by the
  Figma-style dashboard/workspace flow.
- **Frontend scripts/config:** `scripts/editor-perf.cjs`,
  `icon-theme-test.cjs`, `sync-material-icons.cjs`, `components.json` — tied to
  removed features.
- **Generated artifacts:** `backend/workspaces/`, `backend/prisma/dev.db`,
  `frontend/public/material-icons/` — build/session artifacts, not source.

## Database schema

```prisma
users        (id, email, name, password_hash, created_at)
projects     (id, user_id, name, created_at, updated_at)
files        (id, project_id, path, content, updated_at)   # content lives here
terminal_logs(id, project_id, command, output, created_at) # optional
```

`files` is unique on `(project_id, path)`. Deleting a project cascades to its
files and terminal logs. The canonical schema is `frontend/prisma/schema.prisma`;
`backend/prisma/schema.prisma` is an identical copy so the realtime service can
sync terminal files with the same client.

## Database setup

### Starting PostgreSQL

1. **Via Docker Compose (recommended):**
   ```bash
   docker compose up -d postgres
   docker compose ps
   ```

2. **Via systemd (Linux host):**
   ```bash
   sudo systemctl start postgresql && sudo systemctl enable postgresql
   ```

3. **Via standalone / userspace daemon:**
   ```bash
   # Initialize data cluster (first time)
   initdb -D /tmp/postgres-data -U codefigma --auth=trust
   # Start the daemon
   postgres -D /tmp/postgres-data
   ```

### Required `DATABASE_URL` format and keys

The application expects `DATABASE_URL` in both `frontend/.env` and `backend/.env`:

```bash
DATABASE_URL="postgresql://<user>:<password>@<host>:<port>/<dbname>?schema=public"
```

Default local configuration matching `docker-compose.yml` and `.env.example`:
```bash
DATABASE_URL="postgresql://codefigma:codefigma@localhost:5432/codefigma?schema=public"
```

Verify the database is listening before starting the services:
```bash
pg_isready -h localhost -p 5432 -U codefigma
```

### Applying Schema & Generating Client

Run these commands in `frontend` (and `backend`):
```bash
# 1. Generate Prisma Client
npx prisma generate

# 2. Push schema to PostgreSQL database
npx prisma db push

# (Alternatively, run migrations)
npx prisma migrate dev
```

## Auth routing

### Protected vs Public Routes

- **Public routes:**
  - `/` (landing / root dispatcher: checks session and redirects to `/dashboard` or `/login`)
  - `/login` (login page)
  - `/signup` (registration page)
  - `/api/auth/*` (auth handlers: login, signup, logout, session verification)
  - `/_next/*`, `/favicon.ico` (static build assets)

- **Protected routes:**
  - `/dashboard` (projects overview)
  - `/project/:id` (editor and terminal workspace)
  - `/api/projects/*`, `/api/files/*` (project and file CRUD)

### Middleware Matcher Rules

The Next.js proxy/middleware matcher is scoped strictly to protected routes:

```ts
export const config = {
  matcher: ["/dashboard/:path*", "/project/:path*"],
};
```

Within the middleware body, access is guarded:
```ts
if (!session && pathname !== "/login") {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("from", pathname);
  return NextResponse.redirect(url);
}
```

### Why the Redirect Loop Happened & How It Was Fixed

1. **Root cause of the loop:**
   - The middleware matcher previously included `"/login"` and `"/signup"` alongside protected routes (`matcher: ["/dashboard/:path*", "/project/:path*", "/login", "/signup"]`).
   - If a browser held a previously signed JWT session cookie (or dev cookie), the middleware's stateless JWT verification (`verifySessionToken`) evaluated `session` as truthy without querying PostgreSQL.
   - When visiting `/login`, the middleware saw `session` and redirected to `/dashboard`.
   - On `/dashboard`, the server component called `getSessionUser()`, which queries the PostgreSQL `User` table. Because the database was down or the user was deleted/missing, `getSessionUser()` returned `null`.
   - `/dashboard` then executed `if (!user) redirect("/login")`, bouncing the browser back to `/login`.
   - On `/login`, the middleware once again saw the valid JWT token and redirected to `/dashboard`, creating an infinite `ERR_TOO_MANY_REDIRECTS` loop.

2. **The fix:**
   - **Narrow the matcher:** The middleware matcher now only matches `['/dashboard/:path*', '/project/:path*']`. Middleware never executes on `/login`, `/signup`, or public routes.
   - **Guard redirects:** Middleware never redirects if the requested path is already `/login`.
   - **Resilient auth queries:** `getSessionUser` in `src/lib/auth.ts` catches Prisma connection errors gracefully, logging the failure server-side and returning `null` rather than throwing a hard 500.

## Local setup

### 2. Backend (realtime)

```bash
cd backend
cp .env.example .env          # set DATABASE_URL + JWT_SECRET
npm install
npx prisma migrate deploy     # or: npx prisma migrate dev
npm run dev                   # http://localhost:4000
```

### 3. Frontend

```bash
cd frontend
cp .env.example .env          # same DATABASE_URL + same JWT_SECRET
npm install
npx prisma migrate deploy     # or: npx prisma migrate dev
npm run dev                   # http://localhost:3000
```

`JWT_SECRET` **must be identical** in both services. Apply the migration once
(either service works; both point at the same database).

### Environment variables

| Variable | Service | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | both | PostgreSQL connection string |
| `JWT_SECRET` | both | HS256 signing secret (32+ chars in production) |
| `NEXT_PUBLIC_TERMINAL_WS_URL` | frontend | `ws://localhost:4000/terminal` |
| `PORT` | backend | Realtime server port (default `4000`) |
| `FRONTEND_URL` | backend | Allowed WebSocket origin(s), comma-separated |
| `TERMINAL_SHELL` | backend | Shell to spawn (default `bash`) |
| `SYNC_INTERVAL_MS` | backend | Terminal→DB reconciliation interval |
| `MAX_SYNC_FILE_BYTES` | backend | Skip larger files when syncing |

> **Deploying to Vercel?** Project → Settings → Environment Variables must
> contain `DATABASE_URL` (a hosted Postgres URL, never `localhost`),
> `JWT_SECRET` (the same value used by the realtime service), and
> `NEXT_PUBLIC_TERMINAL_WS_URL`. Local `.env` files are gitignored and are not
> uploaded to Vercel. If you use the Vercel Postgres/Neon integration, the app
> also accepts `POSTGRES_PRISMA_URL` / `POSTGRES_URL_NON_POOLING` /
> `POSTGRES_URL` at runtime, but `prisma migrate deploy` still reads
> `DATABASE_URL`.

### Auth troubleshooting ("Could not sign you in.")

Auth is a small JWT-cookie implementation (`src/lib/auth.ts`,
`src/lib/jwt.ts`), **not NextAuth**. The generic message means
`/api/auth/login` threw before it could issue a session cookie. Check the
server/function logs for `[login]`:

1. `PrismaClientInitializationError` / "Can't reach database server" — the
   deployment cannot reach `DATABASE_URL`. Use a hosted Postgres URL (add
   `?sslmode=require` when the provider requires TLS), not `localhost`.
2. Prisma `P2021` / "table does not exist" — run
   `npx prisma migrate deploy` against that same database.
3. "JWT_SECRET must be set to at least 32 characters in production" — add a
   strong `JWT_SECRET` to the deployment environment and keep it identical on
   the realtime service.
4. "Invalid email or password" is a 401, not this error: verify the account
   exists and the password is correct.

## User flow

1. Sign up / sign in.
2. Land on the Figma-style dashboard of your projects.
3. Click **New Project** → a DB record is created and the terminal opens in a
   modal over the dashboard.
4. Run real commands (`npm create vite@latest`, `ls`, `mkdir`, ...).
5. Click **Open Editor** in the modal footer → the modal closes and Monaco
   loads the project tree and contents from the database.
6. Edit a file → autosaves after 800 ms, or press `Ctrl/Cmd+S`.
7. Terminal-created files appear in the explorer after **Refresh** (or on
   reopening the editor). They are synced into `files` while the session runs
   and one final time when it ends.

## Terminal

The dashboard terminal is a reusable modal (`src/components/ui/TerminalModal.tsx`)
with a dimmed backdrop, the project name, an xterm.js body, and an **Open
Editor** footer action. It is responsive, traps focus, restores focus on close,
supports Escape and backdrop clicks, and locks body scroll. If a PTY session is
active, the first close request shows an inline confirmation inside the modal
(no native/browser permission popups).

The WebSocket is created only while the modal is mounted. Closing the modal
unmounts `Terminal`, which closes the socket; the realtime backend then kills
the PTY, performs a final database sync, and removes the ephemeral temp
directory. Opening the editor closes the modal first, so the terminal session
is torn down before navigation.

### Why the browser cannot open your OS terminal

Browsers are sandboxed and cannot launch local executables such as Windows
Terminal, macOS Terminal, or a Linux terminal emulator from a web page. Custom
URL schemes (for example `myapp://`) require a one-time OS-level install and
registration and normally show a browser confirmation on each launch, which
violates the "no repeated prompts" requirement. The supported, fully working
experience is the in-app modal terminal: xterm.js in the browser connected over
WebSocket to a real `node-pty` shell on the realtime backend. No project files
are stored on the backend; the PTY workspace is ephemeral and syncs to the
database.

## WebSocket protocol

`GET /terminal?token=<jwt>&projectId=<id>`

Client → server:

```json
{ "type": "input", "data": "ls\r" }
{ "type": "resize", "cols": 120, "rows": 30 }
{ "type": "sync" }
{ "type": "ping" }
```

Server → client:

```json
{ "type": "ready", "projectId": "...", "cwd": "/workspace" }
{ "type": "output", "data": "..." }
{ "type": "sync", "updated": 2, "deleted": 0 }
{ "type": "exit", "exitCode": 0 }
{ "type": "error", "message": "..." }
```

`/sync?token=<jwt>&projectId=<id>` is an optional editor broadcast channel. It
never persists content; the database remains the source of truth.

## Terminal → database sync rules

- On connect, the project's DB files are materialized into an ephemeral
  `os.tmpdir()` directory (never inside the repository).
- The directory is polled (`SYNC_INTERVAL_MS`, default 2.5 s) and reconciled:
  changed/new text files are upserted, removed baseline files are deleted.
- Ignored paths: `node_modules`, `.git`, `.next`, `dist`, `build`, caches,
  IDE folders, and files larger than `MAX_SYNC_FILE_BYTES` or binary files.
- On disconnect the PTY is killed, a final sync runs, and the temp directory is
  removed. Nothing survives on the backend.

## Deployment

- **Frontend → Vercel.** Set `DATABASE_URL` (hosted Postgres), `JWT_SECRET`
  (same as the realtime service), and `NEXT_PUBLIC_TERMINAL_WS_URL`. Run
  `npx prisma migrate deploy` as part of your release step (or once against the
  production database) **before** the first sign-in; without the tables,
  `/api/auth/login` returns a 503 with a schema message. `vercel.json` is
  included.
- **Realtime backend → Render / Railway / Fly.io.** Use `backend/Dockerfile`
  (a `render.yaml` blueprint is included). A live PTY needs a long-lived
  process, so this service cannot run on Vercel's serverless functions. This is
  the intentional trade-off: the *data plane* is serverless-ready and the
  *realtime plane* is a small container.

## Decisions & notes

- **Auth:** a small, dependency-light JWT-cookie auth implementation (jose +
  bcryptjs) was chosen over adding NextAuth/Supabase/Firebase, so both services
  can verify the same HS256 token with no extra infrastructure. It is easy to
  swap for NextAuth because all session logic is isolated in `lib/auth.ts` and
  `lib/jwt.ts`.
- **Node-pty build:** the repo uses
  `@homebridge/node-pty-prebuilt-multiarch` instead of plain `node-pty` so the
  native PTY binary is available without a compiler toolchain.
- **File tree:** folder nodes are inferred from `path` because the required
  schema has no `is_folder` column.
- **Binary/large files:** skipped by the terminal sync to keep the database
  lean; the editor edits text files only.
- **No deletion confirmation popups:** per the permissions policy, destructive
  UI prompts were not added.
