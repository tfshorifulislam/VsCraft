export * from "./types.js";
export * from "./schemas.js";

export const API_PREFIX = "/api/v1";
export const HEALTH_PATH = "/health";
export const SOCKET_IO_PATH = "/socket.io";
export const TERMINAL_WS_PATH = "/pty";

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
export const MAX_PROJECT_NAME_LENGTH = 120;
export const MAX_FILE_PATH_LENGTH = 1024;

export const SOCKET_EVENTS = {
  PROJECT_JOIN: "project:join",
  PROJECT_LEAVE: "project:leave",
  FILE_OPEN: "file:open",
  FILE_CHANGE: "file:change",
  CURSOR_UPDATE: "cursor:update",
  PRESENCE_UPDATE: "presence:update"
} as const;

export type SocketEvent = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];
