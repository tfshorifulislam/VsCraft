import { Router } from "express";
import { authController } from "../controllers/authController";
import { rateLimit } from "../middleware/rateLimit";

const router = Router();

const authRateLimit = rateLimit({
  bucketName: "auth-endpoint",
  windowMs: 60_000,
  max: 15,
});

router.post("/signup", authRateLimit, authController.signup);
router.post("/login", authRateLimit, authController.login);
router.post("/logout", authController.logout);
router.get("/me", authController.getMe);

export default router;
