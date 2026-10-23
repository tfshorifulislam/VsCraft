"use client";

import React, { useState, useRef, type FormEvent, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import {
  X,
  Upload,
  FolderOpen,
  FileArchive,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ShieldCheck,
  ArrowRight,
} from "lucide-react";
import JSZip from "jszip";
import { cloudApi } from "@/lib/cloud/cloudApi";
import { detectProjectFramework, DetectionResult } from "@/lib/project/detectFramework";
import { ProjectImportFile } from "@/types/editor";

interface ImportProjectDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImported?: (projectId: string) => void;
}

const IGNORED_DIR_NAMES = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  ".turbo",
  "__pycache__",
  ".venv",
  "venv",
  ".idea",
  ".vscode",
  ".output",
]);

const IGNORED_FILE_NAMES = new Set([
  ".ds_store",
  "thumbs.db",
  "desktop.ini",
  ".npmrc",
  "yarn-error.log",
  "package-lock.json.bak",
]);

const BINARY_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "webp", "gif", "ico", "bmp", "avif",
  "woff", "woff2", "ttf", "otf", "eot",
  "wasm", "pdf", "mp3", "mp4", "wav"
]);

function readFileAsDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error || new Error("Failed to read file as Data URL"));
    reader.readAsDataURL(file);
  });
}

async function readFileContent(file: File): Promise<{ content: string; isBinary: boolean }> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  if (BINARY_EXTENSIONS.has(ext)) {
    const dataUrl = await readFileAsDataUrl(file);
    return { content: dataUrl, isBinary: true };
  }

  try {
    const text = await file.text();
    // Fall back to data URL if null bytes are present
    if (text.includes("\0")) {
      const dataUrl = await readFileAsDataUrl(file);
      return { content: dataUrl, isBinary: true };
    }
    return { content: text, isBinary: false };
  } catch {
    const dataUrl = await readFileAsDataUrl(file);
    return { content: dataUrl, isBinary: true };
  }
}

