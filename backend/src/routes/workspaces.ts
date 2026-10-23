import { Router, Response } from "express";
import { AuthenticatedRequest, requireAuth } from "../middleware/auth";
import { getProjectById } from "../services/projectService";
import { workspaceManager } from "../services/workspaceManager";

const router = Router();

// GET /api/workspaces/:id
router.get("/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const projectId = req.params.id;

  const project = await getProjectById(projectId, userId);
  if (!project) {
    return res.status(404).json({ error: "Project not found or unauthorized" });
  }

  const workspace = await workspaceManager.getOrCreateWorkspace({
    projectId: project.id,
    userId,
    template: project.template,
  });

  return res.json({
    workspace,
    hasDocker: await workspaceManager.isDockerDaemonAvailable(),
  });
});

// POST /api/workspaces/:id
router.post("/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const projectId = req.params.id;

  const project = await getProjectById(projectId, userId);
  if (!project) {
    return res.status(404).json({ error: "Project not found or unauthorized" });
  }

  const action = req.body?.action || "start";

  if (action === "stop") {
    await workspaceManager.stopWorkspace(projectId);
    return res.json({ success: true, status: "stopped" });
  }

  const workspace = await workspaceManager.restartWorkspace({
    projectId: project.id,
    userId,
    template: project.template,
  });

  return res.json({ workspace });
});

export default router;
