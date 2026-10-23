import { Request } from "express";
import { verifySessionToken, SessionPayload } from "./jwt";
import prisma from "../db/prisma";

export const SESSION_COOKIE_NAME = "code_editor_session";

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: (process.env.NODE_ENV === "production" ? "none" : "lax") as "none" | "lax",
  path: "/",
  maxAge: 30 * 24 * 60 * 60 * 1000,
};

export function extractTokenFromRequest(req: Request): string | null {
  if (req.cookies && req.cookies[SESSION_COOKIE_NAME]) {
    return req.cookies[SESSION_COOKIE_NAME];
  }
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.substring(7).trim();
  }
  return null;
}

export async function getSessionPayload(req: Request): Promise<SessionPayload | null> {
  const token = extractTokenFromRequest(req);
  if (!token) return null;
  return verifySessionToken(token);
}

export async function getSessionUser(req: Request) {
  const payload = await getSessionPayload(req);
  if (!payload) return null;

  try {
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        createdAt: true,
        settings: true,
      },
    });
    return user;
  } catch (error) {
    console.error("Failed to query session user:", error);
    return null;
  }
}