export default function ImportProjectDialog({
  isOpen,
  onClose,
  onImported,
}: ImportProjectDialogProps) {
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<"folder" | "zip">("folder");
  const [selectedZip, setSelectedZip] = useState<File | null>(null);
  const [folderFiles, setFolderFiles] = useState<ProjectImportFile[]>([]);
  const [folderName, setFolderName] = useState<string>("");
  const [projectName, setProjectName] = useState<string>("");
  const [projectDescription, setProjectDescription] = useState<string>("");

  // Analysis / detection state
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [fileCount, setFileCount] = useState<number>(0);
  const [totalSize, setTotalSize] = useState<number>(0);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submissionProgress, setSubmissionProgress] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);

  // Drag states
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const zipInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const resetState = () => {
    setSelectedZip(null);
    setFolderFiles([]);
    setFolderName("");
    setProjectName("");
    setProjectDescription("");
    setDetection(null);
    setFileCount(0);
    setTotalSize(0);
    setError(null);
    setIsAnalyzing(false);
    setIsSubmitting(false);
    setIsSuccess(false);
    setSubmissionProgress("");
  };

  const handleClose = () => {
    if (isSubmitting) return;
    resetState();
    onClose();
  };

  // Analyze a ZIP file client-side
  const processZipFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".zip")) {
      setError("Please select a valid .zip archive.");
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      setError("ZIP archive exceeds the maximum upload limit of 50MB. Please remove heavy dependencies or build artifacts.");
      return;
    }

    setError(null);
    setSelectedZip(file);
    setIsAnalyzing(true);
    setTotalSize(file.size);

    try {
      const buffer = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(buffer);

      const previewFiles: { path: string; name: string; content?: string }[] = [];
      let validFileCount = 0;

      const nonDirEntries = Object.keys(zip.files).filter((p) => !zip.files[p].dir);
      let commonPrefix = "";
      if (nonDirEntries.length > 0) {
        const firstSlash = nonDirEntries[0].indexOf("/");
        if (firstSlash !== -1) {
          const candidate = nonDirEntries[0].slice(0, firstSlash + 1);
          if (nonDirEntries.every((p) => p.startsWith(candidate))) {
            commonPrefix = candidate;
          }
        }
      }

      for (const [rawPath, entry] of Object.entries(zip.files)) {
        if (entry.dir) continue;
        let clean = rawPath.replace(/\\/g, "/").replace(/^\/+/, "");
        if (commonPrefix && clean.startsWith(commonPrefix)) {
          clean = clean.slice(commonPrefix.length);
        }
        if (!clean) continue;

        const lower = clean.toLowerCase();
        const parts = lower.split("/");
        if (parts.some((p) => IGNORED_DIR_NAMES.has(p))) continue;
        const fileName = clean.split("/").pop() || "";
        if (IGNORED_FILE_NAMES.has(fileName.toLowerCase())) continue;

        validFileCount++;

        if (
          fileName === "package.json" ||
          fileName === "requirements.txt" ||
          fileName === "Cargo.toml" ||
          fileName === "go.mod" ||
          fileName === "index.html"
        ) {
          try {
            const text = await entry.async("string");
            previewFiles.push({ path: clean, name: fileName, content: text });
          } catch {
            previewFiles.push({ path: clean, name: fileName });
          }
        } else {
          previewFiles.push({ path: clean, name: fileName });
        }
      }

      if (validFileCount === 0) {
        setError("No valid source files found inside this ZIP archive.");
        setSelectedZip(null);
        setIsAnalyzing(false);
        return;
      }

      setFileCount(validFileCount);
      const detected = detectProjectFramework(previewFiles);
      setDetection(detected);

      // Auto-suggest project name
      let suggestedName = file.name.replace(/\.zip$/i, "").replace(/[-_]/g, " ");
      if (commonPrefix) {
        suggestedName = commonPrefix.replace(/\/$/, "").replace(/[-_]/g, " ");
      }
      const pkgEntry = previewFiles.find((f) => f.name === "package.json");
      if (pkgEntry?.content) {
        try {
          const parsed = JSON.parse(pkgEntry.content);
          if (parsed.name) suggestedName = parsed.name;
        } catch {
          // ignore
        }
      }
      setProjectName(suggestedName);
    } catch (err) {
      console.error("Failed to parse ZIP archive:", err);
      setError("Unable to read this ZIP archive. The file may be corrupt or encrypted.");
      setSelectedZip(null);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Folder selection via modern File System Access API or webkitdirectory
  const handleSelectFolder = async () => {
    setError(null);

    // If browser supports showDirectoryPicker
    if (typeof window !== "undefined" && "showDirectoryPicker" in window) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const dirHandle = await (window as any).showDirectoryPicker();
        setIsAnalyzing(true);
        const collected: ProjectImportFile[] = [];
        let accumulatedBytes = 0;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async function readDir(handle: any, currentPath: string = "") {
          for await (const entry of handle.values()) {
            if (IGNORED_DIR_NAMES.has(entry.name.toLowerCase())) {
              continue;
            }

            const path = currentPath ? `${currentPath}/${entry.name}` : entry.name;

            if (entry.kind === "file") {
              if (IGNORED_FILE_NAMES.has(entry.name.toLowerCase())) continue;

              const file = await entry.getFile();
              accumulatedBytes += file.size;

              const { content } = await readFileContent(file);

              collected.push({
                name: entry.name,
                path,
                content,
                isFolder: false,
                size: file.size,
                mimeType: file.type,
              });
            } else if (entry.kind === "directory") {
              await readDir(entry, path);
            }
          }
        }

        await readDir(dirHandle);

        if (collected.length === 0) {
          setError("No valid source files found in the selected folder.");
          setIsAnalyzing(false);
          return;
        }

        if (accumulatedBytes > 50 * 1024 * 1024) {
          setError(`Selected folder exceeds 50MB (${(accumulatedBytes / (1024 * 1024)).toFixed(1)} MB). Please exclude heavy media or build folders.`);
          setIsAnalyzing(false);
          return;
        }

        setFolderFiles(collected);
        setFolderName(dirHandle.name || "Selected Folder");
        setFileCount(collected.length);
        setTotalSize(accumulatedBytes);

        const detected = detectProjectFramework(collected);
        setDetection(detected);

        let suggestedName = dirHandle.name || "Imported Project";
        const pkgEntry = collected.find((f) => f.path === "package.json");
        if (pkgEntry?.content) {
          try {
            const parsed = JSON.parse(pkgEntry.content);
            if (parsed.name) suggestedName = parsed.name;
          } catch {
            // ignore
          }
        }
        setProjectName(suggestedName);
        setIsAnalyzing(false);
        return;
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") {
          setIsAnalyzing(false);
          return;
        }
        console.warn("showDirectoryPicker failed, falling back to input:", err);
      }
    }

    // Fallback: trigger input element
    setIsAnalyzing(false);
    if (folderInputRef.current) {
      folderInputRef.current.value = "";
      folderInputRef.current.click();
    }
  };

  const handleFolderInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsAnalyzing(true);
    setError(null);

    const collected: ProjectImportFile[] = [];
    let detectedRootName = "";
    let accumulatedBytes = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const relativePath = (file.webkitRelativePath || file.name).replace(/\\/g, "/");
      const parts = relativePath.split("/");

      if (!detectedRootName && parts.length > 1) {
        detectedRootName = parts[0];
      }

      // Strip top root folder name so project starts at project root
      const trimmedPath = parts.length > 1 ? parts.slice(1).join("/") : relativePath;
      if (!trimmedPath) continue;

      const trimmedLower = trimmedPath.toLowerCase();
      const pathSegments = trimmedLower.split("/");
      if (pathSegments.some((p) => IGNORED_DIR_NAMES.has(p))) continue;
      if (IGNORED_FILE_NAMES.has(file.name.toLowerCase())) continue;

      accumulatedBytes += file.size;

      const { content } = await readFileContent(file);

      collected.push({
        name: file.name,
        path: trimmedPath,
        content,
        isFolder: false,
        size: file.size,
        mimeType: file.type,
      });
    }

    if (collected.length === 0) {
      setError("No valid source files found in the selected directory.");
      setIsAnalyzing(false);
      return;
    }

    if (accumulatedBytes > 50 * 1024 * 1024) {
      setError(`Selected folder exceeds 50MB (${(accumulatedBytes / (1024 * 1024)).toFixed(1)} MB). Please exclude heavy media or build folders.`);
      setIsAnalyzing(false);
      return;
    }

    setFolderFiles(collected);
    setFolderName(detectedRootName || "Selected Folder");
    setFileCount(collected.length);
    setTotalSize(accumulatedBytes);

    const detected = detectProjectFramework(collected);
    setDetection(detected);

    let suggestedName = detectedRootName ? detectedRootName.replace(/[-_]/g, " ") : "Imported Project";
    const pkgEntry = collected.find((f) => f.path === "package.json");
    if (pkgEntry?.content) {
      try {
        const parsed = JSON.parse(pkgEntry.content);
        if (parsed.name) suggestedName = parsed.name;
      } catch {
        // ignore
      }
    }
    setProjectName(suggestedName);
    setIsAnalyzing(false);
  };

  // Submit project import
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!projectName.trim()) {
      setError("Please provide a project name.");
      return;
    }

    if (activeTab === "zip" && !selectedZip) {
      setError("Please select or drop a ZIP archive first.");
      return;
    }

    if (activeTab === "folder" && folderFiles.length === 0) {
      setError("Please select a local project directory first.");
      return;
    }

    setError(null);
    setIsSubmitting(true);
    setSubmissionProgress("Preparing project upload...");

    try {
      let createdProjectId = "";

      if (activeTab === "zip" && selectedZip) {
        setSubmissionProgress("Encoding ZIP archive...");
        const dataUrl = await readFileAsDataUrl(selectedZip);
        const zipBase64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;

        setSubmissionProgress("Uploading project to cloud workspace...");
        const res = await cloudApi.projects.importArchive({
          name: projectName.trim(),
          description: projectDescription.trim() || undefined,
          zipBase64,
        });
        createdProjectId = res.project.id;
      } else {
        setSubmissionProgress(`Uploading ${folderFiles.length} files to cloud workspace...`);
        const res = await cloudApi.projects.importFiles({
          name: projectName.trim(),
          description: projectDescription.trim() || undefined,
          files: folderFiles,
        });
        createdProjectId = res.project.id;
      }

      setSubmissionProgress("Writing workspace files & launching editor...");
      setIsSuccess(true);

      setTimeout(() => {
        if (onImported) {
          onImported(createdProjectId);
        } else {
          router.push(`/editor/${createdProjectId}`);
        }
        handleClose();
      }, 500);
    } catch (err) {
      console.error("Import error:", err);
      setError(err instanceof Error ? err.message : "Failed to import project.");
      setIsSubmitting(false);
      setIsSuccess(false);
      setSubmissionProgress("");
    }
  };

  // Drag and drop handlers for ZIP
  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      processZipFile(file);
    }
  };

  return (
    <div
      onClick={handleClose}
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150 select-none font-sans"
    >
      {/* Hidden file input for webkitdirectory */}
      <input
        ref={folderInputRef}
        type="file"
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {...({ webkitdirectory: "", directory: "" } as any)}
        multiple
        onChange={handleFolderInputChange}
        className="hidden"
      />

      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-white border border-[#e5e7eb] rounded-xl shadow-2xl overflow-hidden my-auto"
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[#e5e7eb] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-blue-50 text-[#0d99ff] flex items-center justify-center border border-blue-100 shadow-2xs">
              <Upload className="w-3.5 h-3.5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-neutral-900">Import Project from PC</h2>
              <p className="text-[11px] text-neutral-500">
                Load a local project folder or ZIP archive into your Code Editor.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="p-1 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded-md transition cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Tab switch: Local Folder vs ZIP Archive */}
        <div className="px-5 pt-3 border-b border-[#f0f0f2] flex items-center gap-4">
          <button
            type="button"
            onClick={() => {
              if (isSubmitting) return;
              setActiveTab("folder");
              setError(null);
            }}
            className={`pb-2 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition cursor-pointer ${
              activeTab === "folder"
                ? "border-[#0d99ff] text-[#0d99ff]"
                : "border-transparent text-neutral-500 hover:text-neutral-800"
            }`}
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>Select Local Folder</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (isSubmitting) return;
              setActiveTab("zip");
              setError(null);
            }}
            className={`pb-2 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition cursor-pointer ${
              activeTab === "zip"
                ? "border-[#0d99ff] text-[#0d99ff]"
                : "border-transparent text-neutral-500 hover:text-neutral-800"
            }`}
          >
            <FileArchive className="w-3.5 h-3.5" />
            <span>Upload ZIP Archive</span>
          </button>
        </div>

        {/* Form Content */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Error Message */}
          {error && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2 text-xs text-rose-800">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Success Banner */}
          {isSuccess && (
            <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-xs text-emerald-800">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>Project imported successfully! Launching editor...</span>
            </div>
          )}

          {/* Tab 1: Local Folder Picker */}
          {activeTab === "folder" && (
            <div className="space-y-2.5">
              <div className="p-4 border border-dashed border-[#e5e7eb] rounded-xl flex flex-col items-center justify-center text-center bg-[#fafafa] space-y-2.5">
                <div className="w-9 h-9 rounded-lg bg-white border border-[#e5e7eb] shadow-2xs flex items-center justify-center mx-auto text-amber-500">
                  <FolderOpen className="w-4 h-4" />
                </div>
                <div className="space-y-0.5">
                  <h4 className="text-xs font-semibold text-neutral-900">
                    {folderFiles.length > 0
                      ? `Loaded: ${folderName || "Project Folder"}`
                      : "Select an existing project directory"}
                  </h4>
                  <p className="text-[11px] text-neutral-500 max-w-sm">
                    {folderFiles.length > 0
                      ? `${fileCount} source files ready (${(totalSize / (1024 * 1024)).toFixed(1)} MB)`
                      : "Preserves nested files, Next.js App Router, React, components, and assets. Automatically excludes node_modules and build artifacts."}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleSelectFolder}
                  disabled={isSubmitting}
                  className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-white rounded-md text-xs font-semibold shadow-xs transition cursor-pointer flex items-center gap-1.5"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>{folderFiles.length > 0 ? "Choose Different Folder" : "Browse Project Folder"}</span>
                </button>
              </div>

              {/* Sample Files Preview Pills */}
              {folderFiles.length > 0 && (
                <div className="p-2 bg-neutral-50 border border-[#e5e7eb] rounded-lg space-y-1 text-[11px]">
                  <div className="flex items-center justify-between text-neutral-500 px-1 font-medium">
                    <span>Folder contents preview</span>
                    <span>{folderFiles.length} files</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {folderFiles.slice(0, 5).map((f) => (
                      <span
                        key={f.path}
                        className="px-2 py-0.5 bg-white border border-neutral-200 rounded text-[10px] text-neutral-700 font-mono truncate max-w-[180px]"
                      >
                        {f.path}
                      </span>
                    ))}
                    {folderFiles.length > 5 && (
                      <span className="px-1.5 py-0.5 text-neutral-400 text-[10px]">
                        +{folderFiles.length - 5} more
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab 2: ZIP Upload Area */}
          {activeTab === "zip" && (
            <div className="space-y-2.5">
              <input
                ref={zipInputRef}
                type="file"
                accept=".zip"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    processZipFile(e.target.files[0]);
                  }
                }}
                className="hidden"
              />

              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => !isSubmitting && zipInputRef.current?.click()}
                className={`p-5 border border-dashed rounded-xl flex flex-col items-center justify-center text-center cursor-pointer transition ${
                  isDragging
                    ? "border-[#0d99ff] bg-blue-50/50"
                    : selectedZip
                    ? "border-emerald-400 bg-emerald-50/20"
                    : "border-[#e5e7eb] hover:border-neutral-400 bg-[#fafafa] hover:bg-neutral-50"
                }`}
              >
                {selectedZip ? (
                  <div className="space-y-1">
                    <CheckCircle2 className="w-7 h-7 text-emerald-500 mx-auto" />
                    <h4 className="text-xs font-semibold text-neutral-900">{selectedZip.name}</h4>
                    <p className="text-[11px] text-neutral-500 font-mono">
                      {(selectedZip.size / (1024 * 1024)).toFixed(2)} MB • Click or drop to change
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="w-8 h-8 rounded-md bg-white border border-[#e5e7eb] shadow-2xs flex items-center justify-center mx-auto text-[#0d99ff]">
                      <FileArchive className="w-4 h-4" />
                    </div>
                    <h4 className="text-xs font-semibold text-neutral-900">
                      Drag and drop your project ZIP here
                    </h4>
                    <p className="text-[11px] text-neutral-500">
                      or click to browse from your computer (max 50MB)
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Analyzing Spinner */}
          {isAnalyzing && (
            <div className="p-2.5 bg-blue-50 border border-blue-100 rounded-lg flex items-center gap-2 text-xs text-blue-900 animate-pulse">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#0d99ff]" />
              <span>Scanning project structure & framework dependencies...</span>
            </div>
          )}

          {/* Framework Detection Summary Card */}
          {detection && !isAnalyzing && (
            <div className="p-3 bg-neutral-50 border border-[#e5e7eb] rounded-lg space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#0d99ff]" />
                  <span className="text-xs font-semibold text-neutral-900">Detected Environment</span>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-blue-100 text-[#0d99ff] text-[10px] font-semibold border border-blue-200">
                  {detection.frameworkName}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 pt-1 text-[11px] font-mono text-neutral-600 border-t border-neutral-200/60">
                <div>
                  <span className="text-neutral-400 block text-[10px] font-sans">Runtime</span>
                  <span className="font-medium text-neutral-800">{detection.runtime}</span>
                </div>
                <div>
                  <span className="text-neutral-400 block text-[10px] font-sans">Language</span>
                  <span className="font-medium text-neutral-800">{detection.language}</span>
                </div>
                <div>
                  <span className="text-neutral-400 block text-[10px] font-sans">Files</span>
                  <span className="font-medium text-neutral-800">{fileCount} items</span>
                </div>
              </div>
            </div>
          )}

          {/* Project Details Fields */}
          <div className="space-y-2.5 pt-0.5">
            <div className="space-y-1">
              <label className="text-xs font-medium text-neutral-800 block">Project Name *</label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="e.g. my-awesome-app"
                required
                disabled={isSubmitting}
                className="w-full bg-[#fafafa] border border-[#e5e7eb] focus:border-[#0d99ff] focus:bg-white rounded-lg px-3 py-1.5 text-xs text-neutral-900 outline-none transition"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-neutral-800 block">
                Description <span className="text-neutral-400 font-normal">(Optional)</span>
              </label>
              <input
                type="text"
                value={projectDescription}
                onChange={(e) => setProjectDescription(e.target.value)}
                placeholder="Brief summary of this application"
                disabled={isSubmitting}
                className="w-full bg-[#fafafa] border border-[#e5e7eb] focus:border-[#0d99ff] focus:bg-white rounded-lg px-3 py-1.5 text-xs text-neutral-900 outline-none transition"
              />
            </div>
          </div>

          {/* Actions Footer */}
          <div className="flex items-center justify-between pt-2 border-t border-[#f0f0f2]">
            <div className="flex items-center gap-1.5 text-[11px] text-neutral-400">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span>Safe workspace import</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleClose}
                disabled={isSubmitting}
                className="px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-100 rounded-md transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={
                  isSubmitting ||
                  !projectName.trim() ||
                  (activeTab === "zip" ? !selectedZip : folderFiles.length === 0)
                }
                className="px-4 py-1.5 bg-[#0d99ff] hover:bg-[#0b87e3] disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-md shadow-2xs transition cursor-pointer flex items-center gap-1.5"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>{submissionProgress || "Importing..."}</span>
                  </>
                ) : (
                  <>
                    <span>Import Project</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
