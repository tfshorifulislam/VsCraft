import { createHash, randomUUID } from "node:crypto";
import pLimit from "p-limit";
import type { Pool, PoolClient, QueryResultRow } from "pg";
import type { FileNode, FileTreeNode } from "@cloud-editor/shared";
import { env } from "../config/env.js";
import { pool } from "../db/pool.js";
import { fileContentKey, s3Storage } from "../storage/s3.client.js";
import { BadRequest, Conflict, NotFound } from "../utils/errors.js";
import { logReconciliationFailure } from "../utils/reconciliation.js";

const MAX_PATH_LENGTH = 1_024;
const READ_MANY_CONCURRENCY = 8;

export const MAX_FILE_SIZE_BYTES = env.MAX_FILE_SIZE_MB * 1024 * 1024;

export interface FileRow extends QueryResultRow {
  id: string;
  project_id: string;
  path: string;
  is_dir: boolean;
  size_bytes: string | number;
  s3_key: string | null;
  content_hash: string | null;
  updated_by: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

type Database = Pool | PoolClient;

const FILE_COLUMNS = `
  id,
  project_id,
  path,
  is_dir,
  size_bytes,
  s3_key,
  content_hash,
  updated_by,
  created_at,
  updated_at
`;

const toIsoString = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : value;

export const toFileNode = (row: FileRow): FileNode => ({
  id: row.id,
  projectId: row.project_id,
  path: row.path,
  isDir: row.is_dir,
  sizeBytes: Number(row.size_bytes),
  s3Key: row.s3_key,
  contentHash: row.content_hash,
  updatedBy: row.updated_by,
  createdAt: toIsoString(row.created_at),
  updatedAt: toIsoString(row.updated_at)
});

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as { code?: unknown }).code === "23505";

const isForeignKeyViolation = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as { code?: unknown }).code === "23503";

export const sha256Hex = (content: Buffer | string): string =>
  createHash("sha256").update(content).digest("hex");

/**
 * Normalizes a client-supplied path into the canonical metadata form.
 *
 * - leading and duplicate slashes are removed
 * - a single trailing slash is accepted for directories only
 * - traversal, backslashes, control characters, and empty paths are rejected
 */
export const normalizePath = (input: string, isDir = false): string => {
  if (typeof input !== "string") {
    throw BadRequest("invalid_path");
  }

  let value = input.trim();

  if (
    value.length === 0 ||
    value.length > MAX_PATH_LENGTH ||
    value.includes("\\") ||
    value.includes("..") ||
    /[\u0000-\u001f]/.test(value)
  ) {
    throw BadRequest("invalid_path");
  }

  value = value.replace(/\/+/g, "/");

  while (value.startsWith("/")) {
    value = value.slice(1);
  }

  if (value.endsWith("/")) {
    if (!isDir) {
      throw BadRequest("invalid_path");
    }

    value = value.replace(/\/+$/g, "");
  }

  if (value.length === 0) {
    throw BadRequest("invalid_path");
  }

  const segments = value.split("/");

  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    throw BadRequest("invalid_path");
  }

  return value;
};

export const pathParent = (path: string): string => {
  const lastSlash = path.lastIndexOf("/");
  return lastSlash <= 0 ? "" : path.slice(0, lastSlash);
};

const assertFileSize = (sizeBytes: number): void => {
  if (sizeBytes > MAX_FILE_SIZE_BYTES) {
    throw BadRequest("file_too_large", { maxBytes: MAX_FILE_SIZE_BYTES });
  }
};

/**
 * Ensures that a path does not collide with:
 * - another row at the same path
 * - an existing file that would become its ancestor
 * - an existing descendant, when the new row is a file
 */
export const assertNoConflict = async (
  db: Database,
  projectId: string,
  path: string,
  isDir = false,
  excludeFileId?: string
): Promise<void> => {
  const result = await db.query<{ path: string; is_dir: boolean }>(
    `SELECT path, is_dir
     FROM files
     WHERE project_id = $1
       AND ($4::uuid IS NULL OR id <> $4)
       AND (
         path = $2
         OR (is_dir = false AND left($2, char_length(path) + 1) = path || '/')
         OR ($3 = false AND left(path, char_length($2) + 1) = $2 || '/')
       )
     LIMIT 1`,
    [projectId, path, isDir, excludeFileId ?? null]
  );

  if (result.rows.length > 0) {
    throw Conflict("path_conflict");
  }
};

const loadFileRow = async (
  db: Database,
  fileId: string,
  projectId?: string,
  forUpdate = false
): Promise<FileRow> => {
  let sql = `SELECT ${FILE_COLUMNS} FROM files WHERE id = $1`;
  const params: unknown[] = [fileId];

  if (projectId !== undefined) {
    sql += " AND project_id = $2";
    params.push(projectId);
  }

  if (forUpdate) {
    sql += " FOR UPDATE";
  }

  const result = await db.query<FileRow>(sql, params);
  const row = result.rows[0];

  if (row === undefined) {
    throw NotFound("file_not_found");
  }

  return row;
};

