import type { RequestHandler } from "express";
import { uuidSchema, type ProjectRole } from "@cloud-editor/shared";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { Forbidden } from "../utils/errors.js";
import { assertAuthenticated } from "./auth.middleware.js";

const PROJECT_ROLES = new Set<ProjectRole>(["owner", "editor", "viewer"]);

const isProjectRole = (value: string): value is ProjectRole =>
  PROJECT_ROLES.has(value as ProjectRole);

export const requireProjectRole = (...allowed: ProjectRole[]): RequestHandler => {
  const allowedRoles = new Set<ProjectRole>(allowed);

  return asyncHandler(async (req, _res, next) => {
    const user = assertAuthenticated(req);
    const projectId = req.params.projectId;

    if (typeof projectId !== "string" || !uuidSchema.safeParse(projectId).success) {
      throw Forbidden("You do not have access to this project");
    }

    const result = await pool.query<{ role: string }>(
      `SELECT role
       FROM project_members
       WHERE project_id = $1
         AND user_id = $2`,
      [projectId, user.id]
    );
    const row = result.rows[0];

    if (row === undefined || !isProjectRole(row.role) || !allowedRoles.has(row.role)) {
      throw Forbidden("You do not have access to this project");
    }

    req.projectRole = row.role;
    next();
  });
};

export const requireOwner = requireProjectRole("owner");

export const requireEditor = requireProjectRole("owner", "editor");

export const requireViewer = requireProjectRole("owner", "editor", "viewer");
