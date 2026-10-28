import { Router } from "express";
import { loginSchema, registerSchema } from "@cloud-editor/shared";
import * as authController from "../controllers/auth.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { authLimiter, refreshLimiter } from "../middlewares/rateLimit.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const authRouter = Router();

authRouter.post(
  "/register",
  authLimiter,
  validate(registerSchema),
  asyncHandler(authController.register)
);

authRouter.post(
  "/login",
  authLimiter,
  validate(loginSchema),
  asyncHandler(authController.login)
);

authRouter.post("/refresh", refreshLimiter, asyncHandler(authController.refresh));

authRouter.post("/logout", asyncHandler(authController.logout));

authRouter.get("/me", requireAuth, asyncHandler(authController.me));
