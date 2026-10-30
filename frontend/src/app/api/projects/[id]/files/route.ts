import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { sanitizeProjectPath } from "@/lib/paths";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function ownedProject(projectId: string, userId: string) {
  return prisma.project.findFirst({
    where: { id: projectId, userId },
    select: { id: true },
  });
}

export async function GET(_request: Request, { params }: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const project = await ownedProject(id, user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const files = await prisma.projectFile.findMany({
    where: { projectId: id },
    orderBy: { path: "asc" },
    select: { id: true, path: true, content: true, updatedAt: true },
  });

  return NextResponse.json({ files });
}

export async function POST(request: Request, { params }: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const project = await ownedProject(id, user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  try {
    const body = await request.json();
    const path = sanitizeProjectPath(String(body?.path || ""));
    const content = String(body?.content ?? "");

    const file = await prisma.projectFile.upsert({
      where: { projectId_path: { projectId: id, path } },
      create: { projectId: id, path, content },
      update: { content },
      select: { id: true, path: true, content: true, updatedAt: true },
    });

    await prisma.project.update({
      where: { id },
      data: { updatedAt: new Date() },
    });

    return NextResponse.json({ file }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not create file.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
