import { createServer } from "node:http";
import { createAdapter } from "@socket.io/redis-adapter";
import express from "express";
import { createClient } from "redis";
import { Server } from "socket.io";
import { HEALTH_PATH, SOCKET_IO_PATH } from "@cloud-editor/shared";
import { env } from "./config/env.js";
import { logger } from "./utils/logger.js";

const allowedOrigins = env.CORS_ORIGIN.split(",")
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  path: SOCKET_IO_PATH,
  serveClient: false,
  cors: {
    origin: allowedOrigins,
    credentials: true
  },
  transports: ["websocket", "polling"],
  maxHttpBufferSize: 1_000_000,
  pingInterval: 25_000,
  pingTimeout: 20_000
});

const pubClient = createClient({ url: env.REDIS_URL });
const subClient = pubClient.duplicate();

for (const [name, client] of [
  ["redis-pub", pubClient],
  ["redis-sub", subClient]
] as const) {
  client.on("error", (error: unknown) => {
    logger.error({ err: error, client: name }, "Redis client error");
  });
  client.on("reconnecting", () => {
    logger.warn({ client: name }, "Redis client reconnecting");
  });
  client.on("ready", () => {
    logger.info({ client: name }, "Redis client ready");
  });
}

app.disable("x-powered-by");
app.get(HEALTH_PATH, (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "realtime",
    connections: io.engine.clientsCount,
    redis: pubClient.isReady ? "ready" : "disconnected",
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString()
  });
});
app.use((_req, res) => {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Route was not found" } });
});

io.engine.on("connection_error", (error) => {
  logger.warn(
    {
      code: error.code,
      message: error.message,
      context: error.context
    },
    "Socket.IO connection error"
  );
});

let shuttingDown = false;

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

  io.close((ioError) => {
    if (ioError !== undefined) {
      logger.error({ err: ioError }, "Socket.IO server failed to close cleanly");
      process.exitCode = 1;
    }

    void Promise.allSettled([pubClient.quit(), subClient.quit()])
      .then((results) => {
        for (const result of results) {
          if (result.status === "rejected") {
            logger.error({ err: result.reason }, "Failed to close Redis client");
            process.exitCode = 1;
          }
        }
      })
      .finally(() => {
        clearTimeout(forceShutdownTimer);
        logger.info("Shutdown complete");
      });
  });
};

const bootstrap = async (): Promise<void> => {
  await Promise.all([pubClient.connect(), subClient.connect()]);
  io.adapter(createAdapter(pubClient, subClient, { key: "cloud-editor" }));

  httpServer.listen(env.REALTIME_PORT, "0.0.0.0", () => {
    logger.info({ port: env.REALTIME_PORT }, "Realtime service listening");
  });
};

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

void bootstrap().catch(async (error: unknown) => {
  logger.fatal({ err: error }, "Failed to start realtime service");
  await Promise.allSettled([pubClient.quit(), subClient.quit()]);
  process.exit(1);
});
