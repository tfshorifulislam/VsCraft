import express, { Router } from "express";
import { createFileSchema, fileIdParamsSchema, renameFileSchema } from "@cloud-editor/shared";
import * as fileController from "../controllers/file.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireEditor, requireViewer } from "../middlewares/rbac.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { env } from "../config/env.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const fileRouter = Router({ mergeParams: true });

fileRouter.use(requireAuth);

fileRouter.get("/", requireViewer, asyncHandler(fileController.listTree));

fileRouter.post(
  "/",
  requireEditor,
  validate(createFileSchema),
  asyncHandler(fileController.createFile)
);

fileRouter.post("/hydrate", requireViewer, asyncHandler(fileController.hydrateFiles));

fileRouter.get(
  "/:fileId",
  requireViewer,
  validate(fileIdParamsSchema, "params"),
  asyncHandler(fileController.readFile)
);

fileRouter.put(
  "/:fileId",
  requireEditor,
  validate(fileIdParamsSchema, "params"),
  express.raw({
    type: "application/octet-stream",
    limit: env.MAX_FILE_SIZE_MB * 1024 * 1024 + 1024 * 1024
  }),
  asyncHandler(fileController.writeFile)
);

fileRouter.patch(
  "/:fileId",
  requireEditor,
  validate(fileIdParamsSchema, "params"),
  validate(renameFileSchema),
  asyncHandler(fileController.renameFile)
);

fileRouter.delete(
  "/:fileId",
  requireEditor,
  validate(fileIdParamsSchema, "params"),
  asyncHandler(fileController.deleteFile)
);
