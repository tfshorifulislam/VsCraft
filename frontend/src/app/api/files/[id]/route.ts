import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function ownedFile(fileId: string, userId: string) {
  return prisma.projectFile.findFirst({
    where: { id: fileId, project: { userId } },
    select: { id: true, projectId: true, path: true, content: true, updatedAt: true },
  });
}

export async function GET(_request: Request, { params }: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const file = await ownedFile(id, user.id);
  if (!file) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }

  return NextResponse.json({ file });
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const existing = await ownedFile(id, user.id);
  if (!existing) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  if (typeof body?.content !== "string") {
    return NextResponse.json({ error: "Content is required." }, { status: 400 });
  }

  const file = await prisma.projectFile.update({
    where: { id },
    data: { content: body.content },
    select: { id: true, path: true, content: true, updatedAt: true },
  });

  await prisma.project.update({
    where: { id: existing.projectId },
    data: { updatedAt: new Date() },
  });

  return NextResponse.json({ file });
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const existing = await ownedFile(id, user.id);
  if (!existing) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }

  await prisma.projectFile.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
