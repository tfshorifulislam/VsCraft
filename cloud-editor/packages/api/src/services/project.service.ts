import type { QueryResultRow } from "pg";
import type {
  AddMemberInput,
  CreateProjectInput,
  Project,
  ProjectListItem,
  ProjectMember,
  ProjectRole,
  ProjectVisibility,
  ProjectWithRole,
  UpdateProjectInput
} from "@cloud-editor/shared";
import { pool } from "../db/pool.js";
import { s3Storage } from "../storage/s3.client.js";
import { BadRequest, Conflict, NotFound } from "../utils/errors.js";
import { logReconciliationFailure } from "../utils/reconciliation.js";

interface ProjectRow extends QueryResultRow {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  visibility: ProjectVisibility;
  language: string;
  created_at: Date | string;
  updated_at: Date | string;
  archived_at: Date | string | null;
}

interface ProjectListRow extends ProjectRow {
  role: ProjectRole;
  member_count: string | number;
}

interface MemberRow extends QueryResultRow {
  project_id: string;
  user_id: string;
  role: ProjectRole;
  created_at: Date | string;
  email: string;
  display_name: string;
  avatar_url: string | null;
}

interface UserLookupRow extends QueryResultRow {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
}

export interface ProjectMemberWithUser extends ProjectMember {
  user: {
    id: string;
    email: string;
    displayName: string;
    avatarUrl: string | null;
  };
}

const PROJECT_COLUMNS = `
  id,
  owner_id,
  name,
  description,
  visibility,
  language,
  created_at,
  updated_at,
  archived_at
`;

const toIsoString = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : value;

const toProject = (row: ProjectRow): Project => ({
  id: row.id,
  ownerId: row.owner_id,
  name: row.name,
  description: row.description,
  visibility: row.visibility,
  language: row.language,
  createdAt: toIsoString(row.created_at),
  updatedAt: toIsoString(row.updated_at),
  archivedAt: row.archived_at === null ? null : toIsoString(row.archived_at)
});

