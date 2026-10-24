import { Prisma } from "@prisma/client";
import prisma from "../db/prisma";
import { ProjectTemplate, ProjectCreationPayload, FrameworkInitOptions } from "../types/editor";
import { getTemplateFiles } from "./projectStorage";
import {
  generateEmptyWorkspaceFiles,
  generateBasicWebFiles,
  generateNextJsProjectFiles,
  getFilesForFrameworkInit,
} from "./frameworkEngine";
import {
  writeProjectFileToDisk,
  deleteProjectFileFromDisk,
  renameProjectFileOnDisk,
  deleteWorkspaceDir,
} from "./workspaceDisk";
import crypto from "crypto";

const PROJECT_CARD_PREVIEW_CHARS = 1200;
const MAX_INLINE_EDITOR_CONTENT_CHARS = 2 * 1024 * 1024;
const EDITOR_CRITICAL_PATHS = [
  "package.json",
  "requirements.txt",
  "pyproject.toml",
  "Pipfile",
  "Cargo.toml",
  "go.mod",
];

function parseOpenFileIds(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string")
      : [];
  } catch {
    return [];
  }
}

interface ScaffoldingFile {
  id?: string;
  name: string;
  path: string;
  content: string;
  language: string;
  isFolder: boolean;
  parentId: string | null;
}

function generateId(prefix: string = "id"): string {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

export async function createCloudProject(
  ownerId: string,
  templateOrPayload: ProjectTemplate | Partial<ProjectCreationPayload> = "react-ts",
  name?: string,
  description?: string
) {
  let template: ProjectTemplate = "react-ts";
  let projectName = name?.trim();
  let projectDesc = description;
  let templateFiles: ScaffoldingFile[] = [];
  let activeFileId: string | null = null;
  let openFileIds: string[] = [];

  if (typeof templateOrPayload === "object") {
    const p = templateOrPayload;
    if (p.name) projectName = p.name.trim();
    if (p.description) projectDesc = p.description;

    if (p.type === "blank" || p.template === "blank") {
      template = "blank";
      if (p.blankSubtype === "basic-web") {
        const res = generateBasicWebFiles(p.initGit);
        templateFiles = res.files;
        activeFileId = res.activeFileId;
        openFileIds = res.openFileIds;
      } else {
        const res = generateEmptyWorkspaceFiles();
        templateFiles = res.files;
        activeFileId = null;
        openFileIds = [];
      }
    } else {
      template = p.template || "next-app";
      if (template === "next-app") {
        const res = generateNextJsProjectFiles(p.nextConfig);
        templateFiles = res.files;
        activeFileId = res.activeFileId;
        openFileIds = res.openFileIds;
      } else {
        const res = getTemplateFiles(template);
        templateFiles = res.files;
        activeFileId = res.activeFileId;
        openFileIds = res.openFileIds;
      }
    }
  } else {
    template = templateOrPayload;
    if (template === "blank") {
      const res = generateEmptyWorkspaceFiles();
      templateFiles = res.files;
      activeFileId = null;
      openFileIds = [];
    } else {
      const res = getTemplateFiles(template);
      templateFiles = res.files;
      activeFileId = res.activeFileId;
      openFileIds = res.openFileIds;
    }
  }

  const defaultNames: Record<ProjectTemplate, string> = {
    "react-ts": "Interactive React App",
    "vanilla-web": "Modern Web Application",
    "next-app": "Next.js App Router Service",
    "node-api": "Node.js REST API",
    python: "Python 3 Analytics Service",
    cpp: "C++20 High Performance App",
    go: "Go Cloud Microservice",
    rust: "Rust Systems Project",
    blank: "Empty Project",
  };

  const finalProjectName = projectName || defaultNames[template] || "New Project";
  const projectId = generateId("proj");

  // Map old template file IDs to fresh unique IDs while preserving parent-child relations
  const idMap = new Map<string, string>();
  for (const f of templateFiles) {
    const oldId = f.id || f.path;
    idMap.set(oldId, generateId("f"));
  }

  const mappedActiveFileId = activeFileId && idMap.has(activeFileId) ? idMap.get(activeFileId) : null;
  const mappedOpenFileIds = openFileIds.map((id) => idMap.get(id) || id);

  return prisma.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: {
        id: projectId,
        name: finalProjectName,
        description: projectDesc || null,
        template,
        ownerId,
        starred: false,
        isTrash: false,
        activeFileId: mappedActiveFileId,
        openFileIds: JSON.stringify(mappedOpenFileIds),
      },
    });

    const filesToCreate = templateFiles.map((f) => {
      const oldId = f.id || f.path;
      const newId = idMap.get(oldId)!;
      let newParentId: string | null = null;
      if (f.parentId && idMap.has(f.parentId)) {
        newParentId = idMap.get(f.parentId)!;
      } else if (f.path.includes("/")) {
        const parentPath = f.path.substring(0, f.path.lastIndexOf("/"));
        newParentId = idMap.get(parentPath) || null;
      }
      return {
        id: newId,
        projectId: project.id,
        name: f.name,
        path: f.path,
        content: f.content || "",
        language: f.language || (f.isFolder ? "" : "plaintext"),
        isFolder: f.isFolder,
        parentId: newParentId,
        version: 1,
      };
    });

    if (filesToCreate.length > 0) {
      await tx.projectFile.createMany({
        data: filesToCreate,
      });
    }

    return tx.project.findUnique({
      where: { id: project.id },
      include: {
        files: {
          orderBy: { path: "asc" },
        },
      },
    });
  }, { maxWait: 10000, timeout: 30000 });
}

