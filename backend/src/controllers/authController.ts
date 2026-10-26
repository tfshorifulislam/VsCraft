import { Request, Response } from "express";
import prisma from "../db/prisma";
import { hashPassword, verifyPassword } from "../auth/passwords";
import { signSessionToken } from "../auth/jwt";
import { SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS, getSessionUser } from "../auth/session";

export const authController = {
  async signup(req: Request, res: Response) {
    try {
      const { email, password, name } = req.body || {};

      if (!email || typeof email !== "string" || !email.includes("@")) {
        return res.status(400).json({ error: "Please provide a valid email address." });
      }

      if (!password || typeof password !== "string" || password.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters long." });
      }

      const cleanName = (name && typeof name === "string" ? name.trim() : "") || email.split("@")[0];
      const cleanEmail = email.toLowerCase().trim();

      const existing = await prisma.user.findUnique({
        where: { email: cleanEmail },
      });

      if (existing) {
        return res.status(409).json({ error: "An account with this email already exists." });
      }

      const passwordHash = await hashPassword(password);

      const user = await prisma.user.create({
        data: {
          email: cleanEmail,
          name: cleanName,
          passwordHash,
          settings: {
            create: {
              theme: "vs-dark",
              fontSize: 14,
              tabSize: 2,
              wordWrap: "on",
              minimap: true,
            },
          },
        },
        select: {
          id: true,
          email: true,
          name: true,
          avatar: true,
          createdAt: true,
        },
      });

      const token = await signSessionToken({
        userId: user.id,
        email: user.email,
        name: user.name,
      });

      res.cookie(SESSION_COOKIE_NAME, token, SESSION_COOKIE_OPTIONS);

      return res.status(201).json({
        success: true,
        user,
        token,
        message: "Account created successfully.",
      });
    } catch (error) {
      console.error("Signup error:", error);
      return res.status(500).json({ error: "An error occurred during account creation." });
    }
  },

  async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body || {};

      if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required." });
      }

      const cleanEmail = String(email).toLowerCase().trim();

      const user = await prisma.user.findUnique({
        where: { email: cleanEmail },
        include: { settings: true },
      });

      if (!user) {
        return res.status(401).json({ error: "Invalid email or password." });
      }

      const isValid = await verifyPassword(String(password), user.passwordHash);
      if (!isValid) {
        return res.status(401).json({ error: "Invalid email or password." });
      }

      const token = await signSessionToken({
        userId: user.id,
        email: user.email,
        name: user.name,
      });

      const userProfile = {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        createdAt: user.createdAt,
        settings: user.settings,
      };

      res.cookie(SESSION_COOKIE_NAME, token, SESSION_COOKIE_OPTIONS);

      return res.json({
        success: true,
        user: userProfile,
        token,
        message: "Logged in successfully.",
      });
    } catch (error) {
      console.error("Login error:", error);
      return res.status(500).json({ error: "An error occurred during sign in." });
    }
  },

  logout(_req: Request, res: Response) {
    res.clearCookie(SESSION_COOKIE_NAME, {
      ...SESSION_COOKIE_OPTIONS,
      maxAge: 0,
    });
    return res.json({
      success: true,
      message: "Logged out successfully.",
    });
  },

  async getMe(req: Request, res: Response) {
    const user = await getSessionUser(req);

    if (!user) {
      return res.status(401).json({ authenticated: false, user: null });
    }

    return res.json({
      authenticated: true,
      user,
    });
  },
};

