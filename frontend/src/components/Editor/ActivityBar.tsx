"use client";

import React, { type ReactNode } from "react";
import Link from "next/link";
import {
  Files,
  Search,
  GitBranch,
  Settings,
  Code2,
  Sun,
  Moon,
  FolderGit2,
  Bug,
  Blocks,
} from "lucide-react";
import { SidebarView } from "@/types/editor";

interface ActivityBarProps {
  activeView: SidebarView | null;
  onSelectView: (view: SidebarView) => void;
  theme: "vs-dark" | "light";
  onToggleTheme: () => void;
  onOpenProjectModal: () => void;
}

export default function ActivityBar({
  activeView,
  onSelectView,
  theme,
  onToggleTheme,
  onOpenProjectModal,
}: ActivityBarProps) {
  const navItems: { id: SidebarView; label: string; icon: ReactNode; shortcut: string }[] = [
    {
      id: "explorer",
      label: "Explorer",
      icon: <Files className="w-5 h-5 stroke-[1.75]" />,
      shortcut: "Ctrl+Shift+E",
    },
    {
      id: "search",
      label: "Search",
      icon: <Search className="w-5 h-5 stroke-[1.75]" />,
      shortcut: "Ctrl+Shift+F",
    },
    {
      id: "git",
      label: "Source Control",
      icon: <GitBranch className="w-5 h-5 stroke-[1.75]" />,
      shortcut: "Ctrl+Shift+G",
    },
    {
      id: "debug",
      label: "Run and Debug",
      icon: <Bug className="w-5 h-5 stroke-[1.75]" />,
      shortcut: "Ctrl+Shift+D",
    },
    {
      id: "extensions",
      label: "Extensions",
      icon: <Blocks className="w-5 h-5 stroke-[1.75]" />,
      shortcut: "Ctrl+Shift+X",
    },
    {
      id: "settings",
      label: "Preferences",
      icon: <Settings className="w-5 h-5 stroke-[1.75]" />,
      shortcut: "Ctrl+,",
    },
  ];

  return (
    <aside className="w-12 bg-[#181818] border-r border-[#2b2b2b] flex flex-col justify-between items-center py-2 select-none z-30 shrink-0">
      {/* Top Section */}
      <div className="flex flex-col items-center gap-1 w-full">
        {/* Brand Home / Projects Dashboard Icon */}
        <Link
          href="/projects"
          title="Back to Projects Dashboard"
          className="w-10 h-10 rounded-lg flex items-center justify-center text-white hover:bg-[#2a2a2a] mb-2 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-primary)]"
        >
          <div className="w-6 h-6 rounded bg-[var(--color-primary)] flex items-center justify-center text-white">
            <Code2 className="w-4 h-4 stroke-[2.5]" />
          </div>
        </Link>

        {/* Primary View Icons */}
        {navItems.map((item) => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectView(item.id)}
              title={`${item.label} (${item.shortcut})`}
              className={`relative w-12 h-11 flex items-center justify-center transition-colors cursor-pointer group focus-visible:outline-none ${
                isActive
                  ? "text-white"
                  : "text-neutral-400 hover:text-neutral-200 hover:bg-[#252525]/60"
              }`}
            >
              {isActive && (
                <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 bg-[var(--color-primary)] rounded-r" />
              )}
              {item.icon}
            </button>
          );
        })}
      </div>

      {/* Bottom Section */}
      <div className="flex flex-col items-center gap-1 w-full">
        {/* Projects / Template Switcher */}
        <button
          type="button"
          onClick={onOpenProjectModal}
          title="Switch / New Project"
          className="w-12 h-10 flex items-center justify-center text-neutral-400 hover:text-white hover:bg-[#252525]/60 transition cursor-pointer"
        >
          <FolderGit2 className="w-4 h-4" />
        </button>

        {/* Theme Toggle */}
        <button
          type="button"
          onClick={onToggleTheme}
          title={`Switch to ${theme === "vs-dark" ? "Light" : "Dark"} theme`}
          className="w-12 h-10 flex items-center justify-center text-neutral-400 hover:text-white hover:bg-[#252525]/60 transition cursor-pointer"
        >
          {theme === "vs-dark" ? (
            <Sun className="w-4 h-4" />
          ) : (
            <Moon className="w-4 h-4" />
          )}
        </button>
      </div>
    </aside>
  );
}

