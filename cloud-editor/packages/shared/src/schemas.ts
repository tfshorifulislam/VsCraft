import { z } from "zod";

export const uuidSchema = z.string().uuid();

export const isoDateTimeSchema = z.string().datetime({ offset: true });

export const projectVisibilitySchema = z.enum(["private", "public"]);

export const memberRoleSchema = z.enum(["owner", "editor", "viewer"]);

export const inviteableRoleSchema = z.enum(["editor", "viewer"]);

export const registerSchema = z
  .object({
    email: z.string().trim().email().max(320),
    password: z
      .string()
      .min(8)
      .max(200)
      .regex(/[A-Za-z]/, "Password must contain at least one letter")
      .regex(/[0-9]/, "Password must contain at least one number"),
    displayName: z.string().trim().min(1).max(60)
  })
  .strict();

export const loginSchema = z
  .object({
    email: z.string().trim().email().max(320),
    password: z.string().min(1).max(200)
  })
  .strict();

export const userSchema = z
  .object({
    id: uuidSchema,
    email: z.string().trim().email().max(320),
    displayName: z.string().trim().min(1).max(120),
    avatarUrl: z.string().url().nullable(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema
  })
  .strict();

export const projectSchema = z
  .object({
    id: uuidSchema,
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(1000).nullable(),
    ownerId: uuidSchema,
    visibility: projectVisibilitySchema,
    language: z.string().trim().min(1).max(64),
    archivedAt: isoDateTimeSchema.nullable(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema
  })
  .strict();

const safeProjectPathSchema = z
  .string()
  .trim()
  .min(1)
  .max(1024)
  .refine((value) => {
    if (value.startsWith("/") || value.endsWith("/")) {
      return false;
    }

    if (value.includes("\\") || /[\u0000-\u001f]/.test(value)) {
      return false;
    }

    return value
      .split("/")
      .every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
  }, "Path must be a normalized, relative POSIX path without traversal segments");

export const relativeFilePathSchema = z
  .string()
  .trim()
  .min(1)
  .max(1024)
  .regex(
    /^(?!\/)(?!.*\.\.)(?!.*\\).+$/,
    "Path must be relative, must not contain '..', and must not contain backslashes"
  );

export const fileSchema = z
  .object({
    id: uuidSchema,
    projectId: uuidSchema,
    path: safeProjectPathSchema,
    storageKey: z.string().min(1).max(2048),
    sizeBytes: z.number().int().nonnegative(),
    contentType: z.string().min(1).max(255),
    etag: z.string().min(1).max(255).nullable(),
    createdBy: uuidSchema,
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema
  })
  .strict();

export const memberSchema = z
  .object({
    id: uuidSchema,
    projectId: uuidSchema,
    userId: uuidSchema,
    role: memberRoleSchema,
    invitedBy: uuidSchema.nullable(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema
  })
  .strict();

export const projectIdParamsSchema = z.object({
  projectId: uuidSchema
});

export const projectMemberParamsSchema = z.object({
  projectId: uuidSchema,
  userId: uuidSchema
});

export const createProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(1000).nullable().optional(),
    language: z.string().trim().min(1).max(64).default("javascript")
  })
  .strict();

export const updateProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    language: z.string().trim().min(1).max(64).optional(),
    visibility: projectVisibilitySchema.optional()
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one project field must be provided"
  });

export const inviteMemberSchema = z
  .object({
    email: z.string().trim().email().max(320),
    role: inviteableRoleSchema.default("editor")
  })
  .strict();

export const addMemberSchema = z
  .object({
    email: z.string().trim().email().max(320),
    role: z.enum(["editor", "viewer"])
  })
  .strict();

export const updateMemberRoleSchema = z
  .object({
    role: inviteableRoleSchema
  })
  .strict();

export const createFileSchema = z
  .object({
    path: relativeFilePathSchema,
    is_dir: z.boolean().default(false)
  })
  .strict();

export const renameFileSchema = z
  .object({
    newPath: relativeFilePathSchema
  })
  .strict();

export const updateFileSchema = z
  .object({
    path: safeProjectPathSchema.optional()
  })
  .strict()
  .refine((value) => value.path !== undefined, {
    message: "A new file path must be provided"
  });

export const paginationSchema = z
  .object({
    cursor: uuidSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20)
  })
  .strict();

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UserDto = z.infer<typeof userSchema>;
export type ProjectDto = z.infer<typeof projectSchema>;
export type FileDto = z.infer<typeof fileSchema>;
export type MemberDto = z.infer<typeof memberSchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
export type AddMemberInput = z.infer<typeof addMemberSchema>;
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
export type CreateFileInput = z.infer<typeof createFileSchema>;
export type RenameFileInput = z.infer<typeof renameFileSchema>;
export type UpdateFileInput = z.infer<typeof updateFileSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
