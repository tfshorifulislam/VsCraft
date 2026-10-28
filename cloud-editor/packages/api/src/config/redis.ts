import { createClient } from "redis";
import { env } from "./env.js";
import { logger } from "../utils/logger.js";

export const redisClient = createClient({ url: env.REDIS_URL });

redisClient.on("error", (error: unknown) => {
  logger.error({ err: error }, "Redis client error");
});

redisClient.on("reconnecting", () => {
  logger.warn("Redis client reconnecting");
});

redisClient.on("ready", () => {
  logger.info("Redis client ready");
});

let connectPromise: Promise<unknown> | null = null;

export const ensureRedisConnected = async (): Promise<void> => {
  if (redisClient.isReady) {
    return;
  }

  if (connectPromise === null) {
    connectPromise = redisClient.connect().catch((error: unknown) => {
      connectPromise = null;
      throw error;
    });
  }

  await connectPromise;
};

export const closeRedis = async (): Promise<void> => {
  if (redisClient.isOpen) {
    await redisClient.quit();
  }
};
