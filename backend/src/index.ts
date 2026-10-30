import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import { config } from "./config";
import { handleTerminalConnection } from "./pty/terminal";
import { handleEditorSyncConnection } from "./socket/editorSync";

const app = express();

app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "codefigma-realtime",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

app.get("/", (_req, res) => {
  res.json({
    service: "CodeFigma realtime backend",
    websockets: ["/terminal", "/sync"],
  });
});

const server = http.createServer(app);

const terminalWss = new WebSocketServer({ noServer: true });
const syncWss = new WebSocketServer({ noServer: true });

terminalWss.on("connection", (ws, req) => {
  void handleTerminalConnection(ws, req);
});

syncWss.on("connection", (ws, req) => {
  void handleEditorSyncConnection(ws, req);
});

server.on("upgrade", (req, socket, head) => {
  const origin = req.headers.origin;
  if (origin && !config.allowedOrigins.includes(origin)) {
    socket.destroy();
    return;
  }

  const host = req.headers.host || "localhost";
  let pathname = "/";
  try {
    pathname = new URL(req.url || "/", `http://${host}`).pathname;
  } catch {
    socket.destroy();
    return;
  }

  if (pathname === "/terminal") {
    terminalWss.handleUpgrade(req, socket, head, (ws) => {
      terminalWss.emit("connection", ws, req);
    });
    return;
  }

  if (pathname === "/sync") {
    syncWss.handleUpgrade(req, socket, head, (ws) => {
      syncWss.emit("connection", ws, req);
    });
    return;
  }

  socket.destroy();
});

server.listen(config.port, () => {
  console.log(
    `[CodeFigma] realtime backend listening on :${config.port} (terminal + sync)`
  );
});

export default app;
