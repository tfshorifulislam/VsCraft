import { logger } from "./logger.js";

const reconciliationLogger = logger.child({ subsystem: "s3-reconciliation" });

export const logReconciliationFailure = (
  operation: string,
  context: Record<string, unknown>,
  error: unknown
): void => {
  reconciliationLogger.error(
    {
      event: "s3_reconciliation_required",
      operation,
      err: error,
      ...context
    },
    "S3 operation failed after metadata change; reconciliation is required"
  );
};
