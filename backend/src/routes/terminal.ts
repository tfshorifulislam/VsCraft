import { Router, Response } from "express";
import { AuthenticatedRequest, requireAuth } from "../middleware/auth";
import { getProjectById } from "../services/projectService";

const router = Router();

/**
 * Terminal Route Handler
 * Architecture Enforcement: User code execution on the backend host is strictly disabled.
 * All project command execution and terminal shells run inside the browser's WebContainer runtime.
 */

// GET /api/projects/:id/terminal/sessions
router.get("/:id/terminal/sessions", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const projectId = req.params.id;

  const project = await getProjectById(projectId, userId);
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }

  return res.json({
    sessions: [],
    availableShells: [
      {
        type: "bash",
        label: "Browser WebContainer Shell (jsh)",
        path: "/bin/jsh",
      },
    ],
    message: "Terminal execution is confined to browser WebContainers.",
  });
});

// POST /api/projects/:id/terminal/sessions - Disallowed on host
router.post("/:id/terminal/sessions", requireAuth, async (_req: AuthenticatedRequest, res: Response) => {
  return res.status(403).json({
    error: "Backend terminal execution is disabled. Project commands run in the browser's WebContainer runtime.",
  });
});

// PATCH /api/projects/:id/terminal/sessions - Disallowed on host
router.patch("/:id/terminal/sessions", requireAuth, async (_req: AuthenticatedRequest, res: Response) => {
  return res.status(403).json({
    error: "Backend terminal execution is disabled.",
  });
});

// POST /api/projects/:id/terminal/input - Disallowed on host
router.post("/:id/terminal/input", requireAuth, async (_req: AuthenticatedRequest, res: Response) => {
  return res.status(403).json({
    error: "Backend terminal execution is disabled. Terminal input is handled client-side in WebContainer.",
  });
});

// POST /api/projects/:id/terminal/resize - Disallowed on host
router.post("/:id/terminal/resize", requireAuth, async (_req: AuthenticatedRequest, res: Response) => {
  return res.status(403).json({
    error: "Backend terminal execution is disabled.",
  });
});

// POST /api/projects/:id/terminal/kill - Disallowed on host
router.post("/:id/terminal/kill", requireAuth, async (_req: AuthenticatedRequest, res: Response) => {
  return res.status(403).json({
    error: "Backend terminal execution is disabled.",
  });
});

// POST /api/projects/:id/terminal - Disallowed on host
router.post("/:id/terminal", requireAuth, async (_req: AuthenticatedRequest, res: Response) => {
  return res.status(403).json({
    error: "Backend command execution is disabled. Project commands must run in the browser's WebContainer runtime.",
  });
});

// POST /api/projects/:id/terminal/stream - Disallowed on host
router.post("/:id/terminal/stream", requireAuth, async (_req: AuthenticatedRequest, res: Response) => {
  return res.status(403).json({
    error: "Backend terminal stream is disabled. Terminal streaming is handled client-side in WebContainer.",
  });
});

export default router;
