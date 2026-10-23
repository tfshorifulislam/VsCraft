"use client";

import React, { useState } from "react";
import {
  Play,
  Bug,
  ChevronRight,
  ChevronDown,
  CircleDot,
} from "lucide-react";
import { Project } from "@/types/editor";

interface DebugPanelProps {
  project: Project;
  onExecuteCommand: (command: string) => void;
}

export default function DebugPanel({
  project,
  onExecuteCommand,
}: DebugPanelProps) {
  const [config, setConfig] = useState(() => {
    switch (project.template) {
      case "python":
        return "Python: Current File (main.py)";
      case "cpp":
        return "C/C++: Build & Debug (make run)";
      case "go":
        return "Go: Launch Service (go run main.go)";
      case "rust":
        return "Rust: Cargo Run";
      case "node-api":
        return "Node.js: Launch Program (server.js)";
      default:
        return "Web: Dev Server (npm run dev)";
    }
  });

  const [expandedSections, setExpandedSections] = useState({
    variables: true,
    watch: false,
    callstack: true,
    breakpoints: false,
  });

  const toggleSection = (key: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleStartDebug = () => {
    let cmd = "npm run dev";
    if (config.includes("python") || config.includes("Python")) {
      cmd = "python main.py";
    } else if (config.includes("C++") || config.includes("cpp")) {
      cmd = "make run";
    } else if (config.includes("Go") || config.includes("go")) {
      cmd = "go run main.go";
    } else if (config.includes("Rust") || config.includes("rust")) {
      cmd = "cargo run";
    } else if (config.includes("Node") || config.includes("server.js")) {
      cmd = "node server.js";
    }
    onExecuteCommand(cmd);
  };

  return (
    <div className="h-full flex flex-col bg-[#252526] text-neutral-300 font-sans text-xs select-none">
      {/* Header */}
      <div className="p-3 border-b border-[#1e1e1e] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Bug className="w-4 h-4 text-rose-400" />
          <span className="font-bold uppercase tracking-wider text-[11px] text-neutral-300">
            Run and Debug
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Launch Configuration Picker */}
        <div className="space-y-2">
          <label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block">
            Launch Target
          </label>
          <div className="flex items-center gap-2">
            <select
              value={config}
              onChange={(e) => setConfig(e.target.value)}
              className="flex-1 bg-[#1e1e1e] border border-[#383838] focus:border-[var(--color-primary)] rounded-lg px-2.5 py-1.5 text-xs text-white outline-none font-mono"
            >
              <option value="Python: Current File (main.py)">Python: Current File (main.py)</option>
              <option value="C/C++: Build & Debug (make run)">C/C++: Build & Debug (make run)</option>
              <option value="Go: Launch Service (go run main.go)">Go: Launch Service (go run main.go)</option>
              <option value="Rust: Cargo Run">Rust: Cargo Run</option>
              <option value="Node.js: Launch Program (server.js)">Node.js: Launch Program (server.js)</option>
              <option value="Web: Dev Server (npm run dev)">Web: Dev Server (npm run dev)</option>
            </select>

            <button
              type="button"
              onClick={handleStartDebug}
              title="Start Debugging / Run (F5)"
              className="p-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition cursor-pointer shadow-xs"
            >
              <Play className="w-4 h-4 fill-current" />
            </button>
          </div>
        </div>

        {/* Debug Controls */}
        <div className="p-2.5 rounded-xl bg-[#1e1e1e] border border-[#333333] flex items-center justify-between">
          <span className="text-[11px] text-neutral-400">Environment:</span>
          <span className="text-[11px] font-mono text-emerald-400 font-semibold flex items-center gap-1">
            <CircleDot className="w-3 h-3 fill-emerald-500" />
            Cloud Isolated Runtime
          </span>
        </div>

        {/* Variables Accordion */}
        <div className="border border-[#333333] rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => toggleSection("variables")}
            className="w-full flex items-center justify-between p-2 bg-[#202020] hover:bg-[#282828] text-[11px] font-bold text-neutral-300 uppercase tracking-wider cursor-pointer"
          >
            <span>Variables</span>
            {expandedSections.variables ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
          {expandedSections.variables && (
            <div className="p-2.5 space-y-1 font-mono text-[11px] bg-[#1a1a1a]">
              <div className="flex justify-between text-neutral-400">
                <span className="text-cyan-400">NODE_ENV:</span>
                <span>&quot;production&quot;</span>
              </div>
              <div className="flex justify-between text-neutral-400">
                <span className="text-cyan-400">PORT:</span>
                <span>3000</span>
              </div>
              <div className="flex justify-between text-neutral-400">
                <span className="text-cyan-400">WORKSPACE_ID:</span>
                <span className="truncate max-w-[120px]">{project.id}</span>
              </div>
            </div>
          )}
        </div>

        {/* Call Stack Accordion */}
        <div className="border border-[#333333] rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => toggleSection("callstack")}
            className="w-full flex items-center justify-between p-2 bg-[#202020] hover:bg-[#282828] text-[11px] font-bold text-neutral-300 uppercase tracking-wider cursor-pointer"
          >
            <span>Call Stack</span>
            {expandedSections.callstack ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
          {expandedSections.callstack && (
            <div className="p-2.5 space-y-1 text-neutral-400 font-mono text-[11px] bg-[#1a1a1a]">
              <div className="flex items-center gap-1.5 text-white">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span>main() [thread: 1]</span>
              </div>
              <div className="pl-3 text-neutral-500">at runtime.init()</div>
            </div>
          )}
        </div>

        {/* Breakpoints Accordion */}
        <div className="border border-[#333333] rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => toggleSection("breakpoints")}
            className="w-full flex items-center justify-between p-2 bg-[#202020] hover:bg-[#282828] text-[11px] font-bold text-neutral-300 uppercase tracking-wider cursor-pointer"
          >
            <span>Breakpoints</span>
            {expandedSections.breakpoints ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
          {expandedSections.breakpoints && (
            <div className="p-2.5 text-neutral-500 italic text-[11px] bg-[#1a1a1a]">
              No active breakpoints set. Click editor margin to add.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
