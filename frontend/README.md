# Code Editor Frontend

A modern Next.js 15+ App Router web application providing the user interface for the cloud-native Code Editor IDE.

## Features

- **Monaco Code Editor**: Syntax highlighting, intelligent autocompletion, multiple themes, tab management, and error diagnostics.
- **Empty Project & Templates**: Create completely empty projects or use starter templates (Next.js, React, Node.js, HTML/CSS).
- **PTY Terminal Panel**: Interactive terminal with toggle visibility, command execution, and session persistence via WebSockets.
- **Run Preview**: Explicitly controlled live preview frame with hot reload and isolated preview state.
- **AI Assistant**: Multi-provider code generation, explanation, refactoring, and inline completions (OpenAI, Anthropic, Gemini).
- **Full Authentication**: User signup, signin, cookie-based sessions, and protected workspaces.

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

| Variable | Description | Default |
| :--- | :--- | :--- |
| `BACKEND_URL` | Express API server URL for Next.js API rewrites | `http://localhost:4000` |
| `NEXT_PUBLIC_API_URL` | Client-accessible API base URL | `http://localhost:4000` |
| `NEXT_PUBLIC_WS_URL` | WebSocket URL for PTY terminal session | `ws://localhost:3005` |

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 4. Build for Production

```bash
npm run build
npm run start
```

