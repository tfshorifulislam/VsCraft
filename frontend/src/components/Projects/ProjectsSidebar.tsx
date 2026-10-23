"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Code2,
  FolderKanban,
  Clock,
  Star,
  LayoutTemplate,
  Trash2,
  Plus,
  Settings,
  User,
  ArrowLeft,
  LogOut,
  Cloud,
  FilePlus,
  Loader2,
} from "lucide-react";
import { useAuth } from "@/components/Auth/AuthContext";

export type DashboardViewCategory =
  | "all"
  | "recent"
  | "starred"
  | "templates"
  | "trash";

interface ProjectsSidebarProps {
  currentCategory: DashboardViewCategory;
  onSelectCategory: (category: DashboardViewCategory) => void;
  onOpenNewProject: () => void;
  onCreateEmptyProject?: () => void;
  isCreatingEmpty?: boolean;
  counts: {
    all: number;
    recent: number;
    starred: number;
    trash: number;
  };
}

export default function ProjectsSidebar({
  currentCategory,
  onSelectCategory,
  onOpenNewProject,
  onCreateEmptyProject,
  isCreatingEmpty = false,
  counts,
}: ProjectsSidebarProps) {
  const { user, logout } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const navItems = [
    {
      id: "all" as DashboardViewCategory,
      label: "All Projects",
      icon: <FolderKanban className="w-4 h-4" />,
      count: counts.all,
    },
    {
      id: "recent" as DashboardViewCategory,
      label: "Recent",
      icon: <Clock className="w-4 h-4" />,
      count: counts.recent,
    },
    {
      id: "starred" as DashboardViewCategory,
      label: "Starred",
      icon: <Star className="w-4 h-4 text-amber-500 fill-amber-500/20" />,
      count: counts.starred,
    },
    {
      id: "templates" as DashboardViewCategory,
      label: "Templates",
      icon: <LayoutTemplate className="w-4 h-4 text-purple-400" />,
      count: 5,
    },
    {
      id: "trash" as DashboardViewCategory,
      label: "Trash",
      icon: <Trash2 className="w-4 h-4" />,
      count: counts.trash,
    },
  ];

  return (
    <aside className="w-64 bg-[#fbfbfb] border-r border-[#eaeaea] flex flex-col justify-between h-screen select-none shrink-0 font-sans">
      {/* Top Section */}
      <div className="p-4 space-y-4">
        {/* Brand Logo & Back to Marketing Site */}
        <div className="flex items-center justify-between">
          <Link
            href="/"
            title="Back to Landing Page"
            className="flex items-center gap-2.5 group focus-visible:outline-none"
          >
            <div className="w-7 h-7 rounded-lg bg-[var(--color-primary)] flex items-center justify-center text-white shadow-xs group-hover:scale-105 transition-transform">
              <Code2 className="w-4 h-4 stroke-[2.5]" />
            </div>
            <span className="font-bold text-[15px] tracking-tight text-[#171717]">
              Code Editor
            </span>
          </Link>

          <Link
            href="/"
            title="Landing Home"
            className="text-xs text-neutral-400 hover:text-neutral-700 flex items-center gap-1 p-1 rounded hover:bg-neutral-100 transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Home</span>
          </Link>
        </div>

        {/* Primary Project Creation Action Buttons */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={onOpenNewProject}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-sm font-semibold shadow-sm hover:shadow transition-all cursor-pointer group"
          >
            <Plus className="w-4 h-4 transition-transform group-hover:rotate-90" />
            <span>New Project</span>
          </button>

          {onCreateEmptyProject && (
            <button
              type="button"
              onClick={onCreateEmptyProject}
              disabled={isCreatingEmpty}
              className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl border border-[#e5e5e7] hover:border-[var(--color-primary)] bg-white hover:bg-neutral-50 text-neutral-800 hover:text-[var(--color-primary)] text-xs sm:text-sm font-semibold shadow-2xs transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isCreatingEmpty ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--color-primary)]" />
              ) : (
                <FilePlus className="w-3.5 h-3.5 text-[var(--color-primary)]" />
              )}
              <span>Empty Project</span>
            </button>
          )}
        </div>

        {/* Navigation Categories */}
        <nav className="space-y-1 pt-2">
          {navItems.map((item) => {
            const isActive = currentCategory === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectCategory(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition cursor-pointer ${
                  isActive
                    ? "bg-[#ede9fe] text-[var(--color-primary)] font-semibold"
                    : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  {item.icon}
                  <span>{item.label}</span>
                </div>
                {item.count !== undefined && item.count > 0 && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                      isActive
                        ? "bg-[var(--color-primary)] text-white font-bold"
                        : "bg-neutral-200/80 text-neutral-500"
                    }`}
                  >
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom User Profile Section */}
      <div className="p-3 border-t border-[#eaeaea] bg-white relative">
        {user ? (
          <div>
            <div
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center justify-between p-2 rounded-xl hover:bg-neutral-50 transition cursor-pointer"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[var(--color-primary)] to-indigo-600 flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-xs">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-neutral-900 truncate">
                    {user.name}
                  </div>
                  <div className="text-[10px] text-neutral-400 font-mono truncate flex items-center gap-1">
                    <Cloud className="w-2.5 h-2.5 text-emerald-500" />
                    <span>Cloud Connected</span>
                  </div>
                </div>
              </div>
              <Settings className="w-4 h-4 text-neutral-400 hover:text-neutral-700 shrink-0" />
            </div>

            {/* User Popup Dropdown */}
            {showUserMenu && (
              <div className="absolute left-3 right-3 bottom-16 bg-white border border-[#eaeaea] rounded-2xl shadow-xl p-2 text-xs space-y-1 animate-in fade-in zoom-in-95 duration-100 z-50">
                <div className="px-3 py-2 border-b border-[#f0f0f0] mb-1">
                  <p className="font-semibold text-neutral-900 truncate">{user.name}</p>
                  <p className="text-[11px] text-neutral-400 truncate">{user.email}</p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    setShowUserMenu(false);
                    await logout();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-rose-50 text-rose-600 text-left cursor-pointer transition font-medium"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="p-1">
            <Link
              href="/login"
              className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-neutral-100 hover:bg-neutral-200 rounded-lg text-xs font-semibold text-neutral-700 transition"
            >
              <User className="w-3.5 h-3.5" />
              <span>Sign In to Cloud</span>
            </Link>
          </div>
        )}
      </div>
    </aside>
  );
}

