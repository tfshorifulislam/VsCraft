import dotenv from "dotenv";

dotenv.config();

const nodeEnv = process.env.NODE_ENV || "development";

if (nodeEnv === "production" && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) {
  throw new Error(
    "JWT_SECRET (minimum 32 characters) is required in production."
  );
}

const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";

export const config = {
  nodeEnv,
  port: parseInt(process.env.PORT || "4000", 10),
  frontendUrl,
  allowedOrigins: [
    ...new Set(
      [
        ...frontendUrl.split(","),
        "http://localhost:3000",
        "http://127.0.0.1:3000",
      ]
        .map((origin) => origin.trim())
        .filter(Boolean)
    ),
  ],
  jwtSecret:
    process.env.JWT_SECRET ||
    "codefigma-dev-secret-change-me-please-32-chars-minimum",
  terminalShell: process.env.TERMINAL_SHELL || "bash",
  syncIntervalMs: parseInt(process.env.SYNC_INTERVAL_MS || "2500", 10),
};
