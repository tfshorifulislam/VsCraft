import type { RequestHandler } from "express";
import type { ZodTypeAny } from "zod";
import { BadRequest } from "../utils/errors.js";

export type ValidationSource = "body" | "query" | "params";

export const validate = (
  schema: ZodTypeAny,
  source: ValidationSource = "body"
): RequestHandler => {
  return (req, _res, next): void => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join(".") || "(root)",
        message: issue.message
      }));

      next(BadRequest("Validation failed", details));
      return;
    }

    if (source === "body") {
      req.body = result.data;
    } else if (source === "query") {
      req.query = result.data as typeof req.query;
    } else {
      req.params = result.data as typeof req.params;
    }

    next();
  };
};
