import { Request, Response, NextFunction } from "express";
import { checkRateLimit, getClientIp } from "../services/rateLimit";

export function rateLimit(options: { windowMs: number; max: number; bucketName: string }) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = getClientIp(req);
    const result = checkRateLimit(ip, options);

    res.setHeader("X-RateLimit-Limit", result.limit);
    res.setHeader("X-RateLimit-Remaining", result.remaining);
    res.setHeader("X-RateLimit-Reset", Math.ceil(result.resetMs / 1000));

    if (!result.success) {
      return res.status(429).json({
        error: "Too many requests. Please try again later.",
        retryAfter: Math.ceil(result.resetMs / 1000),
      });
    }

    next();
  };
}
