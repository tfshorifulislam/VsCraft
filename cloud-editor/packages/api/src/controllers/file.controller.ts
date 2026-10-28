import type { Request, Response } from "express";
import {
  hydrateSchema,
  writeFileSchema,
  type CreateFileInput,
  type HydrateInput,
  type RenameFileInput
} from "@cloud-editor/shared";
import { assertAuthenticated } from "../middlewares/auth.middleware.js";
import * as fileService from "../services/file.service.js";
import { BadRequest } from "../utils/errors.js";

const readProjectId = (req: Request): string => {
  const projectId = req.params.projectId;

  if (typeof projectId !== "string" || projectId.length === 0) {
    throw BadRequest("invalid_project_id");
  }

  return projectId;
};

const readFileId = (req: Request): string => {
  const fileId = req.params.fileId;

  if (typeof fileId !== "string" || fileId.length === 0) {
    throw BadRequest("invalid_file_id");
  }

  return fileId;
};

const decodeBase64 = (value: string): Buffer => {
  const normalized = value.replace(/\s+/g, "");

  if (
    normalized.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)
  ) {
    throw BadRequest("invalid_base64");
  }

  return Buffer.from(normalized, "base64");
};

const readContent = (req: Request): Buffer => {
  if (Buffer.isBuffer(req.body)) {
    return req.body;
  }

  const parsed = writeFileSchema.safeParse(req.body);

  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => ({
      field: issue.path.join(".") || "(root)",
      message: issue.message
    }));

    throw BadRequest("Validation failed", details);
  }

  return decodeBase64(parsed.data.contentBase64);
};

export const listTree = async (req: Request, res: Response): Promise<void> => {
  const files = await fileService.listTree(readProjectId(req));

  res.status(200).json({ files });
};

export const createFile = async (req: Request, res: Response): Promise<void> => {
  const user = assertAuthenticated(req);
  const input = req.body as CreateFileInput;
  const file = await fileService.createFile({
    projectId: readProjectId(req),
    userId: user.id,
    path: input.path,
    isDir: input.is_dir
  });

  res.status(201).json({ file });
};

export const readFile = async (req: Request, res: Response): Promise<void> => {
  const result = await fileService.readFile(readFileId(req), readProjectId(req));
  const filename = result.file.path.split("/").pop() ?? "file";

  res.status(200);
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Length", String(result.content.length));
  res.setHeader(
    "Content-Disposition",
    `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`
  );
  res.send(result.content);
};

export const writeFile = async (req: Request, res: Response): Promise<void> => {
  const user = assertAuthenticated(req);
  const file = await fileService.writeFile({
    fileId: readFileId(req),
    projectId: readProjectId(req),
    userId: user.id,
    content: readContent(req)
  });

  res.status(200).json({ file });
};

export const renameFile = async (req: Request, res: Response): Promise<void> => {
  const user = assertAuthenticated(req);
  const input = req.body as RenameFileInput;
  const file = await fileService.renameFile({
    fileId: readFileId(req),
    projectId: readProjectId(req),
    userId: user.id,
    newPath: input.newPath
  });

  res.status(200).json({ file });
};

export const deleteFile = async (req: Request, res: Response): Promise<void> => {
  await fileService.deleteFile({
    fileId: readFileId(req),
    projectId: readProjectId(req)
  });

  res.status(204).send();
};

export const hydrateFiles = async (req: Request, res: Response): Promise<void> => {
  const parsed = hydrateSchema.safeParse(req.body);

  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => ({
      field: issue.path.join(".") || "(root)",
      message: issue.message
    }));

    throw BadRequest("Validation failed", details);
  }

  const input = parsed.data as HydrateInput;
  const contents = await fileService.readMany(readProjectId(req), input.fileIds);

  res.status(200).json({
    files: Object.entries(contents).map(([path, content]) => ({
      path,
      contentBase64: content.toString("base64")
    }))
  });
};
