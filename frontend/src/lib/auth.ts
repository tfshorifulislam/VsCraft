import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import prisma from "./db";
import { AUTH_COOKIE, verifySessionToken } from "./jwt";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(AUTH_COOKIE)?.value;
  const payload = await verifySessionToken(token);
  if (!payload) return null;

  try {
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, name: true, createdAt: true },
    });

    return user;
  } catch (err) {
    console.error("Failed to fetch session user from database:", err);
    return null;
  }
}
