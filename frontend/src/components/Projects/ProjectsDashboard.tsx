"use client";

import React, { useState, useEffect, useMemo, useCallback, type ReactNode, type MouseEvent, type FormEvent } from "react";
import ProjectsSidebar, { DashboardViewCategory } from "./ProjectsSidebar";
import ProjectsHeader from "./ProjectsHeader";
import ProjectCard from "./ProjectCard";
import NewProjectDialog from "./NewProjectDialog";
import ImportProjectDialog from "./ImportProjectDialog";
import FolderImportOverlay from "./FolderImportOverlay";
import ProjectEmptyState from "./ProjectEmptyState";
import { Project, ProjectTemplate } from "@/types/editor";
import { cloudApi } from "@/lib/cloud/cloudApi";
import {
  importFolderSelection,
  pickLocalFolder,
  type FolderImportProgress,
} from "@/lib/import/localFolderImport";
import { useAuth } from "@/components/Auth/AuthContext";
import {
  Trash2,
  FileCode,
  Globe,
  Layers,
  Server,
  FilePlus2,
  Loader2,
  AlertCircle,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { useRouter } from "next/navigation";

export default function ProjectsDashboard() {
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuth();

  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [currentCategory, setCurrentCategory] = useState<DashboardViewCategory>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [filterType, setFilterType] = useState("all");
  const [sortBy, setSortBy] = useState<"modified" | "name" | "created">("modified");
  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false);
  const [isImportProjectOpen, setIsImportProjectOpen] = useState(false);
  const [isImportingProject, setIsImportingProject] = useState(false);
  const [folderImportProgress, setFolderImportProgress] =
    useState<FolderImportProgress | null>(null);
  const [folderImportError, setFolderImportError] = useState<string | null>(null);

  // Rename modal state
  const [renamingProject, setRenamingProject] = useState<{ id: string; name: string } | null>(null);

  const fetchCloudProjects = useCallback(() => {
    setIsLoading(true);
    setLoadError(null);
    cloudApi.projects
      .list("all")
      .then((data) => {
        setProjects(data);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.message === "UNAUTHORIZED") {
          router.push("/login?from=/projects");
          return;
        }
        setLoadError(err instanceof Error ? err.message : "Failed to load cloud projects.");
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [router]);

  useEffect(() => {
    let isCancelled = false;
    if (!isAuthLoading) {
      if (!user) {
        router.push("/login?from=/projects");
      } else {
        cloudApi.projects
          .list("all")
          .then((data) => {
            if (!isCancelled) {
              setProjects(data);
              setIsLoading(false);
            }
          })
          .catch((err: unknown) => {
            if (!isCancelled) {
              if (err instanceof Error && err.message === "UNAUTHORIZED") {
                router.push("/login?from=/projects");
                return;
              }
              setLoadError(err instanceof Error ? err.message : "Failed to load cloud projects.");
              setIsLoading(false);
            }
          });
      }
    }
    return () => {
      isCancelled = true;
    };
  }, [user, isAuthLoading, router]);

  // Badge counts
  const counts = useMemo(() => {
    const activeProjects = projects.filter((p) => !p.isTrash);
    const trashedProjects = projects.filter((p) => p.isTrash);
    const starredProjects = activeProjects.filter((p) => p.starred);
    const recentProjects = [...activeProjects].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 4);

    return {
      all: activeProjects.length,
      recent: recentProjects.length,
      starred: starredProjects.length,
      trash: trashedProjects.length,
    };
  }, [projects]);

  // Filtered & Sorted Projects
  const filteredProjects = useMemo(() => {
    let list = [...projects];

    if (currentCategory === "trash") {
      list = list.filter((p) => p.isTrash);
    } else {
      list = list.filter((p) => !p.isTrash);

      if (currentCategory === "starred") {
        list = list.filter((p) => p.starred);
      } else if (currentCategory === "recent") {
        list = list.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8);
      }
    }

    // Filter by type
    if (filterType !== "all") {
      list = list.filter((p) => p.template === filterType);
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.template.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q)
      );
    }

    // Sorting
    list.sort((a, b) => {
      if (sortBy === "name") {
        return a.name.localeCompare(b.name);
      } else if (sortBy === "created") {
        return b.createdAt - a.createdAt;
      } else {
        return b.updatedAt - a.updatedAt;
      }
    });

    return list;
  }, [projects, currentCategory, filterType, searchQuery, sortBy]);

  // Project action handlers
  const handleStarToggle = async (id: string, e: MouseEvent) => {
    e.stopPropagation();
    const target = projects.find((p) => p.id === id);
    if (!target) return;

    const nextStarred = !target.starred;
    setProjects((prev) =>
      prev.map((p) => (p.id === id ? { ...p, starred: nextStarred } : p))
    );

    try {
      await cloudApi.projects.update(id, { starred: nextStarred });
    } catch {
      // Revert on error
      setProjects((prev) =>
        prev.map((p) => (p.id === id ? { ...p, starred: target.starred } : p))
      );
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      const dup = await cloudApi.projects.duplicate(id);
      setProjects((prev) => [dup, ...prev]);
    } catch (err) {
      console.error("Duplicate error:", err);
      alert("Failed to duplicate project in cloud.");
    }
  };

  const handleRenameSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!renamingProject || !renamingProject.name.trim()) return;

    const { id, name } = renamingProject;
    setRenamingProject(null);

    setProjects((prev) =>
      prev.map((p) => (p.id === id ? { ...p, name: name.trim() } : p))
    );

    try {
      await cloudApi.projects.update(id, { name: name.trim() });
    } catch {
      fetchCloudProjects();
    }
  };

  const handleTrash = async (id: string) => {
    setProjects((prev) =>
      prev.map((p) => (p.id === id ? { ...p, isTrash: true } : p))
    );
    try {
      await cloudApi.projects.delete(id, false);
    } catch {
      fetchCloudProjects();
    }
  };

  const handleRestore = async (id: string) => {
    setProjects((prev) =>
      prev.map((p) => (p.id === id ? { ...p, isTrash: false } : p))
    );
    try {
      await cloudApi.projects.update(id, { isTrash: false });
    } catch {
      fetchCloudProjects();
    }
  };

  const handleDeletePermanent = async (id: string) => {
    const confirmed = window.confirm("Permanently delete this project? This cannot be undone.");
    if (!confirmed) return;

    setProjects((prev) => prev.filter((p) => p.id !== id));
    try {
      await cloudApi.projects.delete(id, true);
    } catch {
      fetchCloudProjects();
    }
  };

  const handleEmptyTrash = async () => {
    const confirmed = window.confirm("Empty the entire trash bin? All trashed projects will be permanently deleted.");
    if (!confirmed) return;

    setProjects((prev) => prev.filter((p) => !p.isTrash));
    try {
      await cloudApi.projects.emptyTrash();
    } catch {
      fetchCloudProjects();
    }
  };

  const [isCreatingEmpty, setIsCreatingEmpty] = useState(false);

  const handleCreateEmptyProject = async () => {
    if (isCreatingEmpty) return;
    try {
      setIsCreatingEmpty(true);
      const emptyProj = await cloudApi.projects.create({
        type: "blank",
        blankSubtype: "empty",
        name: "Empty Project",
        description: "Empty workspace ready for custom files",
      });
      router.push(`/editor/${emptyProj.id}`);
    } catch (err) {
      console.error("Create empty project error:", err);
      alert("Failed to create empty project in cloud.");
      setIsCreatingEmpty(false);
    }
  };

  const handleCreateFromTemplate = async (template: ProjectTemplate) => {
    try {
      setIsLoading(true);
      const newProj = await cloudApi.projects.create(template);
      router.push(`/editor/${newProj.id}`);
    } catch (err) {
      console.error("Create template error:", err);
      alert("Failed to create project in cloud.");
      setIsLoading(false);
    }
  };

  const handleImportFolder = async () => {
    if (isImportingProject) return;

    setIsImportingProject(true);
    setFolderImportError(null);

    try {
      const selection = await pickLocalFolder(setFolderImportProgress);
      if (!selection) {
        setFolderImportProgress(null);
        return;
      }

      const result = await importFolderSelection(selection, setFolderImportProgress);
      setFolderImportProgress((current) =>
        current
          ? {
              ...current,
              phase: "done",
              message: `Imported ${result.fileCount} files. Opening editor...`,
            }
          : current
      );
      router.push(`/editor/${result.projectId}`);
    } catch (err) {
      console.error("Folder import error:", err);
      setFolderImportProgress(null);
      setFolderImportError(
        err instanceof Error ? err.message : "Failed to import the selected folder."
      );
    } finally {
      setIsImportingProject(false);
    }
  };

  const handleExport = (project: Project) => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(project, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `${project.name.toLowerCase().replace(/\s+/g, "-")}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const templateShowcase: {
    id: ProjectTemplate;
    title: string;
    desc: string;
    icon: ReactNode;
    tag: string;
  }[] = [
    {
      id: "react-ts",
      title: "React + TypeScript",
      desc: "Fast Vite template with TSX components",
      icon: <FileCode className="w-4 h-4 text-cyan-500" />,
      tag: "Popular",
    },
    {
      id: "vanilla-web",
      title: "HTML5 / CSS / JS",
      desc: "Instant live preview web canvas",
      icon: <Globe className="w-4 h-4 text-amber-500" />,
      tag: "Fast",
    },
    {
      id: "next-app",
      title: "Next.js Web App",
      desc: "App Router structure & layout",
      icon: <Layers className="w-4 h-4 text-neutral-800" />,
      tag: "Full-Stack",
    },
    {
      id: "node-api",
      title: "Node.js REST API",
      desc: "Express server & test scripts",
      icon: <Server className="w-4 h-4 text-emerald-500" />,
      tag: "Backend",
    },
    {
      id: "blank",
      title: "Blank Project",
      desc: "Minimal clean project scratchpad",
      icon: <FilePlus2 className="w-4 h-4 text-blue-500" />,
      tag: "Blank",
    },
  ];

  return (
    <div
      className="flex h-screen w-screen overflow-hidden bg-white text-neutral-900 antialiased select-none font-sans"
      style={{ fontFamily: "var(--font-inter), var(--font-sans), sans-serif" }}
    >
      {/* Figma-Inspired Left Sidebar */}
      <ProjectsSidebar
        currentCategory={currentCategory}
        onSelectCategory={setCurrentCategory}
        onOpenNewProject={() => setIsNewProjectOpen(true)}
        onCreateEmptyProject={handleCreateEmptyProject}
        isCreatingEmpty={isCreatingEmpty}
        counts={counts}
      />

      {/* Main Figma File Browser Area */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-white">
        {/* Top Figma Header & Action Bar */}
        <ProjectsHeader
          category={currentCategory}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          viewMode={viewMode}
          onToggleViewMode={setViewMode}
          filterType={filterType}
          onFilterChange={setFilterType}
          sortBy={sortBy}
          onSortChange={setSortBy}
          onOpenNewProject={() => setIsNewProjectOpen(true)}
          onCreateEmptyProject={handleCreateEmptyProject}
          isCreatingEmpty={isCreatingEmpty}
          onOpenImportProject={handleImportFolder}
          onOpenArchiveImport={() => setIsImportProjectOpen(true)}
          isImportingProject={isImportingProject}
          projectCount={filteredProjects.length}
        />

        {/* Scrollable File Browser Canvas */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 bg-[#fafafa]/50">
          {/* Trash Alert Banner */}
          {currentCategory === "trash" && counts.trash > 0 && (
            <div className="p-3 bg-rose-50 border border-rose-200/80 rounded-lg flex items-center justify-between text-xs text-rose-800">
              <div className="flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-rose-600 shrink-0" />
                <span>Items in trash are stored safely until permanently removed.</span>
              </div>
              <button
                type="button"
                onClick={handleEmptyTrash}
                className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-md text-xs font-medium transition cursor-pointer"
              >
                Empty Trash
              </button>
            </div>
          )}

          {/* Loading Skeletons */}
          {isLoading && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs text-neutral-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#0d99ff]" />
                <span>Loading projects...</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {[1, 2, 3, 4, 5].map((n) => (
                  <div key={n} className="border border-[#e5e7eb] rounded-xl overflow-hidden bg-white animate-pulse">
                    <div className="h-[155px] bg-neutral-200/60" />
                    <div className="p-3 space-y-2">
                      <div className="h-3.5 bg-neutral-200/80 rounded w-2/3" />
                      <div className="h-2.5 bg-neutral-200/50 rounded w-1/3" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error Banner */}
          {loadError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-center justify-between text-xs text-rose-700">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{loadError}</span>
              </div>
              <button
                type="button"
                onClick={fetchCloudProjects}
                className="flex items-center gap-1.5 px-2.5 py-1 bg-white border border-rose-200 rounded hover:bg-rose-100/50 transition font-medium cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Retry</span>
              </button>
            </div>
          )}

          {/* Templates Gallery (Shown when in 'templates' view) */}
          {currentCategory === "templates" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#0d99ff]" />
                  <h2 className="text-xs font-semibold text-neutral-900 uppercase tracking-wider">
                    Starter Templates
                  </h2>
                </div>
                <span className="text-xs text-neutral-400">Click any template to launch</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3.5">
                {templateShowcase.map((tpl) => (
                  <div
                    key={tpl.id}
                    onClick={() => handleCreateFromTemplate(tpl.id)}
                    className="p-3.5 bg-white hover:bg-white border border-[#e5e7eb] hover:border-[#0d99ff]/50 rounded-xl transition-all duration-150 cursor-pointer shadow-2xs hover:shadow-sm space-y-2.5 group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="w-7 h-7 rounded-lg bg-neutral-100 border border-neutral-200/60 flex items-center justify-center group-hover:scale-105 transition-transform">
                        {tpl.icon}
                      </div>
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-700 border border-neutral-200">
                        {tpl.tag}
                      </span>
                    </div>
                    <div>
                      <h3 className="text-xs font-semibold text-neutral-900 group-hover:text-[#0d99ff] transition-colors truncate">
                        {tpl.title}
                      </h3>
                      <p className="text-[11px] text-neutral-500 mt-0.5 line-clamp-1">{tpl.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {!isLoading && filteredProjects.length === 0 && currentCategory !== "templates" && (
            <ProjectEmptyState
              category={currentCategory}
              isSearchActive={Boolean(searchQuery.trim())}
              onOpenNewProject={() => setIsNewProjectOpen(true)}
              onCreateEmptyProject={handleCreateEmptyProject}
              isCreatingEmpty={isCreatingEmpty}
              onClearSearch={() => setSearchQuery("")}
            />
          )}

          {/* Projects Canvas: Grid View (Figma-Style Responsive Grid) */}
          {!isLoading && filteredProjects.length > 0 && viewMode === "grid" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {filteredProjects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  viewMode="grid"
                  isTrashView={currentCategory === "trash"}
                  onStarToggle={handleStarToggle}
                  onDuplicate={handleDuplicate}
                  onRename={(id, name) => setRenamingProject({ id, name })}
                  onTrash={handleTrash}
                  onRestore={handleRestore}
                  onDeletePermanent={handleDeletePermanent}
                  onExport={handleExport}
                />
              ))}
            </div>
          )}

          {/* Projects Canvas: List View */}
          {!isLoading && filteredProjects.length > 0 && viewMode === "list" && (
            <div className="space-y-1.5">
              {filteredProjects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  viewMode="list"
                  isTrashView={currentCategory === "trash"}
                  onStarToggle={handleStarToggle}
                  onDuplicate={handleDuplicate}
                  onRename={(id, name) => setRenamingProject({ id, name })}
                  onTrash={handleTrash}
                  onRestore={handleRestore}
                  onDeletePermanent={handleDeletePermanent}
                  onExport={handleExport}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* New Project Modal Picker */}
      <NewProjectDialog
        isOpen={isNewProjectOpen}
        onClose={() => setIsNewProjectOpen(false)}
        onCreated={(id) => {
          fetchCloudProjects();
          router.push(`/editor/${id}`);
        }}
      />

      {/* Import ZIP Archive Modal */}
      <ImportProjectDialog
        isOpen={isImportProjectOpen}
        onClose={() => setIsImportProjectOpen(false)}
        onImported={(id) => {
          setIsImportProjectOpen(false);
          fetchCloudProjects();
          router.push(`/editor/${id}`);
        }}
      />

      <FolderImportOverlay
        progress={folderImportProgress}
        error={folderImportError}
        onDismissError={() => setFolderImportError(null)}
      />

      {/* Rename Project Modal */}
      {renamingProject && (
        <div
          onClick={() => setRenamingProject(null)}
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-white border border-[#e5e7eb] rounded-xl shadow-xl p-4 space-y-3.5"
          >
            <h3 className="text-xs font-semibold text-neutral-900">Rename Project</h3>
            <form onSubmit={handleRenameSubmit} className="space-y-3">
              <input
                type="text"
                autoFocus
                value={renamingProject.name}
                onChange={(e) =>
                  setRenamingProject({ ...renamingProject, name: e.target.value })
                }
                className="w-full bg-[#f9fafb] border border-[#e5e7eb] focus:border-[#0d99ff] focus:bg-white rounded-lg px-2.5 py-1.5 text-xs text-neutral-900 outline-none transition"
              />
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setRenamingProject(null)}
                  className="px-2.5 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-100 rounded-md transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-[#0d99ff] hover:bg-[#0b87e3] text-white text-xs font-semibold rounded-md shadow-2xs transition cursor-pointer"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
