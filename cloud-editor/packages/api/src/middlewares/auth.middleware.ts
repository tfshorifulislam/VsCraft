import type { Request } from "express";
import { verifyAccessToken } from "../services/token.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AuthError, Unauthorized } from "../utils/errors.js";

const readBearerToken = (req: Request): string | undefined => {
  const header = req.header("authorization");

  if (header === undefined) {
    return undefined;
  }

  const [scheme, token, ...rest] = header.trim().split(/\s+/);

  if (scheme?.toLowerCase() !== "bearer" || token === undefined || token.length === 0 || rest.length > 0) {
    return undefined;
  }

  return token;
};

export const requireAuth = asyncHandler(async (req, _res, next) => {
  const token = readBearerToken(req);

  if (token === undefined) {
    throw AuthError("invalid_access_token");
  }

  try {
    const payload = await verifyAccessToken(token);
    req.user = {
      id: payload.sub,
      email: payload.email
    };
  } catch {
    throw AuthError("invalid_access_token");
  }

  next();
});

export const optionalAuth = asyncHandler(async (req, _res, next) => {
  const token = readBearerToken(req);

  if (token === undefined) {
    next();
    return;
  }

  try {
    const payload = await verifyAccessToken(token);
    req.user = {
      id: payload.sub,
      email: payload.email
    };
  } catch {
    req.user = undefined;
  }

  next();
});

export const assertAuthenticated = (req: Request): { id: string; email: string } => {
  if (req.user === undefined) {
    throw Unauthorized("Authentication is required");
  }

  return req.user;
};
