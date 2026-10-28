import { createServer } from "node:http";
import { app } from "./app.js";
import { env } from "./config/env.js";
import { closeRedis } from "./config/redis.js";
import { pool } from "./db/pool.js";
import { logger } from "./utils/logger.js";

const server = createServer(app);
const shutdownTimeoutMs = 10_000;

server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

server.listen(env.API_PORT, "0.0.0.0", () => {
  logger.info({ port: env.API_PORT }, "API listening");
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
  }, shutdownTimeoutMs);
  forceShutdownTimer.unref();

  server.close((serverError) => {
    if (serverError !== undefined) {
      logger.error({ err: serverError }, "HTTP server failed to close cleanly");
      process.exitCode = 1;
    }

    void Promise.allSettled([pool.end(), closeRedis()])
      .then((results) => {
        for (const result of results) {
          if (result.status === "rejected") {
            logger.error({ err: result.reason }, "Failed to close shutdown resource");
            process.exitCode = 1;
          }
        }

        logger.info("PostgreSQL pool and Redis client closed");
      })
      .finally(() => {
        clearTimeout(forceShutdownTimer);
        logger.info("Shutdown complete");
      });
  });

  server.closeIdleConnections();
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