const toMember = (row: MemberRow): ProjectMemberWithUser => ({
  projectId: row.project_id,
  userId: row.user_id,
  role: row.role,
  createdAt: toIsoString(row.created_at),
  user: {
    id: row.user_id,
    email: row.email,
    displayName: row.display_name,
    avatarUrl: row.avatar_url
  }
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

const getMemberRow = async (
  db: Pick<typeof pool, "query">,
  projectId: string,
  userId: string
): Promise<MemberRow> => {
  const result = await db.query<MemberRow>(
    `SELECT pm.project_id,
            pm.user_id,
            pm.role,
            pm.created_at,
            u.email,
            u.display_name,
            u.avatar_url
     FROM project_members pm
     JOIN users u ON u.id = pm.user_id
     WHERE pm.project_id = $1
       AND pm.user_id = $2`,
    [projectId, userId]
  );
  const row = result.rows[0];

  if (row === undefined) {
    throw NotFound("member_not_found");
  }

  return row;
};

export const listMyProjects = async (userId: string): Promise<ProjectListItem[]> => {
  const result = await pool.query<ProjectListRow>(
    `SELECT p.id,
            p.owner_id,
            p.name,
            p.description,
            p.visibility,
            p.language,
            p.created_at,
            p.updated_at,
            p.archived_at,
            pm.role,
            (
              SELECT COUNT(*)::int
              FROM project_members member
              WHERE member.project_id = p.id
            ) AS member_count
     FROM project_members pm
     JOIN projects p ON p.id = pm.project_id
     WHERE pm.user_id = $1
     ORDER BY p.updated_at DESC, p.id ASC`,
    [userId]
  );

  return result.rows.map((row) => ({
    ...toProject(row),
    role: row.role,
    memberCount: Number(row.member_count)
  }));
};

export const createProject = async (
  ownerId: string,
  input: CreateProjectInput
): Promise<ProjectWithRole> => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query<ProjectRow>(
      `INSERT INTO projects (owner_id, name, description, language)
       VALUES ($1, $2, $3, $4)
       RETURNING ${PROJECT_COLUMNS}`,
      [ownerId, input.name, input.description ?? null, input.language ?? "javascript"]
    );
    const row = result.rows[0];

    if (row === undefined) {
      throw new Error("Project insert did not return a row");
    }

    await client.query(
      `INSERT INTO project_members (project_id, user_id, role)
       VALUES ($1, $2, 'owner')`,
      [row.id, ownerId]
    );

    await client.query("COMMIT");

    return {
      ...toProject(row),
      role: "owner"
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
};

export const getProject = async (projectId: string): Promise<Project> => {
  const result = await pool.query<ProjectRow>(
    `SELECT ${PROJECT_COLUMNS}
     FROM projects
     WHERE id = $1`,
    [projectId]
  );
  const row = result.rows[0];

  if (row === undefined) {
    throw NotFound("project_not_found");
  }

  return toProject(row);
};

export const getProjectWithRole = async (
  projectId: string,
  userId: string
): Promise<ProjectWithRole> => {
  const result = await pool.query<ProjectRow & { role: ProjectRole }>(
    `SELECT p.id,
            p.owner_id,
            p.name,
            p.description,
            p.visibility,
            p.language,
            p.created_at,
            p.updated_at,
            p.archived_at,
            pm.role
     FROM projects p
     JOIN project_members pm ON pm.project_id = p.id
     WHERE p.id = $1
       AND pm.user_id = $2`,
    [projectId, userId]
  );
  const row = result.rows[0];

  if (row === undefined) {
    throw NotFound("project_not_found");
  }

  return {
    ...toProject(row),
    role: row.role
  };
};

export const updateProject = async (
  projectId: string,
  input: UpdateProjectInput
): Promise<Project> => {
  const assignments: string[] = [];
  const values: unknown[] = [projectId];

  if (input.name !== undefined) {
    values.push(input.name);
    assignments.push(`name = $${values.length}`);
  }

  if (input.description !== undefined) {
    values.push(input.description);
    assignments.push(`description = $${values.length}`);
  }

  if (input.language !== undefined) {
    values.push(input.language);
    assignments.push(`language = $${values.length}`);
  }

  if (input.visibility !== undefined) {
    values.push(input.visibility);
    assignments.push(`visibility = $${values.length}`);
  }

  if (assignments.length === 0) {
    throw BadRequest("no_fields_to_update");
  }

  const result = await pool.query<ProjectRow>(
    `UPDATE projects
     SET ${assignments.join(", ")},
         updated_at = now()
     WHERE id = $1
     RETURNING ${PROJECT_COLUMNS}`,
    values
  );
  const row = result.rows[0];

  if (row === undefined) {
    throw NotFound("project_not_found");
  }

  return toProject(row);
};

export const deleteProject = async (projectId: string): Promise<void> => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const keysResult = await client.query<{ s3_key: string }>(
      `SELECT s3_key
       FROM files
       WHERE project_id = $1
         AND s3_key IS NOT NULL
       UNION ALL
       SELECT manifest_s3_key AS s3_key
       FROM project_snapshots
       WHERE project_id = $1`,
      [projectId]
    );

    const deleteResult = await client.query(
      `DELETE FROM projects
       WHERE id = $1`,
      [projectId]
    );

    if (deleteResult.rowCount === 0) {
      throw NotFound("project_not_found");
    }

    await client.query("COMMIT");

    const keys = keysResult.rows.map((row) => row.s3_key);

    if (keys.length > 0) {
      try {
        await s3Storage.deleteObjects(keys);
      } catch (error) {
        logReconciliationFailure(
          "deleteProject.s3",
          { projectId, keyCount: keys.length },
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

export const listMembers = async (
  projectId: string
): Promise<ProjectMemberWithUser[]> => {
  const result = await pool.query<MemberRow>(
    `SELECT pm.project_id,
            pm.user_id,
            pm.role,
            pm.created_at,
            u.email,
            u.display_name,
            u.avatar_url
     FROM project_members pm
     JOIN users u ON u.id = pm.user_id
     WHERE pm.project_id = $1
     ORDER BY CASE pm.role
                WHEN 'owner' THEN 0
                WHEN 'editor' THEN 1
                ELSE 2
              END,
              u.display_name ASC,
              pm.user_id ASC`,
    [projectId]
  );

  return result.rows.map(toMember);
};

export const addMember = async (
  projectId: string,
  input: AddMemberInput
): Promise<ProjectMemberWithUser> => {
  const userResult = await pool.query<UserLookupRow>(
    `SELECT id, email, display_name, avatar_url
     FROM users
     WHERE email = $1`,
    [input.email]
  );
  const user = userResult.rows[0];

  if (user === undefined) {
    throw NotFound("user_not_found");
  }

  try {
    await pool.query(
      `INSERT INTO project_members (project_id, user_id, role)
       VALUES ($1, $2, $3)`,
      [projectId, user.id, input.role]
    );
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw Conflict("member_already_exists");
    }

    if (isForeignKeyViolation(error)) {
      throw NotFound("project_not_found");
    }

    throw error;
  }

  return toMember(await getMemberRow(pool, projectId, user.id));
};

export const updateMemberRole = async (
  projectId: string,
  userId: string,
  role: Exclude<ProjectRole, "owner">
): Promise<ProjectMemberWithUser> => {
  const result = await pool.query<{ role: ProjectRole }>(
    `UPDATE project_members
     SET role = $3
     WHERE project_id = $1
       AND user_id = $2
       AND role <> 'owner'
     RETURNING role`,
    [projectId, userId, role]
  );

  if (result.rows.length === 0) {
    const existing = await pool.query<{ role: ProjectRole }>(
      `SELECT role
       FROM project_members
       WHERE project_id = $1
         AND user_id = $2`,
      [projectId, userId]
    );

    if (existing.rows[0]?.role === "owner") {
      throw BadRequest("cannot_change_owner_role");
    }

    throw NotFound("member_not_found");
  }

  return toMember(await getMemberRow(pool, projectId, userId));
};

export const removeMember = async (
  projectId: string,
  userId: string
): Promise<void> => {
  const result = await pool.query(
    `DELETE FROM project_members
     WHERE project_id = $1
       AND user_id = $2
       AND role <> 'owner'
     RETURNING user_id`,
    [projectId, userId]
  );

  if (result.rowCount === 0) {
    const existing = await pool.query<{ role: ProjectRole }>(
      `SELECT role
       FROM project_members
       WHERE project_id = $1
         AND user_id = $2`,
      [projectId, userId]
    );

    if (existing.rows[0]?.role === "owner") {
      throw BadRequest("cannot_remove_owner");
    }

    throw NotFound("member_not_found");
  }
};
