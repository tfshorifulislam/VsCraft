"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Clock,
  Star,
  LayoutTemplate,
  Trash2,
  Plus,
  User,
  ArrowLeft,
  LogOut,
  Cloud,
  FilePlus,
  Loader2,
  ChevronDown,
  Layers,
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
      icon: <Layers className="w-4 h-4" />,
      count: counts.all,
    },
    {
      id: "recent" as DashboardViewCategory,
      label: "Recents",
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
      icon: <LayoutTemplate className="w-4 h-4 text-blue-500" />,
      count: 5,
    },
    {
      id: "trash" as DashboardViewCategory,
      label: "Trash",
      icon: <Trash2 className="w-4 h-4 text-neutral-500" />,
      count: counts.trash,
    },
  ];

  return (
    <aside className="w-60 bg-[#fafafa] border-r border-[#e5e7eb] flex flex-col justify-between h-screen select-none shrink-0 font-sans text-neutral-800">
      {/* Top Section */}
      <div className="p-3 space-y-3">
        {/* Workspace Switcher / Brand Header */}
        <div className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-[#f0f0f0] transition group">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-6 h-6 rounded-md bg-[#0d99ff] flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-2xs">
              {user?.name ? user.name.charAt(0).toUpperCase() : "C"}
            </div>
            <div className="min-w-0">
              <span className="font-semibold text-xs tracking-tight text-neutral-900 truncate block">
                {user?.name ? `${user.name}'s Workspace` : "Code Editor"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1 text-neutral-400">
            <Link
              href="/"
              title="Back to Landing Page"
              className="p-1 rounded hover:bg-neutral-200/60 hover:text-neutral-700 transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* Primary Project Creation Action Buttons */}
        <div className="space-y-1.5 pt-1">
          <button
            type="button"
            onClick={onOpenNewProject}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-[#0d99ff] hover:bg-[#0b87e3] text-white text-xs font-semibold shadow-xs transition-all cursor-pointer group"
          >
            <Plus className="w-3.5 h-3.5 transition-transform group-hover:rotate-90" />
            <span>New Project</span>
          </button>

          {onCreateEmptyProject && (
            <button
              type="button"
              onClick={onCreateEmptyProject}
              disabled={isCreatingEmpty}
              className="w-full flex items-center justify-center gap-2 py-1.5 px-3 rounded-lg border border-[#e5e7eb] hover:border-neutral-300 bg-white hover:bg-neutral-50 text-neutral-800 text-xs font-medium shadow-2xs transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isCreatingEmpty ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#0d99ff]" />
              ) : (
                <FilePlus className="w-3.5 h-3.5 text-neutral-500" />
              )}
              <span>Empty Project</span>
            </button>
          )}
        </div>

        {/* Navigation Categories */}
        <nav className="space-y-0.5 pt-2">
          {navItems.map((item) => {
            const isActive = currentCategory === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectCategory(item.id)}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-medium transition cursor-pointer ${
                  isActive
                    ? "bg-[#e5e7eb]/80 text-neutral-900 font-semibold"
                    : "text-neutral-700 hover:bg-[#f0f0f0] hover:text-neutral-900"
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
                        ? "bg-neutral-900 text-white font-bold"
                        : "bg-neutral-200/80 text-neutral-600"
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
      <div className="p-2.5 border-t border-[#e5e7eb] bg-white relative">
        {user ? (
          <div>
            <div
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center justify-between p-1.5 rounded-lg hover:bg-neutral-100/70 transition cursor-pointer"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-full bg-neutral-800 flex items-center justify-center text-white text-xs font-semibold shrink-0 shadow-2xs">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 text-left">
                  <div className="text-xs font-semibold text-neutral-900 truncate leading-tight">
                    {user.name}
                  </div>
                  <div className="text-[10px] text-neutral-500 font-mono truncate flex items-center gap-1">
                    <Cloud className="w-2.5 h-2.5 text-emerald-500 shrink-0" />
                    <span>Cloud Sync</span>
                  </div>
                </div>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
            </div>

            {/* User Popup Dropdown */}
            {showUserMenu && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowUserMenu(false)}
                />
                <div className="absolute left-2.5 right-2.5 bottom-14 bg-white border border-[#e5e7eb] rounded-xl shadow-lg p-1.5 text-xs space-y-1 animate-in fade-in zoom-in-95 duration-100 z-50">
                  <div className="px-2.5 py-1.5 border-b border-[#f0f0f0] mb-1">
                    <p className="font-semibold text-neutral-900 truncate">{user.name}</p>
                    <p className="text-[11px] text-neutral-500 truncate">{user.email}</p>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      setShowUserMenu(false);
                      await logout();
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-rose-50 text-rose-600 text-left cursor-pointer transition font-medium"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="p-1">
            <Link
              href="/login"
              className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 bg-neutral-100 hover:bg-neutral-200 rounded-lg text-xs font-semibold text-neutral-700 transition"
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
