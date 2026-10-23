import { Request, Response, NextFunction } from "express";
import { getSessionUser } from "../auth/session";

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string | null;
    avatar: string | null;
    createdAt: Date;
    settings: any;
  } | null;
}

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const user = await getSessionUser(req);
    if (!user) {
      return res.status(401).json({ error: "Unauthorized: Please log in to continue" });
    }
    req.user = user;
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    return res.status(500).json({ error: "Internal authentication error" });
  }
}

export async function optionalAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const user = await getSessionUser(req);
    req.user = user || null;
    next();
  } catch {
    req.user = null;
    next();
  }
}
