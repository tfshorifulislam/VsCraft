"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
  Cpu,
  Zap,
} from "lucide-react";
import { Project } from "@/types/editor";
import { webcontainerManager } from "@/lib/webcontainer/webcontainerManager";
import { generatePreviewHtml } from "@/lib/runtime/previewCompiler";
import type { WebContainerProcess } from "@webcontainer/api";

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

  // Dev server state (WebContainer runtime in browser)
  const [serverPort, setServerPort] = useState<number | undefined>(
    () => webcontainerManager.getLatestServerPort() ?? undefined
  );
  const [serverUrl, setServerUrl] = useState<string | undefined>(
    () => webcontainerManager.getLatestServerUrl() ?? undefined
  );
  const [serverStatus, setServerStatus] = useState<"stopped" | "starting" | "running" | "error">(() => {
    return webcontainerManager.getLatestServerUrl() ? "running" : "stopped";
  });
  const [serverLogs, setServerLogs] = useState<string[]>([]);
  const [serverError, setServerError] = useState<string | undefined>(undefined);
  const [isActionLoading, setIsActionLoading] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const devProcessRef = useRef<WebContainerProcess | null>(null);

  // Listen to WebContainer server-ready events
  useEffect(() => {
    const unsubscribe = webcontainerManager.onServerReady((port, url) => {
      setServerPort(port);
      setServerUrl(url);
      setServerStatus("running");
      setIsActionLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // In-Browser Fast Preview generation
  const clientCompilerBlobUrl = useMemo(() => {
    void refreshKey;
    void refreshTrigger;
    if (previewMode !== "compiler" || !isOpen) return null;
    try {
      const html = generatePreviewHtml(project);
      const blob = new Blob([html], { type: "text/html" });
      return URL.createObjectURL(blob);
    } catch (err) {
      console.error("Fast compiler preview generation error:", err);
      return null;
    }
  }, [previewMode, isOpen, project, refreshKey, refreshTrigger]);

  useEffect(() => {
    return () => {
      if (clientCompilerBlobUrl) {
        URL.revokeObjectURL(clientCompilerBlobUrl);
      }
    };
  }, [clientCompilerBlobUrl]);

  // Start dev server inside in-browser WebContainer
  const handleStartServer = useCallback(async () => {
    setIsActionLoading(true);
    setServerStatus("starting");
    setServerError(undefined);
    setServerLogs(["[WebContainer] Initializing dev server runtime in browser..."]);

    try {
      const container = await webcontainerManager.getInstance();

      // Ensure files are mounted
      if (!webcontainerManager.isProjectMounted(project.id)) {
        setServerLogs((prev) => [...prev, "[WebContainer] Mounting project files..."]);
        await webcontainerManager.mountProject(project.id, project.files);
      }

      // Check package.json for start or dev script
      const pkgFile = project.files.find((f) => f.path === "package.json" || f.name === "package.json");
      let scriptName = "dev";
      let hasPackageJson = false;

      if (pkgFile?.content) {
        hasPackageJson = true;
        try {
          const parsed = JSON.parse(pkgFile.content);
          if (!parsed.scripts?.dev && parsed.scripts?.start) {
            scriptName = "start";
          }
        } catch {}
      }

      if (!hasPackageJson) {
        // Vanilla web project without package.json -> switch to Fast In-Browser Preview
        setServerLogs((prev) => [
          ...prev,
          "[WebContainer] No package.json found. Switching to In-Browser Web Preview...",
        ]);
        setPreviewMode("compiler");
        setServerStatus("stopped");
        setIsActionLoading(false);
        return;
      }

      setServerLogs((prev) => [...prev, `[WebContainer] Running 'npm run ${scriptName}'...`]);

      const proc = await container.spawn("npm", ["run", scriptName]);
      devProcessRef.current = proc;

      proc.output.pipeTo(
        new WritableStream({
          write(chunk) {
            setServerLogs((prev) => [...prev.slice(-120), chunk]);
          },
        })
      );

      proc.exit.then((exitCode) => {
        if (exitCode !== 0) {
          setServerError(`Process exited with code ${exitCode}`);
          setServerStatus("error");
        } else {
          setServerStatus("stopped");
        }
        setIsActionLoading(false);
      });
    } catch (err) {
      console.error("[WebContainer] Start server error:", err);
      setServerStatus("error");
      setServerError(err instanceof Error ? err.message : "Failed to start WebContainer dev server");
      setIsActionLoading(false);
    }
  }, [project.id, project.files]);

  // Stop dev server inside WebContainer
  const handleStopServer = useCallback(() => {
    setIsActionLoading(true);
    try {
      if (devProcessRef.current) {
        devProcessRef.current.kill();
        devProcessRef.current = null;
      }
      setServerStatus("stopped");
      setServerPort(undefined);
      setServerUrl(undefined);
    } finally {
      setIsActionLoading(false);
    }
  }, []);

  // Restart dev server
  const handleRestartServer = useCallback(async () => {
    handleStopServer();
    setTimeout(() => {
      handleStartServer();
    }, 150);
  }, [handleStopServer, handleStartServer]);

  // Auto-scroll logs when starting
  useEffect(() => {
    if (serverStatus === "starting") {
      logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [serverLogs, serverStatus]);

  // Listen for console bridge messages from the preview iframe
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
    } else if (clientCompilerBlobUrl) {
      window.open(clientCompilerBlobUrl, "_blank");
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
      : clientCompilerBlobUrl || "";

  return (
    <div className="h-full flex flex-col bg-[#1e1e1e] border-l border-[#2b2b2b] select-none z-10 w-full min-w-[320px]">
      {/* Top Address & Controls Bar */}
      <div className="h-10 bg-[#252526] border-b border-[#1e1e1e] px-3 flex items-center justify-between text-xs text-neutral-300 gap-2">
        {/* Left: Reload / Controls + Address bar */}
        <div className="flex items-center gap-1.5 flex-1 max-w-md">
          {previewMode === "devserver" && serverStatus === "running" ? (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleRestartServer}
              disabled={isActionLoading}
              title="Restart WebContainer dev server"
              className="p-1.5 hover:text-white text-neutral-400 rounded hover:bg-[#333333] transition cursor-pointer"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isActionLoading ? "animate-spin" : ""}`} />
            </button>
          ) : (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleRefresh}
              title="Refresh live preview"
              className="p-1.5 hover:text-white text-neutral-400 rounded hover:bg-[#333333] transition cursor-pointer"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Address Bar */}
          <div className="flex-1 bg-[#181818] border border-[#333333] rounded px-2.5 py-1 text-[11px] font-mono text-neutral-400 flex items-center gap-2 overflow-hidden shadow-inner">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                previewMode === "devserver" && serverStatus === "running"
                  ? "bg-emerald-400 animate-pulse"
                  : previewMode === "devserver" && serverStatus === "starting"
                  ? "bg-amber-400 animate-pulse"
                  : previewMode === "compiler"
                  ? "bg-sky-400"
                  : "bg-neutral-600"
              }`}
            />
            <span className="truncate select-text">
              {previewMode === "devserver" && serverStatus === "running" && serverUrl
                ? serverUrl
                : previewMode === "devserver" && serverStatus === "starting"
                ? `Booting WebContainer port ${serverPort || "..."}`
                : previewMode === "compiler"
                ? "in-browser:preview"
                : "WebContainer Runtime (Stopped)"}
            </span>
          </div>

          {/* Start/Stop Controls for Dev Server */}
          {previewMode === "devserver" && (
            <div>
              {serverStatus === "running" ? (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={handleStopServer}
                  disabled={isActionLoading}
                  title="Stop Dev Server"
                  className="px-2 py-1 bg-rose-950/60 hover:bg-rose-900 border border-rose-800/60 text-rose-300 rounded font-semibold text-[10px] flex items-center gap-1 transition cursor-pointer"
                >
                  <Square className="w-3 h-3 fill-current" />
                  <span>Stop</span>
                </button>
              ) : (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={handleStartServer}
                  disabled={isActionLoading || serverStatus === "starting"}
                  title="Start Dev Server inside WebContainer"
                  className="px-2 py-1 bg-emerald-950/60 hover:bg-emerald-900 border border-emerald-800/60 text-emerald-300 rounded font-semibold text-[10px] flex items-center gap-1 transition cursor-pointer"
                >
                  {isActionLoading || serverStatus === "starting" ? (
                    <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
                  ) : (
                    <Play className="w-3 h-3 fill-current" />
                  )}
                  <span>Run Dev</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Center: Device Responsive Mode Switcher */}
        <div className="flex items-center gap-0.5 bg-[#181818] p-0.5 rounded border border-[#333333]">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setDeviceMode("desktop")}
            title="Desktop view"
            className={`p-1.5 rounded transition cursor-pointer ${
              deviceMode === "desktop"
                ? "bg-[#333333] text-white"
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
            className={`p-1.5 rounded transition cursor-pointer ${
              deviceMode === "tablet"
                ? "bg-[#333333] text-white"
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
            className={`p-1.5 rounded transition cursor-pointer ${
              deviceMode === "mobile"
                ? "bg-[#333333] text-white"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Right: Runtime Mode Tabs & Window controls */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-[#181818] p-0.5 rounded border border-[#333333] text-[11px]">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setPreviewMode("devserver")}
              className={`px-2 py-0.5 rounded transition cursor-pointer flex items-center gap-1 ${
                previewMode === "devserver"
                  ? "bg-[#333333] text-white font-semibold"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              <Cpu className="w-3 h-3 text-emerald-400" />
              <span>WebContainer Dev</span>
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setPreviewMode("compiler")}
              className={`px-2 py-0.5 rounded transition cursor-pointer flex items-center gap-1 ${
                previewMode === "compiler"
                  ? "bg-[#333333] text-white font-semibold"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              <Zap className="w-3 h-3 text-sky-400" />
              <span>Fast In-Browser</span>
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
              title="WebContainer Live Development Preview"
              sandbox="allow-scripts allow-modals allow-forms allow-popups"
              className="w-full h-full border-0 bg-white"
            />
          ) : previewMode === "devserver" && serverStatus === "starting" ? (
            /* State 2: Dev Server is Booting */
            <div className="w-full h-full bg-[#181818] text-white font-mono text-xs flex flex-col p-4">
              <div className="flex items-center gap-2 pb-3 border-b border-[#2b2b2b] text-neutral-300">
                <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                <span className="font-semibold text-white">Starting In-Browser WebContainer Server...</span>
                <span className="text-neutral-500 text-[11px] ml-auto">
                  browser-runtime/{project.name}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto py-2 space-y-1 text-neutral-400 select-text leading-relaxed">
                {serverLogs.map((log, idx) => (
                  <div
                    key={idx}
                    className={
                      log.includes("Ready") || log.includes("Local:") || log.includes("http")
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
                <div className="w-12 h-12 rounded-xl bg-cyan-500/10 text-cyan-400 mx-auto flex items-center justify-center">
                  <Cpu className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center justify-center gap-2">
                    <span>WebContainer Browser Runtime</span>
                  </h3>
                  <p className="text-xs text-neutral-400 mt-1">
                    Execute code and development servers ({project.template || "web"}) securely inside WebAssembly in your browser.
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
                    Or switch to Fast In-Browser Preview
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* State 4: Fast In-Browser HTML/JS Preview */
            <iframe
              ref={iframeRef}
              key={`compiler-${refreshKey}-${refreshTrigger}`}
              src={activeIframeSrc}
              title="Fast In-Browser Live Preview"
              sandbox="allow-scripts allow-modals allow-forms allow-popups"
              className="w-full h-full border-0 bg-white"
            />
          )}
        </div>
      </div>
    </div>
  );
}