export async function seedStarterProjectsForUser(userId: string) {
  const existingCount = await prisma.project.count({
    where: { ownerId: userId },
  });

  if (existingCount > 0) return;

  await createCloudProject(
    userId,
    "react-ts",
    "Interactive React App",
    "State counter and interactive task management with live React preview."
  );

  await createCloudProject(
    userId,
    "vanilla-web",
    "Modern Web Dashboard",
    "HTML5, responsive CSS grid, and interactive JavaScript widgets."
  );
}

export async function getUserProjects(userId: string, category: "all" | "recent" | "starred" | "trash" = "all") {
  const whereClause: {
    ownerId: string;
    isTrash?: boolean;
    starred?: boolean;
  } = { ownerId: userId };

  if (category === "trash") {
    whereClause.isTrash = true;
  } else {
    whereClause.isTrash = false;
    if (category === "starred") {
      whereClause.starred = true;
    }
  }

  const projects = await prisma.project.findMany({
    where: whereClause,
    orderBy: { updatedAt: "desc" },
    take: category === "recent" ? 8 : undefined,
    select: {
      id: true,
      name: true,
      description: true,
      template: true,
      starred: true,
      isTrash: true,
      trashedAt: true,
      activeFileId: true,
      openFileIds: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: { files: true },
      },
      files: {
        where: { isFolder: false },
        take: 3,
        select: {
          id: true,
          name: true,
          path: true,
          language: true,
        },
      },
    },
  });

  const previewFileIds = projects.flatMap((project) =>
    project.files.map((file) => file.id)
  );
  if (previewFileIds.length === 0) return projects;

  const previews = await prisma.$queryRaw<Array<{ id: string; preview: string }>>`
    SELECT id, left(content, CAST(${PROJECT_CARD_PREVIEW_CHARS} AS integer)) AS preview
    FROM "ProjectFile"
    WHERE id IN (${Prisma.join(previewFileIds)})
  `;
  const previewById = new Map(previews.map((preview) => [preview.id, preview.preview]));

  return projects.map((project) => ({
    ...project,
    files: project.files.map((file) => ({
      ...file,
      content: previewById.get(file.id) || "",
    })),
  }));
}

