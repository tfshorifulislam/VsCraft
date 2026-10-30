# CodeFigma Realtime Backend

Express + `ws` + `node-pty` service that powers the browser terminal (and an
optional live editor sync channel). It is **not** an application API: project
and file CRUD live in the Next.js app.

## Responsibilities

- Authenticate WebSocket connections with the shared JWT secret.
- Spawn one PTY per WebSocket connection in an ephemeral temp directory.
- Stream terminal output and accept `input` / `resize` / `sync` messages.
- Reconcile terminal-created text files into the `files` table.
- Kill the PTY and delete the temp directory when the session ends.

It stores **nothing** on its own filesystem after a session and exposes no
upload, storage, import, build, AI, or extension routes.

## Run

```bash
cp .env.example .env
npm install
npx prisma migrate deploy   # same DATABASE_URL as the frontend
npm run dev                 # ws://localhost:4000/terminal
```

## Endpoints

- `GET /api/health`
- `WS /terminal?token=<jwt>&projectId=<id>`
- `WS /sync?token=<jwt>&projectId=<id>` (optional broadcast)

See the root `README.md` for the message protocol and deployment notes.
