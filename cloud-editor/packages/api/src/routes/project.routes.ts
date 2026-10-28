import { Router } from "express";
import {
  addMemberSchema,
  createProjectSchema,
  projectIdParamsSchema,
  projectMemberParamsSchema,
  updateMemberRoleSchema,
  updateProjectSchema
} from "@cloud-editor/shared";
import * as projectController from "../controllers/project.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireEditor, requireOwner, requireViewer } from "../middlewares/rbac.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { fileRouter } from "./file.routes.js";

export const projectRouter = Router();

projectRouter.use(requireAuth);

projectRouter.get("/", asyncHandler(projectController.listProjects));

projectRouter.post(
  "/",
  validate(createProjectSchema),
  asyncHandler(projectController.createProject)
);

projectRouter.use("/:projectId/files", fileRouter);

projectRouter.get(
  "/:projectId/members",
  validate(projectIdParamsSchema, "params"),
  requireViewer,
  asyncHandler(projectController.listMembers)
);

projectRouter.post(
  "/:projectId/members",
  validate(projectIdParamsSchema, "params"),
  requireOwner,
  validate(addMemberSchema),
  asyncHandler(projectController.addMember)
);

projectRouter.patch(
  "/:projectId/members/:userId",
  validate(projectMemberParamsSchema, "params"),
  requireOwner,
  validate(updateMemberRoleSchema),
  asyncHandler(projectController.updateMemberRole)
);

projectRouter.delete(
  "/:projectId/members/:userId",
  validate(projectMemberParamsSchema, "params"),
  requireOwner,
  asyncHandler(projectController.removeMember)
);

projectRouter.get(
  "/:projectId",
  validate(projectIdParamsSchema, "params"),
  requireViewer,
  asyncHandler(projectController.getProject)
);

projectRouter.patch(
  "/:projectId",
  validate(projectIdParamsSchema, "params"),
  requireEditor,
  validate(updateProjectSchema),
  asyncHandler(projectController.updateProject)
);

projectRouter.delete(
  "/:projectId",
  validate(projectIdParamsSchema, "params"),
  requireOwner,
  asyncHandler(projectController.deleteProject)
);
