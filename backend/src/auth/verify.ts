import { jwtVerify } from "jose";
import { config } from "../config";

export interface TokenPayload {
  userId: string;
  email?: string;
}

const secret = new TextEncoder().encode(config.jwtSecret);

export async function verifyToken(token: string | null | undefined): Promise<TokenPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    const userId = (payload.sub || payload.userId) as string | undefined;
    if (!userId) return null;
    return { userId, email: payload.email as string | undefined };
  } catch {
    return null;
  }
}
