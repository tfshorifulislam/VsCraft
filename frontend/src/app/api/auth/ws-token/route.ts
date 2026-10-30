import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { signSessionToken } from "@/lib/jwt";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Short-lived token passed to the realtime server via the WebSocket URL.
  const token = await signSessionToken(user.id, user.email, "5m");
  return NextResponse.json({ token });
}
