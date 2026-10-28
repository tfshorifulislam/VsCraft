import type { Request, Response } from "express";
import type {
  AddMemberInput,
  CreateProjectInput,
  UpdateMemberRoleInput,
  UpdateProjectInput
} from "@cloud-editor/shared";
import { assertAuthenticated } from "../middlewares/auth.middleware.js";
import * as projectService from "../services/project.service.js";
import { BadRequest } from "../utils/errors.js";

const readProjectId = (req: Request): string => {
  const projectId = req.params.projectId;

  if (typeof projectId !== "string" || projectId.length === 0) {
    throw BadRequest("invalid_project_id");
  }

  return projectId;
};

const readUserId = (req: Request): string => {
  const userId = req.params.userId;

  if (typeof userId !== "string" || userId.length === 0) {
    throw BadRequest("invalid_user_id");
  }

  return userId;
};

export const listProjects = async (req: Request, res: Response): Promise<void> => {
  const user = assertAuthenticated(req);
  const projects = await projectService.listMyProjects(user.id);

  res.status(200).json({ projects });
};

export const createProject = async (req: Request, res: Response): Promise<void> => {
  const user = assertAuthenticated(req);
  const input = req.body as CreateProjectInput;
  const project = await projectService.createProject(user.id, input);

  res.status(201).json({ project });
};

export const getProject = async (req: Request, res: Response): Promise<void> => {
  const user = assertAuthenticated(req);
  const project = await projectService.getProjectWithRole(readProjectId(req), user.id);

  res.status(200).json({ project });
};

export const updateProject = async (req: Request, res: Response): Promise<void> => {
  const input = req.body as UpdateProjectInput;
  const project = await projectService.updateProject(readProjectId(req), input);

  res.status(200).json({ project });
};

export const deleteProject = async (req: Request, res: Response): Promise<void> => {
  await projectService.deleteProject(readProjectId(req));
  res.status(204).send();
};

export const listMembers = async (req: Request, res: Response): Promise<void> => {
  const members = await projectService.listMembers(readProjectId(req));

  res.status(200).json({ members });
};

export const addMember = async (req: Request, res: Response): Promise<void> => {
  const input = req.body as AddMemberInput;
  const member = await projectService.addMember(readProjectId(req), input);

  res.status(201).json({ member });
};

export const updateMemberRole = async (req: Request, res: Response): Promise<void> => {
  const input = req.body as UpdateMemberRoleInput;
  const member = await projectService.updateMemberRole(
    readProjectId(req),
    readUserId(req),
    input.role
  );

  res.status(200).json({ member });
};

export const removeMember = async (req: Request, res: Response): Promise<void> => {
  await projectService.removeMember(readProjectId(req), readUserId(req));
  res.status(204).send();
};
