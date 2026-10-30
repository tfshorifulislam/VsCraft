import { Prisma } from "@prisma/client";

export interface AuthErrorResult {
  status: number;
  message: string;
}

/**
 * Turns database/config failures into actionable messages instead of hiding
 * every failure behind the same generic sign-in error. Messages are safe to
 * return to the browser: they never include connection strings or secrets.
 */
export function describeAuthError(
  error: unknown,
  fallbackMessage: string
): AuthErrorResult {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2021" || error.code === "P2022") {
      return {
        status: 503,
        message:
          "The database schema is not initialized. Run `npx prisma migrate deploy` against the deployment database, then try again.",
      };
    }
    if (/^P1\d{3}$/.test(error.code) || error.code === "P2024") {
      return databaseUnavailable();
    }
  }

  if (
    error instanceof Prisma.PrismaClientInitializationError ||
    error instanceof Prisma.PrismaClientRustPanicError
  ) {
    return databaseUnavailable();
  }

  return { status: 500, message: fallbackMessage };
}

function databaseUnavailable(): AuthErrorResult {
  return {
    status: 503,
    message:
      "The server cannot reach its database. Check DATABASE_URL (including sslmode) in the deployment environment and that the database is running.",
  };
}
