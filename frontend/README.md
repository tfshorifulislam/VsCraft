# CodeFigma Frontend

Next.js App Router application for CodeFigma. It owns authentication, the
Figma-style dashboard, project/file CRUD against PostgreSQL, the Monaco editor,
and the xterm.js terminal client.

## Routes

- `/login`, `/signup` — auth
- `/dashboard` — Figma-style project grid + New Project
- `/project/[id]` — terminal tab + editor tab (Open Editor)
- `/api/auth/*` — signup, login, logout, me, ws-token
- `/api/projects/*`, `/api/files/*` — database CRUD

All project data is stored in the `files` table via Prisma. No file is written
to the server filesystem or to browser localStorage.

## Run

```bash
cp .env.example .env
npm install
npx prisma migrate deploy   # same DATABASE_URL as the backend
npm run dev                 # http://localhost:3000
```

The terminal WebSocket URL is `NEXT_PUBLIC_TERMINAL_WS_URL`
(default `ws://localhost:4000/terminal`). Deploy to Vercel with
`DATABASE_URL` (hosted Postgres, not `localhost`), `JWT_SECRET` (32+ characters,
same as the realtime service), and `NEXT_PUBLIC_TERMINAL_WS_URL` set, then run
`npx prisma migrate deploy` against the production database. See the root
`README.md` for auth troubleshooting ("Could not sign you in.").