export async function getProjectById(
  projectId: string,
  userId: string,
  options: { includeContent?: "auto" | "full" } = {}
) {
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      ownerId: userId,
    },
    include: {
      files: {
        orderBy: [{ isFolder: "desc" }, { path: "asc" }],
        select: {
          id: true,
          projectId: true,
          name: true,
          path: true,
          language: true,
          isFolder: true,
          parentId: true,
          version: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });
  if (!project) return null;

  let totalChars = 0;
  if (options.includeContent !== "full") {
    const [size] = await prisma.$queryRaw<Array<{ chars: bigint }>>`
      SELECT coalesce(sum(length(content)), 0) AS chars
      FROM "ProjectFile"
      WHERE "projectId" = ${projectId} AND "isFolder" = false
    `;
    totalChars = Number(size?.chars || 0);
  }

  const includeAll =
    options.includeContent === "full" || totalChars <= MAX_INLINE_EDITOR_CONTENT_CHARS;
  let contentIds: string[];

  if (includeAll) {
    contentIds = project.files.filter((file) => !file.isFolder).map((file) => file.id);
  } else {
    const criticalFiles = await prisma.projectFile.findMany({
      where: {
        projectId,
        isFolder: false,
        path: { in: EDITOR_CRITICAL_PATHS },
      },
      select: { id: true },
    });
    contentIds = [
      ...new Set([
        ...(project.activeFileId ? [project.activeFileId] : []),
        ...parseOpenFileIds(project.openFileIds),
        ...criticalFiles.map((file) => file.id),
      ]),
    ];
  }

  const contentById = new Map<string, string>();
  if (contentIds.length > 0) {
    const contents = await prisma.projectFile.findMany({
      where: { projectId, id: { in: contentIds } },
      select: { id: true, content: true },
    });
    for (const file of contents) contentById.set(file.id, file.content);
  }

  return {
    ...project,
    files: project.files.map((file) => ({
      ...file,
      content: contentById.get(file.id) || "",
    })),
    contentLazy: !includeAll,
    loadedFileIds: [...contentById.keys()],
  };
}

export async function getProjectFileContent(
  projectId: string,
  fileId: string,
  userId: string
) {
  return prisma.projectFile.findFirst({
    where: {
      id: fileId,
      projectId,
      project: { ownerId: userId },
      isFolder: false,
    },
    select: {
      id: true,
      name: true,
      path: true,
      content: true,
      version: true,
    },
  });
}

export async function updateProjectMetadata(
  projectId: string,
  userId: string,
  data: {
    name?: string;
    description?: string;
    starred?: boolean;
    isTrash?: boolean;
    activeFileId?: string | null;
    openFileIds?: string[];
  }
) {
  // Validate ownership
  const existing = await prisma.project.findFirst({
    where: { id: projectId, ownerId: userId },
  });
  if (!existing) return null;

  const updateData: Record<string, unknown> = {};
  if (data.name !== undefined) updateData.name = data.name.trim();
  if (data.description !== undefined) updateData.description = data.description;
  if (data.starred !== undefined) updateData.starred = data.starred;
  if (data.isTrash !== undefined) {
    updateData.isTrash = data.isTrash;
    updateData.trashedAt = data.isTrash ? new Date() : null;
  }
  if (data.activeFileId !== undefined) updateData.activeFileId = data.activeFileId;
  if (data.openFileIds !== undefined) updateData.openFileIds = JSON.stringify(data.openFileIds);

  return prisma.project.update({
    where: { id: projectId },
    data: updateData,
  });
}

export async function deleteProject(projectId: string, userId: string, permanent: boolean = false) {
  const existing = await prisma.project.findFirst({
    where: { id: projectId, ownerId: userId },
  });
  if (!existing) return null;

  if (permanent) {
    const deleted = await prisma.project.delete({
      where: { id: projectId },
    });
    await deleteWorkspaceDir(projectId).catch((err) =>
      console.error(`Failed to remove workspace for deleted project ${projectId}:`, err)
    );
    return deleted;
  }

  return prisma.project.update({
    where: { id: projectId },
    data: {
      isTrash: true,
      trashedAt: new Date(),
    },
  });
}

