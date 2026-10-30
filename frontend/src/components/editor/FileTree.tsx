"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileCode2,
  FileText,
  Folder,
  FolderOpen,
} from "lucide-react";
import type { TreeNode } from "@/lib/fileTree";

interface FileTreeProps {
  nodes: TreeNode[];
  selectedPath: string | null;
  onSelect: (file: TreeNode) => void;
}

function TreeRow({
  node,
  depth,
  selectedPath,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  selectedPath: string | null;
  onSelect: (file: TreeNode) => void;
}) {
  const [open, setOpen] = useState(true);

  if (node.type === "folder") {
    return (
      <div>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-[13px] text-[#cccccc] transition hover:bg-[#2a2d2e]"
          style={{ paddingLeft: depth * 12 + 6 }}
        >
          {open ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#8a8a8a]" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#8a8a8a]" />
          )}
          {open ? (
            <FolderOpen className="h-3.5 w-3.5 shrink-0 text-[#dcb67a]" />
          ) : (
            <Folder className="h-3.5 w-3.5 shrink-0 text-[#dcb67a]" />
          )}
          <span className="truncate">{node.name}</span>
        </button>
        {open && (
          <div>
            {node.children.map((child) => (
              <TreeRow
                key={child.path}
                node={child}
                depth={depth + 1}
                selectedPath={selectedPath}
                onSelect={onSelect}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const isCode = /\.(tsx?|jsx?|mjs|cjs)$/.test(node.name);
  const selected = selectedPath === node.path;

  return (
    <button
      type="button"
      onClick={() => onSelect(node)}
      className={`flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-[13px] transition ${
        selected
          ? "bg-[#37373d] text-white"
          : "text-[#cccccc] hover:bg-[#2a2d2e]"
      }`}
      style={{ paddingLeft: depth * 12 + 24 }}
    >
      {isCode ? (
        <FileCode2 className="h-3.5 w-3.5 shrink-0 text-[#519aba]" />
      ) : (
        <FileText className="h-3.5 w-3.5 shrink-0 text-[#8a8a8a]" />
      )}
      <span className="truncate">{node.name}</span>
    </button>
  );
}

export default function FileTree({
  nodes,
  selectedPath,
  onSelect,
}: FileTreeProps) {
  return (
    <div className="py-1">
      {nodes.map((node) => (
        <TreeRow
          key={node.path}
          node={node}
          depth={0}
          selectedPath={selectedPath}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
