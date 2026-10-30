import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const projects = await prisma.project.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { files: true } } },
  });

  return NextResponse.json({
    projects: projects.map((project) => ({
      id: project.id,
      name: project.name,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      filesCount: project._count.files,
    })),
  });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const name = String(body?.name || "").trim() || "Untitled Project";

    const project = await prisma.project.create({
      data: { name, userId: user.id },
      select: { id: true, name: true, createdAt: true, updatedAt: true },
    });

    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    console.error("[projects:create]", error);
    return NextResponse.json({ error: "Could not create project." }, { status: 500 });
  }
}
