import { randomUUID } from "node:crypto";
import cors from "cors";
import express, {
  type ErrorRequestHandler,
  type NextFunction,
  type Request,
  type Response,
  type Router
} from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { API_PREFIX, HEALTH_PATH } from "@cloud-editor/shared";
import { env } from "./config/env.js";
import { logger } from "./utils/logger.js";

interface HttpError extends Error {
  status?: number;
  statusCode?: number;
}

const allowedOrigins = new Set(
  env.CORS_ORIGIN.split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0)
);

const requestId = (req: Request, res: Response, next: NextFunction): void => {
  const incomingRequestId = req.header("x-request-id");
  const validIncomingRequestId =
    incomingRequestId !== undefined && /^[A-Za-z0-9._:-]{1,128}$/.test(incomingRequestId);
  const id = validIncomingRequestId ? incomingRequestId : randomUUID();

  res.locals.requestId = id;
  res.setHeader("X-Request-Id", id);
  next();
};

export const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.set("etag", false);

app.use(requestId);
app.use(
  pinoHttp({
    logger,
    genReqId: (_req, res) => {
      const id: unknown = res.locals.requestId;
      return typeof id === "string" ? id : randomUUID();
    },
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
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
    exposedHeaders: ["X-Request-Id"],
    maxAge: 86_400
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

app.get(HEALTH_PATH, (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "api",
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

const routes: Router[] = [];

if (routes.length > 0) {
  app.use(API_PREFIX, ...routes);
}

app.use((req, res) => {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: `Route ${req.method} ${req.originalUrl} was not found`,
      requestId: typeof res.locals.requestId === "string" ? res.locals.requestId : null
    }
  });
});

const errorHandler: ErrorRequestHandler = (error: unknown, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  const httpError = error instanceof Error ? (error as HttpError) : undefined;
  const candidateStatus = httpError?.status ?? httpError?.statusCode;
  const status =
    typeof candidateStatus === "number" && candidateStatus >= 400 && candidateStatus <= 599
      ? candidateStatus
      : 500;
  const requestIdValue: unknown = res.locals.requestId;
  const requestLogger = req.log ?? logger;

  if (status >= 500) {
    requestLogger.error({ err: error, requestId: requestIdValue }, "Request failed");
  } else {
    requestLogger.warn({ err: error, requestId: requestIdValue }, "Request rejected");
  }

  const message =
    status >= 500 && env.NODE_ENV === "production"
      ? "Internal server error"
      : httpError?.message || "Internal server error";

  res.status(status).json({
    error: {
      code: status >= 500 ? "INTERNAL_ERROR" : "REQUEST_ERROR",
      message,
      requestId: typeof requestIdValue === "string" ? requestIdValue : null
    }
  });
};

app.use(errorHandler);
