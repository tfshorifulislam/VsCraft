import type { Request, Response } from "express";
import type { LoginInput, RegisterInput } from "@cloud-editor/shared";
import { env } from "../config/env.js";
import * as authService from "../services/auth.service.js";
import {
  createRefreshToken,
  signAccessToken,
  type RefreshTokenMeta
} from "../services/token.service.js";
import { parseDurationMs } from "../utils/duration.js";
import { AuthError } from "../utils/errors.js";
import { assertAuthenticated } from "../middlewares/auth.middleware.js";

const REFRESH_COOKIE_NAME = "refresh_token";
const REFRESH_COOKIE_PATH = "/api/auth";

const cookieBaseOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: REFRESH_COOKIE_PATH
};

const refreshCookieOptions = {
  ...cookieBaseOptions,
  maxAge: parseDurationMs(env.JWT_REFRESH_TTL)
};

const getRequestMeta = (req: Request): RefreshTokenMeta => ({
  userAgent: req.get("user-agent"),
  ip: req.ip
});

const setRefreshCookie = (res: Response, rawRefresh: string): void => {
  res.cookie(REFRESH_COOKIE_NAME, rawRefresh, refreshCookieOptions);
};

const clearRefreshCookie = (res: Response): void => {
  res.clearCookie(REFRESH_COOKIE_NAME, cookieBaseOptions);
};

const readRefreshCookie = (req: Request): string => {
  const value: unknown = req.cookies?.[REFRESH_COOKIE_NAME];

  if (typeof value !== "string" || value.length === 0) {
    throw AuthError("missing_refresh_token");
  }

  return value;
};

export const register = async (req: Request, res: Response): Promise<void> => {
  const input = req.body as RegisterInput;
  const user = await authService.register(input);
  const accessToken = await signAccessToken({ sub: user.id, email: user.email });
  const refreshToken = await createRefreshToken(user.id, getRequestMeta(req));

  setRefreshCookie(res, refreshToken.raw);

  res.status(201).json({
    user,
    accessToken
  });
};

export const login = async (req: Request, res: Response): Promise<void> => {
  const input = req.body as LoginInput;
  const session = await authService.login({
    email: input.email,
    password: input.password,
    meta: getRequestMeta(req)
  });

  setRefreshCookie(res, session.refreshRaw);

  res.status(200).json({
    user: session.user,
    accessToken: session.accessToken
  });
};

export const refresh = async (req: Request, res: Response): Promise<void> => {
  const session = await authService.refresh({
    rawRefresh: readRefreshCookie(req),
    meta: getRequestMeta(req)
  });

  setRefreshCookie(res, session.refreshRaw);

  res.status(200).json({
    user: session.user,
    accessToken: session.accessToken
  });
};

export const logout = async (req: Request, res: Response): Promise<void> => {
  const value: unknown = req.cookies?.[REFRESH_COOKIE_NAME];

  if (typeof value === "string" && value.length > 0) {
    await authService.logout({ rawRefresh: value });
  }

  clearRefreshCookie(res);
  res.status(204).send();
};

export const me = async (req: Request, res: Response): Promise<void> => {
  const user = await authService.getMe(assertAuthenticated(req).id);

  res.status(200).json({ user });
};