export async function emptyTrashForUser(userId: string) {
  const trashed = await prisma.project.findMany({
    where: { ownerId: userId, isTrash: true },
    select: { id: true },
  });

  const result = await prisma.project.deleteMany({
    where: {
      ownerId: userId,
      isTrash: true,
    },
  });

  await Promise.all(
    trashed.map((project) =>
      deleteWorkspaceDir(project.id).catch((err) =>
        console.error(`Failed to remove workspace for trashed project ${project.id}:`, err)
      )
    )
  );

  return { count: result.count, ids: trashed.map((project) => project.id) };
}

export async function duplicateProject(projectId: string, userId: string) {
  const source = await getProjectById(projectId, userId);
  if (!source) return null;

  const newProject = await createCloudProject(
    userId,
    source.template as ProjectTemplate,
    `${source.name} (Copy)`,
    source.description || undefined
  );

  return newProject;
}

export async function createProjectFile(
  projectId: string,
  userId: string,
  data: {
    name: string;
    isFolder: boolean;
    parentId?: string | null;
    content?: string;
  }
) {
  // Verify ownership
  const project = await prisma.project.findFirst({
    where: { id: projectId, ownerId: userId },
  });
  if (!project) return null;

  // Sanitize name: remove path separators
  const sanitizedName = data.name.replace(/[/\\?%*:|"<>]/g, "").trim();
  if (!sanitizedName) throw new Error("Invalid file name");

  // Resolve parent path
  let parentPath = "";
  if (data.parentId) {
    const parent = await prisma.projectFile.findFirst({
      where: { id: data.parentId, projectId },
    });
    if (parent) {
      parentPath = parent.path;
    }
  }

  const filePath = parentPath ? `${parentPath}/${sanitizedName}` : sanitizedName;
  const ext = sanitizedName.split(".").pop() || "plaintext";
  const fileId = generateId("f");

  const [newFile] = await prisma.$transaction([
    prisma.projectFile.create({
      data: {
        id: fileId,
        projectId,
        name: sanitizedName,
        path: filePath,
        content: data.content || (data.isFolder ? "" : `// ${sanitizedName}\n`),
        language: data.isFolder ? "" : ext,
        isFolder: data.isFolder,
        parentId: data.parentId || null,
        version: 1,
      },
    }),
    prisma.project.update({
      where: { id: projectId },
      data: { updatedAt: new Date() },
    }),
  ]);

  // Synchronize to physical workspace on disk
  await writeProjectFileToDisk(projectId, newFile.path, newFile.content, newFile.isFolder).catch((err) =>
    console.error("Failed to write created file to disk:", err)
  );

  return newFile;
}

export async function updateProjectFileContent(
  projectId: string,
  fileId: string,
  userId: string,
  content: string,
  version?: number
) {
  // Verify ownership
  const project = await prisma.project.findFirst({
    where: { id: projectId, ownerId: userId },
  });
  if (!project) return { error: "Project not found or unauthorized", status: 404 };

  const file = await prisma.projectFile.findFirst({
    where: { id: fileId, projectId },
  });
  if (!file) return { error: "File not found", status: 404 };

  if (typeof version === "number" && version !== file.version) {
    return {
      error: "Save conflict: this file was changed by another session. Reload it before saving again.",
      status: 409,
      conflict: true,
      serverVersion: file.version,
      serverContent: file.content,
    };
  }

  const nextVersion = (file.version || 0) + 1;
  const updateResult = await prisma.projectFile.updateMany({
    where: { id: fileId, projectId, version: file.version },
    data: {
      content,
      version: nextVersion,
      updatedAt: new Date(),
    },
  });

  if (updateResult.count === 0) {
    const latest = await prisma.projectFile.findUnique({ where: { id: fileId } });
    return {
      error: "Save conflict: this file was changed by another session. Reload it before saving again.",
      status: 409,
      conflict: true,
      serverVersion: latest?.version ?? file.version,
      serverContent: latest?.content ?? file.content,
    };
  }

  const [updatedFile] = await prisma.$transaction([
    prisma.projectFile.findUniqueOrThrow({ where: { id: fileId } }),
    prisma.project.update({
      where: { id: projectId },
      data: { updatedAt: new Date() },
    }),
  ]);

  // Synchronize saved content to physical workspace on disk
  try {
    await writeProjectFileToDisk(projectId, updatedFile.path, updatedFile.content, false);
  } catch (err) {
    console.error("Failed to write updated file to disk:", err);
  }

  return { file: updatedFile, status: 200 };
}

export async function renameProjectFile(
  projectId: string,
  fileId: string,
  userId: string,
  newName: string
) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, ownerId: userId },
  });
  if (!project) return null;

  const file = await prisma.projectFile.findFirst({
    where: { id: fileId, projectId },
  });
  if (!file) return null;

  const sanitizedName = newName.replace(/[/\\?%*:|"<>]/g, "").trim();
  if (!sanitizedName) throw new Error("Invalid file name");

  const pathSegments = file.path.split("/");
  pathSegments[pathSegments.length - 1] = sanitizedName;
  const newPath = pathSegments.join("/");

  if (file.isFolder) {
    // If folder, also update all descendants' paths
    const oldPrefix = `${file.path}/`;
    const newPrefix = `${newPath}/`;

    const descendants = await prisma.projectFile.findMany({
      where: {
        projectId,
        path: { startsWith: oldPrefix },
      },
    });

    await prisma.$transaction([
      prisma.projectFile.update({
        where: { id: fileId },
        data: { name: sanitizedName, path: newPath },
      }),
      ...descendants.map((d) =>
        prisma.projectFile.update({
          where: { id: d.id },
          data: { path: `${newPrefix}${d.path.slice(oldPrefix.length)}` },
        })
      ),
      prisma.project.update({
        where: { id: projectId },
        data: { updatedAt: new Date() },
      }),
    ]);
  } else {
    await prisma.$transaction([
      prisma.projectFile.update({
        where: { id: fileId },
        data: {
          name: sanitizedName,
          path: newPath,
          language: sanitizedName.split(".").pop() || "plaintext",
        },
      }),
      prisma.project.update({
        where: { id: projectId },
        data: { updatedAt: new Date() },
      }),
    ]);
  }

  // Synchronize rename on disk
  await renameProjectFileOnDisk(projectId, file.path, newPath).catch((err) =>
    console.error("Failed to rename file on disk:", err)
  );

  return prisma.projectFile.findUnique({ where: { id: fileId } });
}

export async function deleteProjectFile(
  projectId: string,
  fileId: string,
  userId: string
) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, ownerId: userId },
  });
  if (!project) return null;

  const file = await prisma.projectFile.findFirst({
    where: { id: fileId, projectId },
  });
  if (!file) return null;

  if (file.isFolder) {
    // Collect all descendants recursively
    const prefix = `${file.path}/`;
    await prisma.$transaction([
      prisma.projectFile.deleteMany({
        where: {
          projectId,
          path: { startsWith: prefix },
        },
      }),
      prisma.projectFile.delete({
        where: { id: fileId },
      }),
      prisma.project.update({
        where: { id: projectId },
        data: { updatedAt: new Date() },
      }),
    ]);
  } else {
    await prisma.$transaction([
      prisma.projectFile.delete({
        where: { id: fileId },
      }),
      prisma.project.update({
        where: { id: projectId },
        data: { updatedAt: new Date() },
      }),
    ]);
  }

  // Synchronize deletion on disk
  await deleteProjectFileFromDisk(projectId, file.path).catch((err) =>
    console.error("Failed to delete file from disk:", err)
  );

  return { success: true };
}

