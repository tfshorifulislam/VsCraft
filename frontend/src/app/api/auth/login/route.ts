import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { verifyPassword } from "@/lib/auth";
import { describeAuthError } from "@/lib/auth-errors";
import { AUTH_COOKIE, SESSION_MAX_AGE, signSessionToken } from "@/lib/jwt";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    const token = await signSessionToken(user.id, user.email);
    const response = NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name },
    });
    response.cookies.set(AUTH_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });
    return response;
  } catch (error) {
    console.error("[login]", error);
    const { status, message } = describeAuthError(error, "Could not sign you in.");
    return NextResponse.json({ error: message }, { status });
  }
}
