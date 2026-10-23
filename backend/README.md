# Code Editor — Backend API Server

Independent Express.js, TypeScript, and Prisma ORM backend service for the Code Editor SaaS platform.

## Features
- **RESTful API**: Authentication, Project CRUD, File Explorer operations, Open VSX extensions search.
- **Terminal & PTY**: Cross-platform interactive shell sessions via `node-pty`.
- **WebSocket Streaming**: Real-time terminal bidirectional streaming on port 3005.
- **Live Preview & Dev Server**: Dynamic compiler and development server process management.
- **AI Integrations**: OpenAI, Anthropic Claude, and Google Gemini with diff extraction and error sanitization.
- **Database**: PostgreSQL with Prisma ORM connection pooling and migrations.

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Create `.env` based on `.env.example`:
```bash
cp .env.example .env
```
Ensure `DATABASE_URL` and `JWT_SECRET` are properly set.

### 3. Generate Prisma Client
```bash
npm run prisma:generate
```

### 4. Run Development Server
```bash
npm run dev
```
The server will start on `http://localhost:4000` with WebSockets on port `3005`.

### 5. Build for Production
```bash
npm run build
npm start
```

## Directory Structure
```text
backend/
├── prisma/
│   └── schema.prisma         # PostgreSQL schema definition
├── src/
│   ├── auth/                 # JWT and password encryption helpers
│   ├── config/               # Environment variable configuration
│   ├── controllers/          # HTTP route controller handlers
│   ├── db/                   # Prisma singleton client
│   ├── middleware/           # Auth and rate limiting middleware
│   ├── routes/               # Express API routes
│   ├── services/             # Core business logic & terminal/disk services
│   ├── types/                # Backend TypeScript types
│   ├── utils/                # Framework detection & ANSI utilities
│   └── server.ts             # Express & WebSocket entry point
├── .env.example
├── .gitignore
├── package.json
├── README.md
└── tsconfig.json
```

