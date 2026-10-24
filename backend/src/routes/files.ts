import { Router, Response } from "express";
import { AuthenticatedRequest, requireAuth } from "../middleware/auth";
import {
  createProjectFile,
  updateProjectFileContent,
  renameProjectFile,
  deleteProjectFile,
  getProjectFileContent,
} from "../services/projectService";

const router = Router();

// POST /api/projects/:id/files - create file or folder
router.post("/:id/files", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const projectId = req.params.id;

  try {
    const { name, isFolder, parentId, content } = req.body || {};

    if (!name || typeof name !== "string") {
      return res.status(400).json({ error: "File name is required." });
    }

    const newFile = await createProjectFile(projectId, userId, {
      name,
      isFolder: Boolean(isFolder),
      parentId: parentId || null,
      content,
    });

    if (!newFile) {
      return res.status(404).json({ error: "Project not found or unauthorized." });
    }

    return res.status(201).json({ file: newFile });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create file.";
    console.error("Create file error:", error);
    return res.status(500).json({ error: message });
  }
});

// GET /api/projects/:id/files/:fileId/content - load file content on demand
router.get(
  "/:id/files/:fileId/content",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;
    const { id: projectId, fileId } = req.params;

    try {
      const file = await getProjectFileContent(projectId, fileId, userId);
      if (!file) {
        return res.status(404).json({ error: "File not found or unauthorized." });
      }
      return res.json({ file });
    } catch (error) {
      console.error("Load file content error:", error);
      return res.status(500).json({ error: "Failed to load file content." });
    }
  }
);

// PATCH /api/projects/:id/files/:fileId - update content
router.patch("/:id/files/:fileId", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const { id: projectId, fileId } = req.params;

  try {
    const { content, version } = req.body || {};

    if (content === undefined || typeof content !== "string") {
      return res.status(400).json({ error: "Content must be a string." });
    }

    const result = await updateProjectFileContent(
      projectId,
      fileId,
      userId,
      content,
      version
    );

    if (result.status !== 200) {
      return res.status(result.status).json(result);
    }

    return res.json({ file: result.file });
  } catch (error) {
    console.error("Save file error:", error);
    return res.status(500).json({ error: "Failed to save file." });
  }
});

// PUT /api/projects/:id/files/:fileId - rename
router.put("/:id/files/:fileId", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const { id: projectId, fileId } = req.params;

  try {
    const { newName } = req.body || {};

    if (!newName || typeof newName !== "string") {
      return res.status(400).json({ error: "New name is required." });
    }

    const updated = await renameProjectFile(projectId, fileId, userId, newName);
    if (!updated) {
      return res.status(404).json({ error: "File not found or unauthorized." });
    }

    return res.json({ file: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to rename file.";
    console.error("Rename file error:", error);
    return res.status(500).json({ error: message });
  }
});

// DELETE /api/projects/:id/files/:fileId - delete
router.delete("/:id/files/:fileId", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const { id: projectId, fileId } = req.params;

  try {
    const result = await deleteProjectFile(projectId, fileId, userId);
    if (!result) {
      return res.status(404).json({ error: "File not found or unauthorized." });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error("Delete file error:", error);
    return res.status(500).json({ error: "Failed to delete file." });
  }
});

export default router;
