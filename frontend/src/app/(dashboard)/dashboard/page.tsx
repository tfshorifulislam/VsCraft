import type { Metadata } from "next";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import NewProjectButton from "@/components/dashboard/NewProjectButton";
import ProjectCard from "@/components/dashboard/ProjectCard";
import LogoutButton from "@/components/dashboard/LogoutButton";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const projects = await prisma.project.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { files: true } } },
  });

  const initial = user.name.charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-[#f5f5f5]">
      <header className="sticky top-0 z-20 border-b border-[#e6e6e6] bg-[#f5f5f5]/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-black text-sm font-bold text-white">
              CF
            </span>
            <span className="text-base font-semibold tracking-tight text-[#1e1e1e]">
              CodeFigma
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-full border border-[#e6e6e6] bg-white py-1 pl-1 pr-3 sm:flex">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#0d99ff] text-xs font-semibold text-white">
                {initial}
              </span>
              <span className="max-w-[160px] truncate text-xs font-medium text-[#3c3c3c]">
                {user.name}
              </span>
            </div>
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[#1e1e1e]">
              Your projects
            </h1>
            <p className="mt-1 text-sm text-[#6b6b6b]">
              Open a project to launch its terminal, or start something new.
            </p>
          </div>
          <NewProjectButton />
        </div>

        {projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-[#e6e6e6] bg-white py-20 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f0f0f0] text-[#6b6b6b]">
              <span className="text-xl font-bold">+</span>
            </div>
            <h2 className="mt-4 text-base font-semibold text-[#1e1e1e]">
              No projects yet
            </h2>
            <p className="mt-1 max-w-sm text-sm text-[#6b6b6b]">
              Create your first project to open a real terminal and start coding
              in the browser.
            </p>
            <div className="mt-6">
              <NewProjectButton />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <NewProjectButton variant="tile" />
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={{
                  id: project.id,
                  name: project.name,
                  updatedAt: project.updatedAt,
                  filesCount: project._count.files,
                }}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
