import type { Request, Response } from "express";
import { RateLimiterRedis } from "rate-limiter-flexible";
import { ensureRedisConnected, redisClient } from "../config/redis.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const WINDOW_SECONDS = 15 * 60;

const authPointLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: "rl:auth",
  points: 10,
  duration: WINDOW_SECONDS,
  rejectIfRedisNotReady: true
});

const refreshPointLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: "rl:refresh",
  points: 30,
  duration: WINDOW_SECONDS,
  rejectIfRedisNotReady: true
});

const getClientIp = (req: Request): string => {
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
};

const getAuthKey = (req: Request): string => {
  const body: unknown = req.body;
  const email =
    typeof body === "object" &&
    body !== null &&
    "email" in body &&
    typeof (body as { email?: unknown }).email === "string"
      ? (body as { email: string }).email.trim().toLowerCase()
      : "unknown";

  return `${getClientIp(req)}:${email}`;
};

const sendRateLimited = (res: Response, msBeforeNext: number): void => {
  const retryAfterSeconds = Math.max(1, Math.ceil(msBeforeNext / 1_000));

  res.setHeader("Retry-After", String(retryAfterSeconds));
  res.status(429).json({
    error: {
      code: "rate_limited",
      message: "Too many requests. Try again later.",
      details: {
        retryAfterSeconds
      }
    }
  });
};

export const authLimiter = asyncHandler(async (req, res, next) => {
  await ensureRedisConnected();

  try {
    await authPointLimiter.consume(getAuthKey(req));
    next();
  } catch (rejection: unknown) {
    if (rejection instanceof Error) {
      throw rejection;
    }

    const msBeforeNext =
      typeof rejection === "object" &&
      rejection !== null &&
      "msBeforeNext" in rejection &&
      typeof (rejection as { msBeforeNext?: unknown }).msBeforeNext === "number"
        ? (rejection as { msBeforeNext: number }).msBeforeNext
        : WINDOW_SECONDS * 1_000;

    sendRateLimited(res, msBeforeNext);
  }
});

export const refreshLimiter = asyncHandler(async (req, res, next) => {
  await ensureRedisConnected();

  try {
    await refreshPointLimiter.consume(getClientIp(req));
    next();
  } catch (rejection: unknown) {
    if (rejection instanceof Error) {
      throw rejection;
    }

    const msBeforeNext =
      typeof rejection === "object" &&
      rejection !== null &&
      "msBeforeNext" in rejection &&
      typeof (rejection as { msBeforeNext?: unknown }).msBeforeNext === "number"
        ? (rejection as { msBeforeNext: number }).msBeforeNext
        : WINDOW_SECONDS * 1_000;

    sendRateLimited(res, msBeforeNext);
  }
});
