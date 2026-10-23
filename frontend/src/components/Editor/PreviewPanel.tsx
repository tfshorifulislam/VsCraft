"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  RotateCw,
  RotateCcw,
  ExternalLink,
  Smartphone,
  Tablet,
  Monitor,
  X,
  Loader2,
  Play,
  Square,
  Server,
} from "lucide-react";
import { Project } from "@/types/editor";
import { cloudApi } from "@/lib/cloud/cloudApi";

interface PreviewPanelProps {
  project: Project;
  isOpen: boolean;
  onClose: () => void;
  onConsoleMessage?: (type: "log" | "error" | "warn" | "info", text: string) => void;
  refreshTrigger?: number;
}

export default function PreviewPanel({
  project,
  isOpen,
  onClose,
  onConsoleMessage,
  refreshTrigger = 0,
}: PreviewPanelProps) {
  const [deviceMode, setDeviceMode] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [previewMode, setPreviewMode] = useState<"devserver" | "compiler">("devserver");
  const [refreshKey, setRefreshKey] = useState(0);

  // Dev server state
  const [serverStatus, setServerStatus] = useState<"stopped" | "starting" | "running" | "error">("stopped");
  const [serverPort, setServerPort] = useState<number | undefined>(undefined);
  const [serverUrl, setServerUrl] = useState<string | undefined>(undefined);
  const [serverLogs, setServerLogs] = useState<string[]>([]);
  const [serverError, setServerError] = useState<string | undefined>(undefined);
  const [isActionLoading, setIsActionLoading] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Start dev server action
  const handleStartServer = React.useCallback(async () => {
    setIsActionLoading(true);
    setServerStatus("starting");
    try {
      const res = await cloudApi.server.start(project.id);
      setServerStatus(res.status);
      setServerPort(res.port);
      setServerUrl(res.url);
      setServerLogs(res.logs || []);
      setServerError(res.error);
    } catch (err) {
      setServerStatus("error");
      setServerError(err instanceof Error ? err.message : "Failed to start dev server");
    } finally {
      setIsActionLoading(false);
    }
  }, [project.id]);

  // Stop dev server action: stops process and closes/hides the preview window
  const handleStopServer = React.useCallback(async () => {
    setIsActionLoading(true);
    try {
      await cloudApi.server.stop(project.id);
      setServerStatus("stopped");
      setServerPort(undefined);
      setServerUrl(undefined);
      onClose();
    } catch (err) {
      console.error("Stop dev server error:", err);
    } finally {
      setIsActionLoading(false);
    }
  }, [project.id, onClose]);

  // Restart dev server action
  const handleRestartServer = React.useCallback(async () => {
    setIsActionLoading(true);
    setServerStatus("starting");
    try {
      const res = await cloudApi.server.restart(project.id);
      setServerStatus(res.status);
      setServerPort(res.port);
      setServerUrl(res.url);
      setServerLogs(res.logs || []);
      setServerError(res.error);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setServerStatus("error");
      setServerError(err instanceof Error ? err.message : "Failed to restart dev server");
    } finally {
      setIsActionLoading(false);
    }
  }, [project.id]);

  // Query server status and automatically start or refresh dev server preview on Run Preview
  useEffect(() => {
    if (!project.id || !isOpen) return;
    let isCancelled = false;

    async function loadStatusAndRun() {
      if (previewMode === "compiler") {
        setRefreshKey((k) => k + 1);
        return;
      }

      try {
        const res = await cloudApi.server.getStatus(project.id);
        if (isCancelled) return;

        setServerStatus(res.status);
        setServerPort(res.port);
        setServerUrl(res.url);
        setServerLogs(res.logs || []);
        setServerError(res.error);

        // If server is running, refresh the preview
        if (res.status === "running") {
          setRefreshKey((k) => k + 1);
        } else if (res.status === "stopped") {
          // If server is stopped, start it automatically so clicking Run Preview actually runs the preview
          handleStartServer();
        }
      } catch {
        // Fallback
      }
    }

    loadStatusAndRun();
    return () => {
      isCancelled = true;
    };
  }, [project.id, isOpen, refreshTrigger, previewMode, handleStartServer]);

  // Auto-scroll logs when starting
  useEffect(() => {
    if (serverStatus === "starting") {
      logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [serverLogs, serverStatus]);

  // Listen for console bridge messages from the iframe
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data && e.data.type === "PREVIEW_CONSOLE" && onConsoleMessage) {
        onConsoleMessage(e.data.level || "log", e.data.text || "");
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onConsoleMessage]);

  const handleRefresh = () => {
    setRefreshKey((prev) => prev + 1);
  };

  const handleOpenExternal = () => {
    if (previewMode === "devserver" && serverUrl) {
      window.open(serverUrl, "_blank");
    } else {
      window.open(`/api/projects/${encodeURIComponent(project.id)}/preview`, "_blank");
    }
  };

  if (!isOpen) return null;

  const getContainerWidth = () => {
    switch (deviceMode) {
      case "mobile":
        return "375px";
      case "tablet":
        return "768px";
      case "desktop":
      default:
        return "100%";
    }
  };

  const activeIframeSrc =
    previewMode === "devserver" && serverStatus === "running" && serverUrl
      ? `${serverUrl}?t=${refreshKey}_${refreshTrigger}`
      : `/api/projects/${encodeURIComponent(project.id)}/preview?t=${refreshKey}_${refreshTrigger}`;

  return (
    <div className="h-full flex flex-col bg-[#1e1e1e] border-l border-[#2b2b2b] select-none z-10 w-full min-w-[320px]">
      {/* Top Address & Controls Bar */}
      <div className="h-10 bg-[#252526] border-b border-[#1e1e1e] px-3 flex items-center justify-between text-xs text-neutral-300 gap-2">
        {/* Left: Reload / Controls + Address bar */}
        <div className="flex items-center gap-1.5 flex-1 max-w-md">
          {previewMode === "devserver" && serverStatus === "running" ? (
            <>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleRefresh}
                title="Reload preview"
                className="p-1 hover:text-white rounded hover:bg-[#333333] transition cursor-pointer"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleRestartServer}
                disabled={isActionLoading}
                title="Restart dev server process"
                className="p-1 text-amber-400 hover:text-amber-300 rounded hover:bg-[#333333] transition cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleStopServer}
                disabled={isActionLoading}
                title="Stop dev server process"
                className="p-1 text-rose-400 hover:text-rose-300 rounded hover:bg-[#333333] transition cursor-pointer"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
              </button>
            </>
          ) : (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={previewMode === "devserver" ? handleStartServer : handleRefresh}
              disabled={isActionLoading}
              title={previewMode === "devserver" ? "Start dev server process" : "Reload preview"}
              className="p-1 text-emerald-400 hover:text-emerald-300 rounded hover:bg-[#333333] transition cursor-pointer"
            >
              {isActionLoading || serverStatus === "starting" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : previewMode === "devserver" ? (
                <Play className="w-3.5 h-3.5 fill-current" />
              ) : (
                <RotateCw className="w-3.5 h-3.5" />
              )}
            </button>
          )}

          {/* Address Bar */}
          <div className="flex-1 flex items-center bg-[#1e1e1e] border border-[#333333] px-2.5 py-1 rounded-md text-[11px] font-mono text-neutral-400 min-w-0">
            {previewMode === "devserver" ? (
              <>
                <span
                  className={`w-2 h-2 rounded-full mr-1.5 shrink-0 ${
                    serverStatus === "running"
                      ? "bg-emerald-400 animate-pulse"
                      : serverStatus === "starting"
                      ? "bg-amber-400 animate-ping"
                      : serverStatus === "error"
                      ? "bg-rose-400"
                      : "bg-neutral-600"
                  }`}
                />
                <span className="text-neutral-200 truncate">
                  {serverStatus === "running" && serverUrl
                    ? serverUrl
                    : serverStatus === "starting"
                    ? `Starting on :${serverPort || 3100}...`
                    : "Dev Server: Stopped"}
                </span>
                <span className="ml-auto text-[9px] px-1.5 py-0.2 rounded border shrink-0 font-sans font-semibold ml-1 bg-emerald-950/80 text-emerald-300 border-emerald-800/40">
                  {serverStatus === "running" ? "Dev Server" : "Stopped"}
                </span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-cyan-400 mr-1.5 shrink-0" />
                <span className="text-neutral-200 truncate">Instant Bundler (esbuild)</span>
                <span className="ml-auto text-[9px] px-1.5 py-0.2 rounded border shrink-0 font-sans font-semibold ml-1 bg-cyan-950/80 text-cyan-300 border-cyan-800/40">
                  Compiler
                </span>
              </>
            )}
          </div>
        </div>

        {/* Center: Device Viewport Switches */}
        <div className="hidden sm:flex items-center bg-[#1e1e1e] p-0.5 rounded border border-[#333333]">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setDeviceMode("desktop")}
            title="Desktop view"
            className={`p-1 rounded transition cursor-pointer ${
              deviceMode === "desktop"
                ? "bg-[var(--color-primary)] text-white"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setDeviceMode("tablet")}
            title="Tablet view (768px)"
            className={`p-1 rounded transition cursor-pointer ${
              deviceMode === "tablet"
                ? "bg-[var(--color-primary)] text-white"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            <Tablet className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setDeviceMode("mobile")}
            title="Mobile view (375px)"
            className={`p-1 rounded transition cursor-pointer ${
              deviceMode === "mobile"
                ? "bg-[var(--color-primary)] text-white"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Mode Toggle & Window Actions */}
        <div className="flex items-center gap-1">
          {/* Mode Switcher Pill */}
          <div className="hidden lg:flex items-center bg-[#1e1e1e] p-0.5 rounded border border-[#333333] text-[10px] font-sans font-medium">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setPreviewMode("devserver")}
              className={`px-2 py-0.5 rounded transition cursor-pointer ${
                previewMode === "devserver"
                  ? "bg-[#333333] text-white font-semibold"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              Dev Server
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setPreviewMode("compiler")}
              className={`px-2 py-0.5 rounded transition cursor-pointer ${
                previewMode === "compiler"
                  ? "bg-[#333333] text-white font-semibold"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              Fast Compiler
            </button>
          </div>

          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleOpenExternal}
            title="Open in new window"
            className="p-1.5 hover:text-white text-neutral-400 rounded hover:bg-[#333333] transition cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onClose}
            title="Close Preview panel"
            className="p-1.5 hover:text-white text-neutral-400 rounded hover:bg-[#333333] transition cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Rendered Viewport Sandbox */}
      <div className="flex-1 bg-[#121212] flex items-center justify-center p-2 overflow-auto">
        <div
          style={{ width: getContainerWidth() }}
          className={`h-full bg-white transition-all overflow-hidden ${
            deviceMode !== "desktop"
              ? "rounded-xl shadow-2xl border-4 border-neutral-700"
              : ""
          }`}
        >
          {/* State 1: Dev Server is Running */}
          {previewMode === "devserver" && serverStatus === "running" && serverUrl ? (
            <iframe
              ref={iframeRef}
              key={`${refreshKey}-${refreshTrigger}-${serverPort}`}
              src={activeIframeSrc}
              title="Live Development Server Preview"
              sandbox="allow-scripts allow-modals allow-forms allow-same-origin"
              className="w-full h-full border-0 bg-white"
            />
          ) : previewMode === "devserver" && serverStatus === "starting" ? (
            /* State 2: Dev Server is Booting */
            <div className="w-full h-full bg-[#181818] text-white font-mono text-xs flex flex-col p-4">
              <div className="flex items-center gap-2 pb-3 border-b border-[#2b2b2b] text-neutral-300">
                <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                <span className="font-semibold text-white">Starting Project Development Server...</span>
                <span className="text-neutral-500 text-[11px] ml-auto">
                  workspaces/{project.name}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto py-2 space-y-1 text-neutral-400 select-text leading-relaxed">
                {serverLogs.map((log, idx) => (
                  <div
                    key={idx}
                    className={
                      log.includes("Ready") || log.includes("Local:")
                        ? "text-emerald-400 font-semibold"
                        : log.includes("Error") || log.includes("[stderr]")
                        ? "text-rose-400"
                        : ""
                    }
                  >
                    {log}
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            </div>
          ) : previewMode === "devserver" && (serverStatus === "stopped" || serverStatus === "error") ? (
            /* State 3: Dev Server Stopped / Launch Card */
            <div className="w-full h-full bg-[#181818] text-white font-sans flex flex-col items-center justify-center p-6 text-center">
              <div className="max-w-sm w-full bg-[#242426] border border-[#383838] rounded-2xl p-6 shadow-2xl space-y-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-400 mx-auto flex items-center justify-center">
                  <Server className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center justify-center gap-2">
                    <span>Live Development Server</span>
                  </h3>
                  <p className="text-xs text-neutral-400 mt-1">
                    Execute the real development runtime ({project.template || "web"}) directly in{" "}
                    <code className="text-neutral-300 font-mono text-[10px]">workspaces/{project.id}</code>.
                  </p>
                </div>

                {serverError && (
                  <div className="p-2 rounded bg-rose-950/40 border border-rose-800/40 text-rose-300 text-[11px] font-mono text-left overflow-auto max-h-24">
                    {serverError}
                  </div>
                )}

                <div className="pt-2 flex flex-col gap-2">
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={handleStartServer}
                    disabled={isActionLoading}
                    className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-950/40"
                  >
                    {isActionLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Play className="w-4 h-4 fill-current" />
                    )}
                    <span>Start Dev Server</span>
                  </button>

                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setPreviewMode("compiler")}
                    className="text-[11px] text-neutral-400 hover:text-white py-1 transition cursor-pointer"
                  >
                    Or switch to Fast Compiler (esbuild)
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* State 4: Fast In-Memory Compiler Mode */
            <iframe
              ref={iframeRef}
              key={`compiler-${refreshKey}-${refreshTrigger}`}
              src={`/api/projects/${encodeURIComponent(project.id)}/preview?t=${refreshKey}_${refreshTrigger}`}
              title="Fast Compiler Live Preview"
              sandbox="allow-scripts allow-modals allow-forms allow-same-origin"
              className="w-full h-full border-0 bg-white"
            />
          )}
        </div>
      </div>
    </div>
  );
}
