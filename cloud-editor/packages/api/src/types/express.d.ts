import type { ProjectRole } from "@cloud-editor/shared";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
      };
      projectRole?: ProjectRole;
    }
  }
}

export {};
