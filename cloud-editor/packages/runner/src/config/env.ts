import { resolve } from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

for (const envPath of [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../../.env")]) {
  dotenv.config({ path: envPath, override: false });
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  RUNNER_PORT: z.coerce.number().int().min(1).max(65535).default(4002),
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
  RUNNER_MAX_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(300_000).default(30_000),
  RUNNER_MAX_MEMORY_MB: z.coerce.number().int().min(64).max(4_096).default(256),
  RUNNER_MAX_CPU: z.coerce.number().min(0.1).max(4).default(0.5),
  CORS_ORIGIN: z.string().trim().min(1).default("http://localhost:3000")
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const details = parsedEnv.error.issues
    .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");

  throw new Error(`Invalid runner environment configuration:\n${details}`);
}

export type Env = z.infer<typeof envSchema>;

export const env: Readonly<Env> = Object.freeze(parsedEnv.data);
