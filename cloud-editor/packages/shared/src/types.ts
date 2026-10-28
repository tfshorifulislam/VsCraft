export type ProjectVisibility = "private" | "public";

export type ProjectRole = "owner" | "editor" | "viewer";

export type MemberRole = ProjectRole;

export type InviteableRole = Exclude<ProjectRole, "owner">;

export type RunnerStatus = "starting" | "running" | "stopped" | "failed";

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  visibility: ProjectVisibility;
  language: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface ProjectMember {
  projectId: string;
  userId: string;
  role: ProjectRole;
  createdAt: string;
}

export interface FileNode {
  id: string;
  projectId: string;
  path: string;
  isDir: boolean;
  sizeBytes: number;
  s3Key: string | null;
  contentHash: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectSnapshot {
  id: string;
  projectId: string;
  label: string | null;
  manifestS3Key: string;
  createdBy: string | null;
  createdAt: string;
}

export interface RefreshToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  revokedAt: string | null;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
}

export interface RunnerSession {
  id: string;
  projectId: string;
  userId: string;
  containerId: string | null;
  status: RunnerStatus;
  startedAt: string;
  endedAt: string | null;
}

export interface ProjectWithRole extends Project {
  role: ProjectRole;
}

/**
 * @deprecated Use FileNode. Kept for backwards compatibility with earlier
 * foundation code that modelled files with a storage key and content type.
 */
export interface File {
  id: string;
  projectId: string;
  path: string;
  storageKey: string;
  sizeBytes: number;
  contentType: string;
  etag: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * @deprecated Use ProjectMember. Kept for backwards compatibility with earlier
 * foundation code that used a synthetic membership id.
 */
export interface Member {
  id: string;
  projectId: string;
  userId: string;
  role: MemberRole;
  invitedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}
