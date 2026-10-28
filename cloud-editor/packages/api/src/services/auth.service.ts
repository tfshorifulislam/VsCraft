import type { AuthUser } from "@cloud-editor/shared";
import { pool } from "../db/pool.js";
import { AuthError } from "../utils/errors.js";
import { hashPassword, verifyPassword } from "./password.service.js";
import {
  createRefreshToken,
  revokeRefreshToken,
  rotateRefreshToken,
  signAccessToken,
  type RefreshTokenMeta
} from "./token.service.js";

const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=19456,p=1,t=2$sZlDCnJza0D1d73wGTstmw$U4KAC0JDwPEDlfCIZa48sOvAlfRprDPNr1IW86A1Nfc";

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  display_name: string;
  avatar_url: string | null;
}

interface PublicUserRow {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
}

interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
}

interface LoginInput {
  email: string;
  password: string;
  meta: RefreshTokenMeta;
}

interface RefreshInput {
  rawRefresh: string;
  meta: RefreshTokenMeta;
}

interface AuthSession {
  user: AuthUser;
  accessToken: string;
  refreshRaw: string;
  refreshExpiresAt: Date;
}

const toAuthUser = (row: PublicUserRow): AuthUser => ({
  id: row.id,
  email: row.email,
  displayName: row.display_name,
  avatarUrl: row.avatar_url
});

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as { code?: unknown }).code === "23505";

export const register = async (input: RegisterInput): Promise<AuthUser> => {
  const passwordHash = await hashPassword(input.password);

  try {
    const result = await pool.query<PublicUserRow>(
      `INSERT INTO users (email, password_hash, display_name)
       VALUES ($1, $2, $3)
       RETURNING id, email, display_name, avatar_url`,
      [input.email.trim(), passwordHash, input.displayName.trim()]
    );
    const row = result.rows[0];

    if (row === undefined) {
      throw new Error("User insert did not return a row");
    }

    return toAuthUser(row);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw AuthError("email_taken");
    }

    throw error;
  }
};

export const login = async (input: LoginInput): Promise<AuthSession> => {
  const result = await pool.query<UserRow>(
    `SELECT id, email, password_hash, display_name, avatar_url
     FROM users
     WHERE email = $1`,
    [input.email.trim()]
  );
  const row = result.rows[0];

  if (row === undefined) {
    await verifyPassword(DUMMY_PASSWORD_HASH, input.password);
    throw AuthError("invalid_credentials");
  }

  const passwordMatches = await verifyPassword(row.password_hash, input.password);

  if (!passwordMatches) {
    throw AuthError("invalid_credentials");
  }

  const user = toAuthUser(row);
  const accessToken = await signAccessToken({ sub: user.id, email: user.email });
  const refreshToken = await createRefreshToken(user.id, input.meta);

  return {
    user,
    accessToken,
    refreshRaw: refreshToken.raw,
    refreshExpiresAt: refreshToken.expiresAt
  };
};

export const refresh = async (input: RefreshInput): Promise<AuthSession> => {
  const rotated = await rotateRefreshToken(input.rawRefresh, input.meta);
  const user = await getMe(rotated.userId);
  const accessToken = await signAccessToken({ sub: user.id, email: user.email });

  return {
    user,
    accessToken,
    refreshRaw: rotated.raw,
    refreshExpiresAt: rotated.expiresAt
  };
};

export const logout = async (input: { rawRefresh: string }): Promise<void> => {
  await revokeRefreshToken(input.rawRefresh);
};

export const getMe = async (userId: string): Promise<AuthUser> => {
  const result = await pool.query<PublicUserRow>(
    `SELECT id, email, display_name, avatar_url
     FROM users
     WHERE id = $1`,
    [userId]
  );
  const row = result.rows[0];

  if (row === undefined) {
    throw AuthError("user_not_found");
  }

  return toAuthUser(row);
};