export async function initializeFrameworkOnProject(
  projectId: string,
  userId: string,
  options: FrameworkInitOptions
) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, ownerId: userId },
    include: { files: true },
  });
  if (!project) return null;

  if (options.type === "add-shadcn") {
    return prisma.$transaction(async (tx) => {
      // 1. Add components.json if not present
      const hasComponentsJson = project.files.some((f) => f.path === "components.json");
      if (!hasComponentsJson) {
        await tx.projectFile.create({
          data: {
            id: generateId("f"),
            projectId: project.id,
            name: "components.json",
            path: "components.json",
            content: JSON.stringify(
              {
                $schema: "https://ui.shadcn.com/schema.json",
                style: "default",
                rsc: true,
                tsx: true,
                tailwind: {
                  config: "tailwind.config.ts",
                  css: "app/globals.css",
                  baseColor: "neutral",
                  cssVariables: true,
                },
                aliases: {
                  components: "@/components",
                  utils: "@/lib/utils",
                  ui: "@/components/ui",
                },
              },
              null,
              2
            ),
            language: "json",
            isFolder: false,
            parentId: null,
          },
        });
      }

      // 2. Add lib folder and utils.ts
      let libFolder = project.files.find((f) => f.isFolder && f.path === "lib");
      if (!libFolder) {
        libFolder = await tx.projectFile.create({
          data: {
            id: generateId("f"),
            projectId: project.id,
            name: "lib",
            path: "lib",
            content: "",
            language: "",
            isFolder: true,
            parentId: null,
          },
        });
      }

      const hasUtils = project.files.some((f) => f.path === "lib/utils.ts");
      if (!hasUtils) {
        await tx.projectFile.create({
          data: {
            id: generateId("f"),
            projectId: project.id,
            name: "utils.ts",
            path: "lib/utils.ts",
            content: `import { clsx, type ClassValue } from "clsx";\nimport { twMerge } from "tailwind-merge";\n\nexport function cn(...inputs: ClassValue[]) {\n  return twMerge(clsx(inputs));\n}\n`,
            language: "typescript",
            isFolder: false,
            parentId: libFolder.id,
          },
        });
      }

      // 3. Add components folder and components/ui folder
      let componentsFolder = project.files.find((f) => f.isFolder && f.path === "components");
      if (!componentsFolder) {
        componentsFolder = await tx.projectFile.create({
          data: {
            id: generateId("f"),
            projectId: project.id,
            name: "components",
            path: "components",
            content: "",
            language: "",
            isFolder: true,
            parentId: null,
          },
        });
      }

      let uiFolder = project.files.find((f) => f.isFolder && f.path === "components/ui");
      if (!uiFolder) {
        uiFolder = await tx.projectFile.create({
          data: {
            id: generateId("f"),
            projectId: project.id,
            name: "ui",
            path: "components/ui",
            content: "",
            language: "",
            isFolder: true,
            parentId: componentsFolder.id,
          },
        });
      }

      // 4. Add button.tsx
      const hasButton = project.files.some((f) => f.path === "components/ui/button.tsx" || f.path === "src/components/ui/button.tsx");
      if (!hasButton) {
        await tx.projectFile.create({
          data: {
            id: generateId("f"),
            projectId: project.id,
            name: "button.tsx",
            path: "components/ui/button.tsx",
            content: `import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline: "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
`,
            language: "typescript",
            isFolder: false,
            parentId: uiFolder.id,
          },
        });
      }

      // 4b. Add card.tsx
      const hasCard = project.files.some((f) => f.path === "components/ui/card.tsx" || f.path === "src/components/ui/card.tsx");
      if (!hasCard) {
        await tx.projectFile.create({
          data: {
            id: generateId("f"),
            projectId: project.id,
            name: "card.tsx",
            path: "components/ui/card.tsx",
            content: `import * as React from "react";
import { cn } from "@/lib/utils";

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-xl border bg-card text-card-foreground shadow",
      className
    )}
    {...props}
  />
));
Card.displayName = "Card";

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props}
  />
));
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn("font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
));
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
));
CardFooter.displayName = "CardFooter";

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
};
`,
            language: "typescript",
            isFolder: false,
            parentId: uiFolder.id,
          },
        });
      }

      // 5. Update package.json dependencies
      const pkgFile = project.files.find((f) => f.path === "package.json");
      if (pkgFile) {
        try {
          const parsed = JSON.parse(pkgFile.content);
          parsed.dependencies = {
            ...parsed.dependencies,
            clsx: "^2.1.1",
            "tailwind-merge": "^2.5.5",
            "class-variance-authority": "^0.7.1",
            "lucide-react": "^0.469.0",
            "@radix-ui/react-slot": "^1.1.1",
          };
          await tx.projectFile.update({
            where: { id: pkgFile.id },
            data: { content: JSON.stringify(parsed, null, 2), version: pkgFile.version + 1 },
          });
        } catch {
          // preserve on json parse error
        }
      }

      // 6. Ensure tsconfig.json has compatible baseUrl and path aliases
      const tsconfigFile = project.files.find((f) => f.path === "tsconfig.json");
      if (tsconfigFile) {
        try {
          const parsedTs = JSON.parse(tsconfigFile.content);
          parsedTs.compilerOptions = parsedTs.compilerOptions || {};
          parsedTs.compilerOptions.baseUrl = ".";
          parsedTs.compilerOptions.paths = {
            ...parsedTs.compilerOptions.paths,
            "@/*": ["./*", "./src/*"],
          };
          parsedTs.compilerOptions.jsx = parsedTs.compilerOptions.jsx || "preserve";
          await tx.projectFile.update({
            where: { id: tsconfigFile.id },
            data: { content: JSON.stringify(parsedTs, null, 2), version: tsconfigFile.version + 1 },
          });
        } catch {
          // preserve on json parse error
        }
      }

      await tx.project.update({
        where: { id: project.id },
        data: { updatedAt: new Date() },
      });

      return tx.project.findUnique({
        where: { id: project.id },
        include: { files: { orderBy: [{ isFolder: "desc" }, { path: "asc" }] } },
      });
    });
  }

  // Otherwise, initialize a new framework (for blank/empty workspaces)
  const { files: newFiles, activeFileId, openFileIds } = getFilesForFrameworkInit(options);

  return prisma.$transaction(async (tx) => {
    const idMap = new Map<string, string>();
    for (const f of newFiles) {
      const newId = generateId("f");
      idMap.set(f.path, newId);
    }

    for (const f of newFiles) {
      const newId = idMap.get(f.path)!;
      let parentDbId: string | null = null;
      if (f.path.includes("/")) {
        const parentPath = f.path.substring(0, f.path.lastIndexOf("/"));
        parentDbId = idMap.get(parentPath) || null;
      }

      await tx.projectFile.create({
        data: {
          id: newId,
          projectId: project.id,
          name: f.name,
          path: f.path,
          content: f.content,
          language: f.language,
          isFolder: f.isFolder,
          parentId: parentDbId,
          version: 1,
        },
      });
    }

    const mappedActiveId = activeFileId ? idMap.get(activeFileId) || null : null;
    const mappedOpenIds = openFileIds.map((p) => idMap.get(p) || p);

    let mappedTemplate: ProjectTemplate = project.template as ProjectTemplate;
    if (options.type === "nextjs") mappedTemplate = "next-app";
    else if (options.type === "react-vite") mappedTemplate = "react-ts";
    else if (options.type === "nodejs") mappedTemplate = "node-api";
    else if (options.type === "python") mappedTemplate = "python";
    else if (options.type === "html-web") mappedTemplate = "vanilla-web";

    await tx.project.update({
      where: { id: project.id },
      data: {
        template: mappedTemplate,
        activeFileId: mappedActiveId,
        openFileIds: JSON.stringify(mappedOpenIds),
        updatedAt: new Date(),
      },
    });

    return tx.project.findUnique({
      where: { id: project.id },
      include: { files: { orderBy: [{ isFolder: "desc" }, { path: "asc" }] } },
    });
  });
}
