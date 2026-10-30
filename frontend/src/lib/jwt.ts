import { SignJWT, jwtVerify } from "jose";

export const AUTH_COOKIE = "codefigma_token";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

// Must match backend/src/config.ts so the realtime server can verify tokens.
const secret = new TextEncoder().encode(
  process.env.JWT_SECRET ||
    "codefigma-dev-secret-change-me-please-32-chars-minimum"
);

export interface SessionPayload {
  userId: string;
  email?: string;
}

export async function signSessionToken(
  userId: string,
  email: string,
  expiresIn: string = "7d"
): Promise<string> {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret);
}

export async function verifySessionToken(
  token: string | null | undefined
): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ["HS256"],
    });
    const userId = (payload.sub || payload.userId) as string | undefined;
    if (!userId) return null;
    return { userId, email: payload.email as string | undefined };
  } catch {
    return null;
  }
}