interface InsertFileRowInput {
  id: string;
  projectId: string;
  userId: string;
  path: string;
  isDir: boolean;
  s3Key: string | null;
  contentHash: string | null;
  sizeBytes: number;
}

const insertFileRow = async (
  input: InsertFileRowInput
): Promise<FileNode> => {
  const result = await pool.query<FileRow>(
    `INSERT INTO files (
       id, project_id, path, is_dir, size_bytes, s3_key, content_hash, updated_by
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING ${FILE_COLUMNS}`,
    [
      input.id,
      input.projectId,
      input.path,
      input.isDir,
      input.sizeBytes,
      input.s3Key,
      input.contentHash,
      input.userId
    ]
  );
  const row = result.rows[0];

  if (row === undefined) {
    throw new Error("File insert did not return a row");
  }

  return toFileNode(row);
};

const mapWriteError = (error: unknown): never => {
  if (isUniqueViolation(error)) {
    throw Conflict("path_conflict");
  }

  if (isForeignKeyViolation(error)) {
    throw NotFound("project_not_found");
  }

  throw error;
};

export interface CreateFileParams {
  projectId: string;
  userId: string;
  path: string;
  isDir: boolean;
}

export const createFile = async (params: CreateFileParams): Promise<FileNode> => {
  const normalizedPath = normalizePath(params.path, params.isDir);
  await assertNoConflict(pool, params.projectId, normalizedPath, params.isDir);

  const fileId = randomUUID();
  const s3Key = params.isDir ? null : fileContentKey(params.projectId, fileId);
  const contentHash = params.isDir ? null : sha256Hex(Buffer.alloc(0));

  if (s3Key !== null) {
    await s3Storage.putObject(s3Key, Buffer.alloc(0));
  }

  try {
    return await insertFileRow({
      id: fileId,
      projectId: params.projectId,
      userId: params.userId,
      path: normalizedPath,
      isDir: params.isDir,
      s3Key,
      contentHash,
      sizeBytes: 0
    });
  } catch (error) {
    if (s3Key !== null) {
      try {
        await s3Storage.deleteObject(s3Key);
      } catch (cleanupError) {
        logReconciliationFailure(
          "createFile.cleanup",
          { projectId: params.projectId, fileId },
          cleanupError
        );
      }
    }

    return mapWriteError(error);
  }
};

export interface WriteFileParams {
  fileId: string;
  userId: string;
  content: Buffer;
  projectId?: string;
}

export const writeFile = async (params: WriteFileParams): Promise<FileNode> => {
  assertFileSize(params.content.length);

  const current = await loadFileRow(pool, params.fileId, params.projectId);

  if (current.is_dir) {
    throw BadRequest("not_a_file");
  }

  const contentHash = sha256Hex(params.content);
  const sizeBytes = params.content.length;

  if (current.content_hash === contentHash) {
    const result = await pool.query<FileRow>(
      `UPDATE files
       SET updated_by = $2, updated_at = now()
       WHERE id = $1
       RETURNING ${FILE_COLUMNS}`,
      [params.fileId, params.userId]
    );
    const row = result.rows[0];

    if (row === undefined) {
      throw NotFound("file_not_found");
    }

    return toFileNode(row);
  }

  if (current.s3_key === null) {
    throw Conflict("file_storage_missing");
  }

  await s3Storage.putObject(current.s3_key, params.content);

  try {
    const result = await pool.query<FileRow>(
      `UPDATE files
       SET size_bytes = $3,
           content_hash = $4,
           updated_by = $2,
           updated_at = now()
       WHERE id = $1
       RETURNING ${FILE_COLUMNS}`,
      [params.fileId, params.userId, sizeBytes, contentHash]
    );
    const row = result.rows[0];

    if (row === undefined) {
      throw NotFound("file_not_found");
    }

    return toFileNode(row);
  } catch (error) {
    logReconciliationFailure(
      "writeFile.metadata",
      { projectId: current.project_id, fileId: params.fileId, key: current.s3_key },
      error
    );
    throw error;
  }
};

export interface ReadFileResult {
  file: FileNode;
  content: Buffer;
}

export const readFile = async (
  fileId: string,
  projectId?: string
): Promise<ReadFileResult> => {
  const row = await loadFileRow(pool, fileId, projectId);

  if (row.is_dir) {
    throw BadRequest("not_a_file");
  }

  if (row.s3_key === null) {
    throw Conflict("file_storage_missing");
  }

  const content = await s3Storage.getObjectBuffer(row.s3_key);

  return {
    file: toFileNode(row),
    content
  };
};

export interface RenameFileParams {
  fileId: string;
  newPath: string;
  userId?: string;
  projectId?: string;
}

