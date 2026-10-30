import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import ProjectWorkspace from "@/components/workspace/ProjectWorkspace";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Workspace",
};

interface ProjectPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}

export default async function ProjectPage({
  params,
  searchParams,
}: ProjectPageProps) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const project = await prisma.project.findFirst({
    where: { id, userId: user.id },
    select: { id: true, name: true },
  });

  if (!project) notFound();

  return (
    <ProjectWorkspace
      projectId={project.id}
      projectName={project.name}
      initialTab={query.tab === "editor" ? "editor" : "terminal"}
    />
  );
}
