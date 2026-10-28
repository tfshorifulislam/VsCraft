import pino, { type LoggerOptions } from "pino";
import { env } from "../config/env.js";

const isDevelopment = env.NODE_ENV === "development";

const options: LoggerOptions = {
  level: isDevelopment ? "debug" : "info",
  base: {
    service: "realtime"
  },
  redact: {
    paths: ["authorization", "cookie", "password", "token", "secret"],
    censor: "[REDACTED]"
  },
  ...(isDevelopment
    ? {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
            ignore: "pid,hostname"
          }
        }
      }
    : {})
};

export const logger = pino(options);
