import { resolve } from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

for (const envPath of [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../../.env")]) {
  dotenv.config({ path: envPath, override: false });
}

const ttlSchema = z
  .string()
  .trim()
  .regex(/^\d+(ms|s|m|h|d)$/, "TTL must be a duration such as 15m, 7d, or 3600s");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z
    .string()
    .min(1)
    .refine(
      (value) => value.startsWith("postgresql://") || value.startsWith("postgres://"),
      "DATABASE_URL must be a PostgreSQL connection string"
    ),
  REDIS_URL: z
    .string()
    .min(1)
    .refine(
      (value) => value.startsWith("redis://") || value.startsWith("rediss://"),
      "REDIS_URL must be a Redis connection string"
    ),
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 characters"),
  JWT_ACCESS_TTL: ttlSchema.default("15m"),
  JWT_REFRESH_TTL: ttlSchema.default("7d"),
  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  CORS_ORIGIN: z.string().trim().min(1).default("http://localhost:3000")
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const details = parsedEnv.error.issues
    .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");

  throw new Error(`Invalid API environment configuration:\n${details}`);
}

export type Env = z.infer<typeof envSchema>;

export const env: Readonly<Env> = Object.freeze(parsedEnv.data);
