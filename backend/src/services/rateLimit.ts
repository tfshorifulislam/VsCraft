interface RateLimitRecord {
  timestamps: number[];
}

const rateLimitStores = new Map<string, Map<string, RateLimitRecord>>();

// Periodic cleanup every 5 minutes to prevent memory leak
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [, store] of rateLimitStores.entries()) {
      for (const [key, record] of store.entries()) {
        record.timestamps = record.timestamps.filter((ts) => now - ts < 300000);
        if (record.timestamps.length === 0) {
          store.delete(key);
        }
      }
    }
  }, 300000);
}

export interface RateLimitOptions {
  windowMs: number; // e.g. 60_000 (1 minute)
  max: number; // e.g. 10 requests per window
  bucketName: string; // identifier for endpoint/action
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetMs: number;
}

export function checkRateLimit(
  identifier: string,
  options: RateLimitOptions
): RateLimitResult {
  const { windowMs, max, bucketName } = options;
  const now = Date.now();

  let store = rateLimitStores.get(bucketName);
  if (!store) {
    store = new Map<string, RateLimitRecord>();
    rateLimitStores.set(bucketName, store);
  }

  let record = store.get(identifier);
  if (!record) {
    record = { timestamps: [] };
    store.set(identifier, record);
  }

  // Filter timestamps within current window
  const windowStart = now - windowMs;
  record.timestamps = record.timestamps.filter((ts) => ts > windowStart);

  if (record.timestamps.length >= max) {
    const oldest = record.timestamps[0];
    const resetMs = Math.max(0, oldest + windowMs - now);
    return {
      success: false,
      limit: max,
      remaining: 0,
      resetMs,
    };
  }

  record.timestamps.push(now);
  return {
    success: true,
    limit: max,
    remaining: max - record.timestamps.length,
    resetMs: windowMs,
  };
}

export function getClientIp(req: any): string {
  if (req.ip) {
    return req.ip;
  }
  if (req.socket?.remoteAddress) {
    return req.socket.remoteAddress;
  }
  if (req.headers) {
    const forwarded = typeof req.headers.get === "function" 
      ? req.headers.get("x-forwarded-for") 
      : req.headers["x-forwarded-for"];
    if (forwarded) {
      const forwardedStr = Array.isArray(forwarded) ? forwarded[0] : forwarded;
      return forwardedStr.split(",")[0].trim();
    }
    const realIp = typeof req.headers.get === "function" 
      ? req.headers.get("x-real-ip") 
      : req.headers["x-real-ip"];
    if (realIp) {
      return Array.isArray(realIp) ? realIp[0] : realIp;
    }
  }
  return "127.0.0.1";
}

