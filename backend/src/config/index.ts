import dotenv from "dotenv";
import path from "path";

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || "4000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:3000",
  allowedOrigins: [
    process.env.FRONTEND_URL || "http://localhost:3000",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ],
  jwtSecret: process.env.JWT_SECRET || "code-editor-ultra-secure-jwt-secret-key-32-chars-min-prod-key-99",
  databaseUrl: process.env.DATABASE_URL || "",
  terminalWsPort: parseInt(process.env.TERMINAL_WS_PORT || "3005", 10),
  workspacesDir: process.env.WORKSPACES_DIR
    ? path.resolve(process.env.WORKSPACES_DIR)
    : path.resolve(__dirname, "../../workspaces"),
  ai: {
    openaiKey: process.env.OPENAI_API_KEY || "",
    openaiModel: process.env.OPENAI_MODEL || "gpt-4o-mini",
    anthropicKey: process.env.ANTHROPIC_API_KEY || "",
    anthropicModel: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
    anthropicWorkspaceId: process.env.ANTHROPIC_WORKSPACE_ID || "",
    geminiKey: process.env.GEMINI_API_KEY || "",
    geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  },
};

