"use client";

import React, { useState, type ReactNode, type KeyboardEvent } from "react";
import { Search, FileCode } from "lucide-react";
import { Project } from "@/types/editor";

export interface CommandItem {
  id: string;
  title: string;
  category: string;
  icon: ReactNode;
  shortcut?: string;
  action: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  onSelectFile: (fileId: string) => void;
  commands: CommandItem[];
}

export default function CommandPalette({
  isOpen,
  onClose,
  project,
  onSelectFile,
  commands,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  if (!isOpen) return null;

  // Filter commands and matching files
  const filteredCommands = commands.filter((c) =>
    `${c.category} ${c.title}`.toLowerCase().includes(query.toLowerCase())
  );

  const matchingFiles: CommandItem[] = project.files
    .filter((f) => !f.isFolder && f.name.toLowerCase().includes(query.toLowerCase()))
    .map((file) => ({
      id: `file-${file.id}`,
      title: file.path,
      category: "Go to File",
      icon: <FileCode className="w-4 h-4 text-cyan-400" />,
      action: () => onSelectFile(file.id),
    }));

  const combinedItems = query.startsWith(">")
    ? filteredCommands
    : [...matchingFiles, ...filteredCommands];

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(combinedItems.length, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + combinedItems.length) % Math.max(combinedItems.length, 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (combinedItems[selectedIndex]) {
        combinedItems[selectedIndex].action();
        onClose();
      }
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-start justify-center pt-16 px-4 animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl bg-[#252526] border border-[#3c3c3c] rounded-xl shadow-2xl overflow-hidden flex flex-col font-sans select-none"
      >
        {/* Search Input Bar */}
        <div className="h-11 px-3 border-b border-[#333333] flex items-center gap-2 bg-[#1e1e1e]">
          <Search className="w-4 h-4 text-neutral-400 shrink-0" />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or file name (e.g. 'save', 'App.tsx')..."
            className="w-full bg-transparent text-sm text-white placeholder-neutral-500 outline-none"
          />
          <kbd className="text-[10px] bg-neutral-800 border border-neutral-700 px-1.5 py-0.5 rounded text-neutral-400">
            Esc
          </kbd>
        </div>

        {/* Results List */}
        <div className="max-h-72 overflow-y-auto p-1.5 space-y-0.5">
          {combinedItems.length === 0 ? (
            <div className="p-4 text-center text-xs text-neutral-500">
              No matching commands or files found.
            </div>
          ) : (
            combinedItems.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={item.id}
                  onClick={() => {
                    item.action();
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs cursor-pointer transition ${
                    isSelected
                      ? "bg-[var(--color-primary)] text-white"
                      : "text-neutral-300 hover:bg-[#2d2d2d] hover:text-white"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="shrink-0">{item.icon}</span>
                    <span className="truncate">{item.title}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded shrink-0 ${
                        isSelected ? "bg-black/20 text-white" : "bg-[#1e1e1e] text-neutral-400"
                      }`}
                    >
                      {item.category}
                    </span>
                  </div>

                  {item.shortcut && (
                    <kbd
                      className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
                        isSelected ? "bg-black/30 text-white" : "bg-neutral-800 text-neutral-400 border border-neutral-700"
                      }`}
                    >
                      {item.shortcut}
                    </kbd>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
