import { createServer, type IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { WebSocketServer, type WebSocket } from "ws";
import { HEALTH_PATH, TERMINAL_WS_PATH } from "@cloud-editor/shared";
import { env } from "./config/env.js";
import { logger } from "./utils/logger.js";

const allowedOrigins = new Set(
  env.CORS_ORIGIN.split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0)
);

const app = express();
const httpServer = createServer(app);
const webSocketServer = new WebSocketServer({
  noServer: true,
  maxPayload: 1_048_576,
  perMessageDeflate: false,
  clientTracking: true
});

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      if (origin === undefined || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      callback(null, false);
    },
    credentials: true,
    methods: ["GET", "HEAD", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 86_400
  })
);
app.use(
  pinoHttp({
    logger,
    customLogLevel: (_req, res, error) => {
      if (error !== undefined || res.statusCode >= 500) {
        return "error";
      }

      return res.statusCode >= 400 ? "warn" : "info";
    },
    autoLogging: {
      ignore: (req) => req.url === HEALTH_PATH
    }
  })
);

app.get(HEALTH_PATH, (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "runner",
    activeTerminalConnections: webSocketServer.clients.size,
    limits: {
      maxTimeoutMs: env.RUNNER_MAX_TIMEOUT_MS,
      maxMemoryMb: env.RUNNER_MAX_MEMORY_MB,
      maxCpu: env.RUNNER_MAX_CPU
    },
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

app.use((_req, res) => {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Route was not found" } });
});

const rejectUpgrade = (socket: Duplex, statusCode: number, message: string): void => {
  const body = `${message}\n`;
  socket.write(
    `HTTP/1.1 ${statusCode} ${statusCode === 403 ? "Forbidden" : "Not Found"}\r\n` +
      "Connection: close\r\n" +
      "Content-Type: text/plain; charset=utf-8\r\n" +
      `Content-Length: ${Buffer.byteLength(body)}\r\n` +
      "\r\n" +
      body
  );
  socket.destroy();
};

httpServer.on("upgrade", (request: IncomingMessage, socket: Duplex, head: Buffer) => {
  let pathname: string;

  try {
    pathname = new URL(request.url ?? "/", "http://localhost").pathname;
  } catch {
    rejectUpgrade(socket, 404, "Invalid upgrade request");
    return;
  }

  if (pathname !== TERMINAL_WS_PATH) {
    rejectUpgrade(socket, 404, "WebSocket endpoint not found");
    return;
  }

  const origin = request.headers.origin;

  if (origin !== undefined && !allowedOrigins.has(origin)) {
    rejectUpgrade(socket, 403, "Origin is not allowed");
    return;
  }

  webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
    webSocketServer.emit("connection", webSocket, request);
  });
});

webSocketServer.on("connection", (webSocket: WebSocket, request: IncomingMessage) => {
  const remoteAddress = request.socket.remoteAddress ?? "unknown";
  logger.info({ remoteAddress }, "Terminal WebSocket connected; PTY runtime is not enabled");

  webSocket.send(
    JSON.stringify({
      type: "error",
      code: "TERMINAL_RUNTIME_UNAVAILABLE",
      message: "The terminal runtime is not enabled in this build"
    })
  );
  webSocket.close(1013, "Terminal runtime unavailable");
});

webSocketServer.on("error", (error: Error) => {
  logger.error({ err: error }, "WebSocket server error");
});

let shuttingDown = false;

const closeHttpServer = (): Promise<void> =>
  new Promise((resolve, reject) => {
    httpServer.close((error) => {
      if (error !== undefined) {
        reject(error);
        return;
      }

      resolve();
    });
  });

const closeWebSocketServer = (): Promise<void> =>
  new Promise((resolve) => {
    webSocketServer.close(() => {
      resolve();
    });
  });

const shutdown = (reason: string): void => {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  logger.info({ reason }, "Graceful shutdown started");

  const forceShutdownTimer = setTimeout(() => {
    logger.error("Graceful shutdown timed out; forcing exit");
    process.exit(1);
  }, 10_000);
  forceShutdownTimer.unref();

  for (const client of webSocketServer.clients) {
    client.close(1001, "Server shutting down");
  }

  void Promise.allSettled([closeHttpServer(), closeWebSocketServer()])
    .then((results) => {
      for (const result of results) {
        if (result.status === "rejected") {
          logger.error({ err: result.reason }, "Failed to close runner listener");
          process.exitCode = 1;
        }
      }
    })
    .finally(() => {
      clearTimeout(forceShutdownTimer);
      logger.info("Shutdown complete");
    });
};

httpServer.listen(env.RUNNER_PORT, "0.0.0.0", () => {
  logger.info({ port: env.RUNNER_PORT }, "Runner service listening");
});

process.once("SIGTERM", () => {
  shutdown("SIGTERM");
});

process.once("SIGINT", () => {
  shutdown("SIGINT");
});

process.on("unhandledRejection", (reason) => {
  logger.fatal({ err: reason }, "Unhandled promise rejection");
  shutdown("unhandledRejection");
});

process.on("uncaughtException", (error) => {
  logger.fatal({ err: error }, "Uncaught exception");
  shutdown("uncaughtException");
});
