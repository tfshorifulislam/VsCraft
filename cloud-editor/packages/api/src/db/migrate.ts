import { statSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./pool.js";
import { logger } from "../utils/logger.js";

const MIGRATIONS_TABLE = "schema_migrations";
const MIGRATION_LOCK_KEY = 1_042_019_801;
const moduleDir = dirname(fileURLToPath(import.meta.url));

const isDirectory = (candidate: string): boolean => {
  try {
    return statSync(candidate).isDirectory();
  } catch {
    return false;
  }
};

const resolveMigrationsDir = (): string => {
  const candidates = [
    process.env.MIGRATIONS_DIR,
    join(moduleDir, "migrations"),
    resolve(moduleDir, "../../src/db/migrations"),
    resolve(process.cwd(), "src/db/migrations"),
    resolve(process.cwd(), "packages/api/src/db/migrations")
  ].filter((candidate): candidate is string => typeof candidate === "string" && candidate.length > 0);

  for (const candidate of candidates) {
    if (isDirectory(candidate)) {
      return resolve(candidate);
    }
  }

  throw new Error(
    `Migrations directory not found. Looked in:\n${candidates
      .map((candidate) => `  - ${candidate}`)
      .join("\n")}`
  );
};

const listMigrationFiles = async (migrationsDir: string): Promise<string[]> => {
  const entries = await readdir(migrationsDir, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
};

const runMigrations = async (): Promise<void> => {
  const migrationsDir = resolveMigrationsDir();
  const migrationFiles = await listMigrationFiles(migrationsDir);
  const client = await pool.connect();
  let lockAcquired = false;

  try {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);
    lockAcquired = true;
    logger.info({ lockKey: MIGRATION_LOCK_KEY }, "Acquired migration advisory lock");

    await client.query(
      `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
        version text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`
    );

    const appliedResult = await client.query<{ version: string }>(
      `SELECT version FROM ${MIGRATIONS_TABLE}`
    );
    const appliedVersions = new Set(appliedResult.rows.map((row) => row.version));

    if (migrationFiles.length === 0) {
      logger.warn({ migrationsDir }, "No migration files found");
      return;
    }

    for (const version of migrationFiles) {
      if (appliedVersions.has(version)) {
        logger.info({ migration: version }, "Skipped migration (already applied)");
        continue;
      }

      const sql = await readFile(join(migrationsDir, version), "utf8");
      logger.info({ migration: version }, "Applying migration");

      let transactionOpen = false;

      try {
        await client.query("BEGIN");
        transactionOpen = true;
        await client.query(sql);
        await client.query(`INSERT INTO ${MIGRATIONS_TABLE} (version) VALUES ($1)`, [version]);
        await client.query("COMMIT");
        transactionOpen = false;
        logger.info({ migration: version }, "Applied migration");
      } catch (error) {
        if (transactionOpen) {
          await client.query("ROLLBACK").catch((rollbackError: unknown) => {
            logger.error({ err: rollbackError, migration: version }, "Failed to roll back migration");
          });
        }

        throw error;
      }
    }
  } finally {
    if (lockAcquired) {
      await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY]).catch(
        (unlockError: unknown) => {
          logger.error({ err: unlockError }, "Failed to release migration advisory lock");
        }
      );
    }

    client.release();
  }
};

runMigrations()
  .then(async () => {
    logger.info("Migrations complete");
    await pool.end();
  })
  .catch(async (error: unknown) => {
    logger.error({ err: error }, "Migration failed");
    process.exitCode = 1;
    await pool.end().catch(() => undefined);
  });
