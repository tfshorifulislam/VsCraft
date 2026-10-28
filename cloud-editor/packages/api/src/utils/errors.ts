export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const BadRequest = (
  message = "Bad request",
  details?: unknown
): AppError => new AppError(400, "BAD_REQUEST", message, details);

export const Unauthorized = (
  message = "Unauthorized",
  code = "UNAUTHORIZED"
): AppError => new AppError(401, code, message);

export const Forbidden = (
  message = "Forbidden",
  code = "FORBIDDEN"
): AppError => new AppError(403, code, message);

export const NotFound = (
  message = "Not found",
  code = "NOT_FOUND"
): AppError => new AppError(404, code, message);

export const Conflict = (
  message = "Conflict",
  code = "CONFLICT"
): AppError => new AppError(409, code, message);

const AUTH_ERROR_DEFAULTS: Record<string, { status: number; message: string }> = {
  email_taken: {
    status: 409,
    message: "An account with this email already exists"
  },
  invalid_credentials: {
    status: 401,
    message: "Invalid email or password"
  },
  invalid_access_token: {
    status: 401,
    message: "Invalid or expired access token"
  },
  invalid_refresh: {
    status: 401,
    message: "Invalid or expired refresh token"
  },
  missing_refresh_token: {
    status: 401,
    message: "Refresh token is missing"
  },
  refresh_reuse: {
    status: 401,
    message: "Refresh token reuse detected; all sessions have been revoked"
  },
  user_not_found: {
    status: 401,
    message: "User account was not found"
  }
};

export const AuthError = (code: string): AppError => {
  const defaults = AUTH_ERROR_DEFAULTS[code] ?? {
    status: 401,
    message: "Authentication failed"
  };

  return new AppError(defaults.status, code, defaults.message);
};