export const renameFile = async (params: RenameFileParams): Promise<FileNode> => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const current = await loadFileRow(client, params.fileId, params.projectId, true);
    const normalizedPath = normalizePath(params.newPath, current.is_dir);

    if (current.is_dir && normalizedPath.startsWith(`${current.path}/`)) {
      throw BadRequest("invalid_path");
    }

    if (normalizedPath === current.path) {
      await client.query("COMMIT");
      return toFileNode(current);
    }

    await assertNoConflict(
      client,
      current.project_id,
      normalizedPath,
      current.is_dir,
      current.id
    );

    let result;

    if (current.is_dir) {
      result = await client.query<FileRow>(
        `UPDATE files
         SET path = $3 || substr(path, char_length($2) + 1),
             updated_by = COALESCE($4, updated_by),
             updated_at = now()
         WHERE project_id = $1
           AND (path = $2 OR left(path, char_length($2) + 1) = $2 || '/')
         RETURNING ${FILE_COLUMNS}`,
        [current.project_id, current.path, normalizedPath, params.userId ?? null]
      );
    } else {
      result = await client.query<FileRow>(
        `UPDATE files
         SET path = $2,
             updated_by = COALESCE($3, updated_by),
             updated_at = now()
         WHERE id = $1
         RETURNING ${FILE_COLUMNS}`,
        [current.id, normalizedPath, params.userId ?? null]
      );
    }

    const updatedRow = result.rows.find((row) => row.path === normalizedPath);

    if (updatedRow === undefined) {
      throw new Error("Renamed file was not returned");
    }

    await client.query("COMMIT");
    return toFileNode(updatedRow);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);

    if (isUniqueViolation(error)) {
      throw Conflict("path_conflict");
    }

    throw error;
  } finally {
    client.release();
  }
};

export interface DeleteFileParams {
  fileId: string;
  projectId?: string;
}

export const deleteFile = async (params: DeleteFileParams): Promise<void> => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const current = await loadFileRow(client, params.fileId, params.projectId, true);
    let deletedRows: Array<{ s3_key: string | null }>;

    if (current.is_dir) {
      const result = await client.query<{ s3_key: string | null }>(
        `DELETE FROM files
         WHERE project_id = $1
           AND (path = $2 OR left(path, char_length($2) + 1) = $2 || '/')
         RETURNING s3_key`,
        [current.project_id, current.path]
      );
      deletedRows = result.rows;
    } else {
      const result = await client.query<{ s3_key: string | null }>(
        `DELETE FROM files
         WHERE id = $1
         RETURNING s3_key`,
        [current.id]
      );
      deletedRows = result.rows;
    }

    await client.query("COMMIT");

    const keys = deletedRows
      .map((row) => row.s3_key)
      .filter((key): key is string => key !== null);

    if (keys.length > 0) {
      try {
        await s3Storage.deleteObjects(keys);
      } catch (error) {
        logReconciliationFailure(
          "deleteFile.s3",
          {
            projectId: current.project_id,
            fileId: current.id,
            keyCount: keys.length
          },
          error
        );
      }
    }
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
};

export const listTree = async (projectId: string): Promise<FileTreeNode[]> => {
  const result = await pool.query<FileRow>(
    `SELECT ${FILE_COLUMNS}
     FROM files
     WHERE project_id = $1
     ORDER BY path ASC`,
    [projectId]
  );

  const nodes = new Map<string, FileTreeNode>();

  for (const row of result.rows) {
    const node: FileTreeNode = toFileNode(row);

    if (row.is_dir) {
      node.children = [];
    }

    nodes.set(row.path, node);
  }

  const roots: FileTreeNode[] = [];

  for (const row of result.rows) {
    const node = nodes.get(row.path);

    if (node === undefined) {
      continue;
    }

    const parent = pathParent(row.path);
    const parentNode = parent.length > 0 ? nodes.get(parent) : undefined;

    if (parentNode !== undefined && parentNode.isDir) {
      parentNode.children ??= [];
      parentNode.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
};

export const readMany = async (
  projectId: string,
  fileIds: string[]
): Promise<Record<string, Buffer>> => {
  const uniqueIds = [...new Set(fileIds)];

  if (uniqueIds.length === 0) {
    return {};
  }

  const result = await pool.query<FileRow>(
    `SELECT ${FILE_COLUMNS}
     FROM files
     WHERE project_id = $1
       AND is_dir = false
       AND id = ANY($2::uuid[])`,
    [projectId, uniqueIds]
  );

  const limit = pLimit(READ_MANY_CONCURRENCY);
  const contents: Record<string, Buffer> = {};

  await Promise.all(
    result.rows.map((row) =>
      limit(async () => {
        if (row.s3_key === null) {
          return;
        }

        contents[row.path] = await s3Storage.getObjectBuffer(row.s3_key);
      })
    )
  );

  return contents;
};
