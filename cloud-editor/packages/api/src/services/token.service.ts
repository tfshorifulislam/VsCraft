import { createHash, randomBytes, randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import type { PoolClient } from "pg";
import { env } from "../config/env.js";
import { pool } from "../db/pool.js";
import { AuthError } from "../utils/errors.js";
import { parseDurationMs } from "../utils/duration.js";

export interface AccessTokenPayload {
  sub: string;
  email: string;
}

export interface VerifiedAccessToken {
  sub: string;
  email: string;
  jti: string;
}

export interface RefreshTokenMeta {
  userAgent?: string;
  ip?: string;
}

export interface CreatedRefreshToken {
  raw: string;
  expiresAt: Date;
}

export interface RotatedRefreshToken extends CreatedRefreshToken {
  userId: string;
}

interface RefreshTokenRow {
  id: string;
  user_id: string;
  expires_at: Date;
  revoked_at: Date | null;
}

const JWT_ISSUER = "cloud-editor";
const JWT_AUDIENCE = "access";
const accessTokenSecret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
const refreshTokenTtlMs = parseDurationMs(env.JWT_REFRESH_TTL);

const hashRefreshToken = (raw: string): string =>
  createHash("sha256").update(raw).digest("hex");

const generateRefreshToken = (): CreatedRefreshToken => {
  const raw = randomBytes(32).toString("base64url");

  return {
    raw,
    expiresAt: new Date(Date.now() + refreshTokenTtlMs)
  };
};

export const signAccessToken = async (payload: AccessTokenPayload): Promise<string> => {
  return new SignJWT({ email: payload.email })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(payload.sub)
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(env.JWT_ACCESS_TTL)
    .sign(accessTokenSecret);
};

export const verifyAccessToken = async (token: string): Promise<VerifiedAccessToken> => {
  const { payload } = await jwtVerify(token, accessTokenSecret, {
    algorithms: ["HS256"],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE
  });

  if (
    typeof payload.sub !== "string" ||
    typeof payload.email !== "string" ||
    typeof payload.jti !== "string"
  ) {
    throw new Error("Invalid access token payload");
  }

  return {
    sub: payload.sub,
    email: payload.email,
    jti: payload.jti
  };
};

export const createRefreshToken = async (
  userId: string,
  meta: RefreshTokenMeta = {}
): Promise<CreatedRefreshToken> => {
  const refreshToken = generateRefreshToken();

  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      userId,
      hashRefreshToken(refreshToken.raw),
      refreshToken.expiresAt,
      meta.userAgent ?? null,
      meta.ip ?? null
    ]
  );

  return refreshToken;
};

const revokeAllActiveForUser = async (client: PoolClient, userId: string): Promise<void> => {
  await client.query(
    `UPDATE refresh_tokens
     SET revoked_at = now()
     WHERE user_id = $1
       AND revoked_at IS NULL
       AND expires_at > now()`,
    [userId]
  );
};

export const rotateRefreshToken = async (
  rawOld: string,
  meta: RefreshTokenMeta = {}
): Promise<RotatedRefreshToken> => {
  const client = await pool.connect();
  let transactionOpen = false;

  try {
    await client.query("BEGIN");
    transactionOpen = true;

    const result = await client.query<RefreshTokenRow>(
      `SELECT id, user_id, expires_at, revoked_at
       FROM refresh_tokens
       WHERE token_hash = $1
       FOR UPDATE`,
      [hashRefreshToken(rawOld)]
    );
    const current = result.rows[0];

    if (current === undefined) {
      throw AuthError("invalid_refresh");
    }

    if (current.revoked_at !== null) {
      await revokeAllActiveForUser(client, current.user_id);
      await client.query("COMMIT");
      transactionOpen = false;
      throw AuthError("refresh_reuse");
    }

    if (current.expires_at.getTime() <= Date.now()) {
      throw AuthError("invalid_refresh");
    }

    await client.query(
      `UPDATE refresh_tokens
       SET revoked_at = now()
       WHERE id = $1`,
      [current.id]
    );

    const next = generateRefreshToken();

    await client.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        current.user_id,
        hashRefreshToken(next.raw),
        next.expiresAt,
        meta.userAgent ?? null,
        meta.ip ?? null
      ]
    );

    await client.query("COMMIT");
    transactionOpen = false;

    return {
      raw: next.raw,
      expiresAt: next.expiresAt,
      userId: current.user_id
    };
  } catch (error) {
    if (transactionOpen) {
      await client.query("ROLLBACK").catch(() => undefined);
    }

    throw error;
  } finally {
    client.release();
  }
};

export const revokeRefreshToken = async (raw: string): Promise<void> => {
  if (raw.length === 0) {
    return;
  }

  await pool.query(
    `UPDATE refresh_tokens
     SET revoked_at = now()
     WHERE token_hash = $1
       AND revoked_at IS NULL`,
    [hashRefreshToken(raw)]
  );
};

export const revokeAllForUser = async (userId: string): Promise<void> => {
  await pool.query(
    `UPDATE refresh_tokens
     SET revoked_at = now()
     WHERE user_id = $1
       AND revoked_at IS NULL`,
    [userId]
  );
};
