import dotenv from "dotenv";
dotenv.config();

import express from "express";
import http from "http";
import cors from "cors";
import cookieParser from "cookie-parser";
import { config } from "./config";

import authRouter from "./routes/auth";
import aiRouter from "./routes/ai";
import extensionsRouter from "./routes/extensions";
import projectsRouter from "./routes/projects";
import filesRouter from "./routes/files";
import terminalRouter from "./routes/terminal";
import workspacesRouter from "./routes/workspaces";
import { getOrCreateTerminalWSServer } from "./services/terminalWebSocketServer";

const app = express();

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (
        config.allowedOrigins.includes(origin) ||
        config.nodeEnv !== "production" ||
        origin.endsWith(".vercel.app")
      ) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    credentials: true,
  })
);

app.use(cookieParser());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Health Check
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Mount Routes
app.use("/api/auth", authRouter);
app.use("/api/ai", aiRouter);
app.use("/api/extensions", extensionsRouter);
app.use("/api/projects", filesRouter);
app.use("/api/projects", terminalRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/workspaces", workspacesRouter);

// Global Error Handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Express Unhandled Error:", err);
  if (err.type === "entity.too.large" || err.status === 413) {
    return res.status(413).json({
      error: "Project payload exceeds maximum allowed upload size (50MB). Please exclude large media or archives.",
    });
  }
  res.status(err.status || 500).json({
    error: err.message || "Internal Server Error",
  });
});

const server = http.createServer(app);

server.listen(config.port, () => {
  console.log(`[Backend] Code Editor API server running on port ${config.port}`);
  try {
    getOrCreateTerminalWSServer();
    console.log(`[Backend] Terminal WebSocket server initialized on port ${config.terminalWsPort}.`);
  } catch (wsErr) {
    console.warn("[Backend] WebSocket server deferred or port conflict:", wsErr);
  }
});

export default app;

