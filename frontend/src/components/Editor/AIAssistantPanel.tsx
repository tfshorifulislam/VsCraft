"use client";

import React, { useState } from "react";
import {
  Sparkles,
  Send,
  Trash2,
  Check,
  X,
  FileCode,
  AlertCircle,
  HelpCircle,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Project, ProjectFile, AIMessage, AIDiffChange } from "@/types/editor";

let msgCounter = 1;
function getNextId(prefix: string): string {
  msgCounter += 1;
  return `${prefix}-${msgCounter}`;
}

const INITIAL_WELCOME_MESSAGE: AIMessage = {
  id: "m-welcome",
  role: "assistant",
  content: `Hello! I'm your AI coding assistant. Ask me to explain code, refactor components, or add new features. I'll propose changes with diff previews before applying anything to your files.`,
  timestamp: 1700000000000,
};

interface AIAssistantPanelProps {
  project: Project;
  activeFile: ProjectFile | null;
  isOpen: boolean;
  onClose: () => void;
  onApplyDiff: (fileId: string, newContent: string) => void;
}

export default function AIAssistantPanel({
  project,
  activeFile,
  isOpen,
  onClose,
  onApplyDiff,
}: AIAssistantPanelProps) {
  const [messages, setMessages] = useState<AIMessage[]>([INITIAL_WELCOME_MESSAGE]);
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedDiffs, setExpandedDiffs] = useState<Record<string, boolean>>({});

  if (!isOpen) return null;

  const starterPrompts = [
    "Explain this file",
    "Add a reset button",
    "Refactor styling with Tailwind/CSS",
    "Add an interactive feature",
  ];

  const handleSend = async (userPrompt?: string) => {
    const textToSend = userPrompt || prompt.trim();
    if (!textToSend || isLoading) return;

    setError(null);
    const userMsg: AIMessage = {
      id: getNextId("u"),
      role: "user",
      content: textToSend,
      timestamp: 1700000000000 + msgCounter,
    };

    setMessages((prev) => [...prev, userMsg]);
    setPrompt("");
    setIsLoading(true);

    try {
      const activeFileContext = activeFile
        ? {
            path: activeFile.path,
            name: activeFile.name,
            content: activeFile.content,
            language: activeFile.language,
          }
        : null;

      const relevantFilesContext = project.files
        .filter((f) => !f.isFolder && f.id !== activeFile?.id)
        .slice(0, 4)
        .map((f) => ({
          path: f.path,
          name: f.name,
          content: f.content.slice(0, 800),
          language: f.language,
        }));

      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: textToSend,
          activeFile: activeFileContext,
          relevantFiles: relevantFilesContext,
          history: messages.slice(-4),
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `AI Request failed with status ${res.status}`);
      }

      const data = await res.json();

      // Convert raw proposed diffs to AIDiffChange objects
      const proposedDiffs: AIDiffChange[] = (data.proposedDiffs || []).map(
        (d: { filePath: string; summary: string; newContent: string }) => {
          const targetFile =
            project.files.find((f) => f.path === d.filePath || f.name === d.filePath) ||
            activeFile;

          return {
            id: getNextId("diff"),
            fileId: targetFile?.id || activeFile?.id || "",
            filePath: targetFile?.path || d.filePath,
            originalContent: targetFile?.content || "",
            newContent: d.newContent,
            summary: d.summary || "Proposed changes",
            status: "pending",
          };
        }
      );

      const aiMsg: AIMessage = {
        id: getNextId("a"),
        role: "assistant",
        content: data.content || "I have analyzed your request.",
        timestamp: 1700000000000 + msgCounter,
        proposedDiffs,
      };

      setMessages((prev) => [...prev, aiMsg]);

      // Expand diffs by default
      if (proposedDiffs.length > 0) {
        const nextExpanded: Record<string, boolean> = {};
        proposedDiffs.forEach((d) => (nextExpanded[d.id] = true));
        setExpandedDiffs((prev) => ({ ...prev, ...nextExpanded }));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to connect to AI service";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAcceptDiff = (msgId: string, diff: AIDiffChange) => {
    onApplyDiff(diff.fileId, diff.newContent);

    // Update diff status in message
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msgId || !m.proposedDiffs) return m;
        return {
          ...m,
          proposedDiffs: m.proposedDiffs.map((d) =>
            d.id === diff.id ? { ...d, status: "accepted" as const } : d
          ),
        };
      })
    );
  };

  const handleRejectDiff = (msgId: string, diffId: string) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msgId || !m.proposedDiffs) return m;
        return {
          ...m,
          proposedDiffs: m.proposedDiffs.map((d) =>
            d.id === diffId ? { ...d, status: "rejected" as const } : d
          ),
        };
      })
    );
  };

  const toggleDiffExpand = (id: string) => {
    setExpandedDiffs((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="h-full flex flex-col bg-[#252526] border-l border-[#1e1e1e] select-none z-20 w-full min-w-[320px] max-w-full text-neutral-300">
      {/* AI Panel Header */}
      <div className="h-10 bg-[#1e1e1e] border-b border-[#2b2b2b] px-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded bg-[var(--color-primary)] flex items-center justify-center text-white">
            <Sparkles className="w-3 h-3 text-[#f3f0ff]" />
          </div>
          <span className="text-xs font-semibold text-white">AI Assistant</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
        </div>

        <div className="flex items-center gap-1 text-neutral-400">
          <button
            type="button"
            onClick={() => setMessages([])}
            title="Clear conversation"
            className="p-1 hover:text-white rounded hover:bg-[#333333] transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            title="Close AI Assistant"
            className="p-1 hover:text-white rounded hover:bg-[#333333] transition"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Active Context Banner */}
      <div className="px-3 py-1.5 bg-[#1a1a1a] border-b border-[#2b2b2b] flex items-center justify-between text-[11px] text-neutral-400">
        <div className="flex items-center gap-1.5 truncate">
          <FileCode className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span className="truncate">
            Context:{" "}
            <strong className="text-neutral-200">
              {activeFile ? activeFile.path : "No active file"}
            </strong>
          </span>
        </div>
        {activeFile && (
          <span className="text-[10px] text-neutral-500 font-mono">
            {activeFile.content.split("\n").length} lines
          </span>
        )}
      </div>

      {/* Chat Thread Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${
              msg.role === "user" ? "items-end" : "items-start"
            }`}
          >
            <div
              className={`max-w-[92%] rounded-xl p-3 text-xs leading-relaxed ${
                msg.role === "user"
                  ? "bg-[var(--color-primary)] text-white rounded-tr-xs"
                  : "bg-[#1e1e1e] border border-[#333333] text-neutral-200 rounded-tl-xs shadow-sm"
              }`}
            >
              <div className="whitespace-pre-wrap">{msg.content}</div>

              {/* Proposed Diffs Section */}
              {msg.proposedDiffs && msg.proposedDiffs.length > 0 && (
                <div className="mt-3 pt-3 border-t border-[#333333] space-y-2">
                  <div className="flex items-center justify-between font-semibold text-[11px] text-[#c4b5fd]">
                    <span className="flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-[#a78bfa]" />
                      Proposed File Changes ({msg.proposedDiffs.length})
                    </span>
                  </div>

                  {msg.proposedDiffs.map((diff) => (
                    <div
                      key={diff.id}
                      className="bg-[#141414] border border-[#2e2e2e] rounded-lg p-2.5 text-xs font-mono space-y-2"
                    >
                      <div
                        onClick={() => toggleDiffExpand(diff.id)}
                        className="flex items-center justify-between cursor-pointer hover:text-white"
                      >
                        <div className="flex items-center gap-1 text-[11px] font-medium text-neutral-300">
                          {expandedDiffs[diff.id] ? (
                            <ChevronDown className="w-3 h-3 text-neutral-500" />
                          ) : (
                            <ChevronRight className="w-3 h-3 text-neutral-500" />
                          )}
                          <FileCode className="w-3.5 h-3.5 text-cyan-400" />
                          <span>{diff.filePath}</span>
                        </div>
                        <span
                          className={`text-[9px] px-1.5 py-0.2 rounded font-sans uppercase font-bold ${
                            diff.status === "accepted"
                              ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                              : diff.status === "rejected"
                              ? "bg-rose-950 text-rose-400 border border-rose-800"
                              : "bg-amber-950/70 text-amber-300 border border-amber-800"
                          }`}
                        >
                          {diff.status}
                        </span>
                      </div>

                      {/* Summary Note */}
                      <p className="text-[10px] text-neutral-400 font-sans">
                        {diff.summary}
                      </p>

                      {/* Code Diff Preview Box */}
                      {expandedDiffs[diff.id] && (
                        <div className="max-h-48 overflow-y-auto bg-[#0a0a0a] rounded border border-[#222222] p-2 text-[10px] leading-snug space-y-0.5">
                          {diff.newContent
                            .split("\n")
                            .slice(0, 30)
                            .map((line, idx) => (
                              <div
                                key={idx}
                                className={
                                  line.includes("<button") ||
                                  line.includes("count") ||
                                  line.includes("Reset") ||
                                  line.includes("style")
                                    ? "bg-emerald-950/60 text-emerald-300 -mx-2 px-2"
                                    : "text-neutral-400"
                                }
                              >
                                {line}
                              </div>
                            ))}
                        </div>
                      )}

                      {/* Diff Accept / Reject Actions */}
                      {diff.status === "pending" && (
                        <div className="flex items-center gap-2 pt-1 font-sans">
                          <button
                            type="button"
                            onClick={() => handleAcceptDiff(msg.id, diff)}
                            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold shadow-xs transition cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Accept Changes</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRejectDiff(msg.id, diff.id)}
                            className="px-2.5 py-1.5 bg-[#2a2a2a] hover:bg-[#333333] text-neutral-300 rounded text-xs transition cursor-pointer"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <span className="text-[9px] text-neutral-500 mt-1 px-1">
              {new Date(msg.timestamp).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        ))}

        {isLoading && (
          <div className="flex items-center gap-2 text-xs text-neutral-400 bg-[#1e1e1e] p-3 rounded-xl border border-[#333333] w-fit">
            <Sparkles className="w-4 h-4 text-[#a78bfa] animate-spin" />
            <span>Analyzing code and preparing suggestions...</span>
          </div>
        )}

        {error && (
          <div className="p-3 bg-rose-950/40 border border-rose-800 text-rose-300 rounded-xl text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <strong className="font-semibold">AI Assistant Error:</strong>
              <p className="mt-0.5 text-rose-200">{error}</p>
            </div>
          </div>
        )}
      </div>

      {/* Starter Prompts Carousel */}
      <div className="px-3 py-1.5 bg-[#1e1e1e] border-t border-[#2b2b2b] flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        {starterPrompts.map((s, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => handleSend(s)}
            className="text-[10px] bg-[#2a2a2a] hover:bg-[#333333] hover:text-white text-neutral-300 px-2 py-1 rounded whitespace-nowrap border border-[#383838] transition cursor-pointer"
          >
            {s}
          </button>
        ))}
      </div>

      {/* Prompt Input Box */}
      <div className="p-3 bg-[#1e1e1e] border-t border-[#2b2b2b]">
        <div className="relative">
          <textarea
            rows={2}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask AI to explain, modify, or add features..."
            className="w-full bg-[#141414] border border-[#333333] rounded-lg pl-3 pr-9 py-2 text-xs text-neutral-200 placeholder-neutral-500 outline-none focus:border-[var(--color-primary)] transition resize-none"
          />
          <button
            type="button"
            onClick={() => handleSend()}
            disabled={!prompt.trim() || isLoading}
            title="Send (Enter)"
            className="absolute right-2 top-2.5 p-1 bg-[var(--color-primary)] disabled:opacity-40 text-white rounded hover:bg-[var(--color-primary-hover)] transition cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="mt-1 flex items-center justify-between text-[10px] text-neutral-500">
          <span>Press ⏎ Enter to send • Shift+⏎ for newline</span>
          <span className="flex items-center gap-1">
            <HelpCircle className="w-3 h-3" />
            Diff review active
          </span>
        </div>
      </div>
    </div>
  );
}
