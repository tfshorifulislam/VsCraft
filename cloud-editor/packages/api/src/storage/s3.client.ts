import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../config/env.js";

/**
 * S3 key layout (all keys are relative to S3_BUCKET):
 *
 *   File content:        projects/{projectId}/files/{fileId}
 *   Snapshot manifest:   projects/{projectId}/snapshots/{snapshotId}.json
 *
 * Keys are derived exclusively from server-generated IDs. User-supplied paths
 * are metadata only and must never be interpolated into an object key.
 */

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 100;
const RETRY_MAX_DELAY_MS = 2_000;

const RETRYABLE_ERROR_NAMES = new Set([
  "SlowDown",
  "Throttling",
  "ThrottlingException",
  "RequestTimeout",
  "RequestTimeoutException",
  "InternalError",
  "ServiceUnavailable",
  "TimeoutError"
]);

const RETRYABLE_ERROR_CODES = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "EPIPE",
  "ECONNREFUSED",
  "EAI_AGAIN",
  "ENOTFOUND"
]);

const s3Client = new S3Client({
  region: env.S3_REGION,
  endpoint: env.S3_ENDPOINT,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  maxAttempts: 1,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY
  }
});

const sleep = (durationMs: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, durationMs));

const isTransientError = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const metadata = (error as { $metadata?: { httpStatusCode?: number } }).$metadata;

  if (metadata?.httpStatusCode !== undefined) {
    return (
      metadata.httpStatusCode >= 500 ||
      metadata.httpStatusCode === 408 ||
      metadata.httpStatusCode === 429
    );
  }

  const name = (error as { name?: unknown }).name;

  if (typeof name === "string" && RETRYABLE_ERROR_NAMES.has(name)) {
    return true;
  }

  const code = (error as { code?: unknown }).code;

  return typeof code === "string" && RETRYABLE_ERROR_CODES.has(code);
};

const withRetry = async <T>(operation: () => Promise<T>): Promise<T> => {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt >= MAX_RETRIES || !isTransientError(error)) {
        throw error;
      }

      const delayMs =
        Math.min(RETRY_MAX_DELAY_MS, RETRY_BASE_DELAY_MS * 2 ** attempt) +
        Math.floor(Math.random() * 50);
      await sleep(delayMs);
    }
  }

  throw lastError;
};

const isNotFoundError = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const name = (error as { name?: unknown }).name;

  if (name === "NotFound" || name === "NoSuchKey") {
    return true;
  }

  return (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404;
};

export const fileContentKey = (projectId: string, fileId: string): string =>
  `projects/${projectId}/files/${fileId}`;

export const snapshotManifestKey = (projectId: string, snapshotId: string): string =>
  `projects/${projectId}/snapshots/${snapshotId}.json`;

export const putObject = async (
  key: string,
  body: Buffer | string,
  contentType = "application/octet-stream"
): Promise<void> => {
  await withRetry(() =>
    s3Client.send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType
      })
    )
  );
};

export const getObjectBuffer = async (key: string): Promise<Buffer> => {
  const response = await withRetry(() =>
    s3Client.send(
      new GetObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: key
      })
    )
  );

  if (response.Body === undefined) {
    throw new Error(`S3 object ${key} returned an empty body`);
  }

  const bytes = await response.Body.transformToByteArray();
  return Buffer.from(bytes);
};

export const deleteObject = async (key: string): Promise<void> => {
  await withRetry(() =>
    s3Client.send(
      new DeleteObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: key
      })
    )
  );
};

export const deleteObjects = async (keys: string[]): Promise<void> => {
  const uniqueKeys = [...new Set(keys.filter((key) => key.length > 0))];

  for (let offset = 0; offset < uniqueKeys.length; offset += 1_000) {
    const chunk = uniqueKeys.slice(offset, offset + 1_000);

    const response = await withRetry(() =>
      s3Client.send(
        new DeleteObjectsCommand({
          Bucket: env.S3_BUCKET,
          Delete: {
            Objects: chunk.map((key) => ({ Key: key })),
            Quiet: true
          }
        })
      )
    );

    if (response.Errors !== undefined && response.Errors.length > 0) {
      const summary = response.Errors.map(
        (error) => `${error.Key ?? "unknown"}:${error.Code ?? "unknown"}`
      ).join(", ");

      throw new Error(`S3 batch delete reported errors: ${summary}`);
    }
  }
};

export const headObject = async (
  key: string
): Promise<{ size: number; etag: string; contentType: string } | null> => {
  try {
    const response = await withRetry(() =>
      s3Client.send(
        new HeadObjectCommand({
          Bucket: env.S3_BUCKET,
          Key: key
        })
      )
    );

    return {
      size: response.ContentLength ?? 0,
      etag: (response.ETag ?? "").replace(/^"|"$/g, ""),
      contentType: response.ContentType ?? "application/octet-stream"
    };
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }

    throw error;
  }
};

export const createPresignedUpload = async (
  key: string,
  contentType: string,
  expiresInSec = 300
): Promise<string> => {
  return getSignedUrl(
    s3Client,
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      ContentType: contentType
    }),
    { expiresIn: expiresInSec }
  );
};

export const createPresignedDownload = async (
  key: string,
  expiresInSec = 300
): Promise<string> => {
  return getSignedUrl(
    s3Client,
    new GetObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key
    }),
    { expiresIn: expiresInSec }
  );
};

export const s3Storage = {
  putObject,
  getObjectBuffer,
  deleteObject,
  deleteObjects,
  headObject,
  createPresignedUpload,
  createPresignedDownload
};

export type ObjectStorage = typeof s3Storage;
