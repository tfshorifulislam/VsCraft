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
`DATABASE_URL`, `JWT_SECRET`, and `NEXT_PUBLIC_TERMINAL_WS_URL` set.
