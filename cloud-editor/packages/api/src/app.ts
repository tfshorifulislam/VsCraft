import { randomUUID } from "node:crypto";
import cookieParser from "cookie-parser";
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
import { authRouter } from "./routes/auth.routes.js";
import { projectRouter } from "./routes/project.routes.js";
import { AppError } from "./utils/errors.js";
import { logger } from "./utils/logger.js";

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
const maxJsonBodyBytes =
  Math.ceil((env.MAX_FILE_SIZE_MB * 1024 * 1024 * 4) / 3) + 1024 * 1024;

app.use(express.json({ limit: maxJsonBodyBytes }));
app.use(express.urlencoded({ extended: false, limit: maxJsonBodyBytes }));
app.use(cookieParser());

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

app.use("/api/auth", authRouter);
app.use("/api/projects", projectRouter);
app.use(`${API_PREFIX}/projects`, projectRouter);

app.use((req, res) => {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: `Route ${req.method} ${req.originalUrl} was not found`,
      requestId: typeof res.locals.requestId === "string" ? res.locals.requestId : null
    }
  });
});

const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  const requestIdValue: unknown = res.locals.requestId;
  const requestLogger = req.log ?? logger;

  if (error instanceof AppError) {
    if (error.status >= 500) {
      requestLogger.error({ err: error, requestId: requestIdValue }, "Request failed");
    } else {
      requestLogger.warn({ err: error, requestId: requestIdValue }, "Request rejected");
    }

    const payload: { code: string; message: string; details?: unknown } = {
      code: error.code,
      message: error.message
    };

    if (error.details !== undefined) {
      payload.details = error.details;
    }

    res.status(error.status).json({ error: payload });
    return;
  }

  const bodyParserError = error as {
    type?: unknown;
    status?: unknown;
    statusCode?: unknown;
  };
  const bodyParserStatus =
    typeof bodyParserError.status === "number"
      ? bodyParserError.status
      : typeof bodyParserError.statusCode === "number"
        ? bodyParserError.statusCode
        : undefined;

  if (bodyParserStatus === 413 || bodyParserError.type === "entity.too.large") {
    requestLogger.warn({ err: error, requestId: requestIdValue }, "Request body too large");
    res.status(413).json({
      error: {
        code: "PAYLOAD_TOO_LARGE",
        message: "Request body exceeds the configured limit"
      }
    });
    return;
  }

  if (bodyParserStatus === 400 || bodyParserError.type === "entity.parse.failed") {
    requestLogger.warn({ err: error, requestId: requestIdValue }, "Malformed request body");
    res.status(400).json({
      error: {
        code: "INVALID_JSON",
        message: "Malformed JSON request body"
      }
    });
    return;
  }

  requestLogger.error({ err: error, requestId: requestIdValue }, "Unhandled request error");
  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "Internal server error"
    }
  });
};

app.use(errorHandler);
