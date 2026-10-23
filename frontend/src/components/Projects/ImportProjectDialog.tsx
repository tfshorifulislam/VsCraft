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
  ShieldAlert,
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

export default function ImportProjectDialog({
  isOpen,
  onClose,
  onImported,
}: ImportProjectDialogProps) {
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<"zip" | "folder">("zip");
  const [selectedZip, setSelectedZip] = useState<File | null>(null);
  const [folderFiles, setFolderFiles] = useState<ProjectImportFile[]>([]);
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");

  // Analysis / detection state
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [fileCount, setFileCount] = useState<number>(0);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submissionProgress, setSubmissionProgress] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  // Drag states
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const zipInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const resetState = () => {
    setSelectedZip(null);
    setFolderFiles([]);
    setProjectName("");
    setProjectDescription("");
    setDetection(null);
    setFileCount(0);
    setError(null);
    setIsAnalyzing(false);
    setIsSubmitting(false);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  // Analyze a ZIP file client-side
  const processZipFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".zip")) {
      setError("Please select a valid .zip archive.");
      return;
    }

    setError(null);
    setSelectedZip(file);
    setIsAnalyzing(true);

    try {
      const buffer = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(buffer);

      const previewFiles: { path: string; name: string; content?: string }[] = [];
      let validFileCount = 0;

      for (const [path, entry] of Object.entries(zip.files)) {
        if (entry.dir) continue;
        if (
          path.includes("node_modules/") ||
          path.includes(".git/") ||
          path.includes(".next/") ||
          path.includes("dist/") ||
          path.includes("build/") ||
          path.includes("__pycache__/")
        ) {
          continue;
        }

        validFileCount++;
        const fileName = path.split("/").pop() || "";

        // Read package.json or requirements.txt or Cargo.toml for framework detection
        if (
          fileName === "package.json" ||
          fileName === "requirements.txt" ||
          fileName === "Cargo.toml" ||
          fileName === "go.mod" ||
          fileName === "index.html"
        ) {
          try {
            const text = await entry.async("string");
            previewFiles.push({ path, name: fileName, content: text });
          } catch {
            // ignore preview read error
          }
        } else {
          previewFiles.push({ path, name: fileName });
        }
      }

      setFileCount(validFileCount);
      const detected = detectProjectFramework(previewFiles);
      setDetection(detected);

      // Default project name from file or package.json
      if (!projectName) {
        let suggestedName = file.name.replace(/\.zip$/i, "").replace(/[-_]/g, " ");
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
      }
    } catch (err) {
      console.error("Failed to parse ZIP archive:", err);
      setError("Unable to read this ZIP archive. The file may be corrupt or encrypted.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Folder selection via modern File System Access API or webkitdirectory
  const handleSelectFolder = async () => {
    setError(null);
    setIsAnalyzing(true);

    // If browser supports showDirectoryPicker
    if (typeof window !== "undefined" && "showDirectoryPicker" in window) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const dirHandle = await (window as any).showDirectoryPicker();
        const collected: ProjectImportFile[] = [];

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async function readDir(handle: any, currentPath: string = "") {
          for await (const entry of handle.values()) {
            if (
              entry.name === "node_modules" ||
              entry.name === ".git" ||
              entry.name === ".next" ||
              entry.name === "dist" ||
              entry.name === "build" ||
              entry.name === "__pycache__"
            ) {
              continue;
            }

            const path = currentPath ? `${currentPath}/${entry.name}` : entry.name;

            if (entry.kind === "file") {
              const file = await entry.getFile();
              const ext = entry.name.split(".").pop()?.toLowerCase() || "";
              const isImage = ["png", "jpg", "jpeg", "webp", "gif", "ico", "bmp", "avif"].includes(ext);

              let content = "";
              if (isImage) {
                const buf = await file.arrayBuffer();
                const b64 = Buffer.from(buf).toString("base64");
                content = `data:${file.type || "application/octet-stream"};base64,${b64}`;
              } else {
                content = await file.text();
              }

              collected.push({
                name: entry.name,
                path,
                content,
                isFolder: false,
                size: file.size,
                mimeType: file.type,
              });
            } else if (entry.kind === "directory") {
              collected.push({
                name: entry.name,
                path,
                content: "",
                isFolder: true,
              });
              await readDir(entry, path);
            }
          }
        }

        await readDir(dirHandle);

        if (collected.length === 0) {
          setError("No files found in selected directory.");
          setIsAnalyzing(false);
          return;
        }

        setFolderFiles(collected);
        setFileCount(collected.filter((f) => !f.isFolder).length);
        const detected = detectProjectFramework(collected);
        setDetection(detected);

        if (!projectName) {
          setProjectName(dirHandle.name || "Imported Project");
        }
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

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      // webkitRelativePath format: "folderName/subfolder/file.js"
      const relativePath = file.webkitRelativePath || file.name;
      const parts = relativePath.split("/");

      if (!detectedRootName && parts.length > 1) {
        detectedRootName = parts[0];
      }

      // Strip top root folder name from path so workspace starts at the project root
      const trimmedPath = parts.length > 1 ? parts.slice(1).join("/") : relativePath;

      if (
        trimmedPath.includes("node_modules/") ||
        trimmedPath.includes(".git/") ||
        trimmedPath.includes(".next/") ||
        trimmedPath.includes("dist/") ||
        trimmedPath.includes("build/") ||
        trimmedPath.includes("__pycache__/")
      ) {
        continue;
      }

      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      const isImage = ["png", "jpg", "jpeg", "webp", "gif", "ico", "bmp", "avif"].includes(ext);

      let content = "";
      if (isImage) {
        const buf = await file.arrayBuffer();
        const b64 = Buffer.from(buf).toString("base64");
        content = `data:${file.type || "application/octet-stream"};base64,${b64}`;
      } else {
        content = await file.text();
      }

      collected.push({
        name: file.name,
        path: trimmedPath,
        content,
        isFolder: false,
        size: file.size,
        mimeType: file.type,
      });
    }

    setFolderFiles(collected);
    setFileCount(collected.length);
    const detected = detectProjectFramework(collected);
    setDetection(detected);

    if (!projectName && detectedRootName) {
      setProjectName(detectedRootName.replace(/[-_]/g, " "));
    }
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
    setSubmissionProgress("Preparing project workspace...");

    try {
      let createdProjectId = "";

      if (activeTab === "zip" && selectedZip) {
        setSubmissionProgress("Uploading archive to cloud...");
        const formData = new FormData();
        formData.append("file", selectedZip);
        formData.append("name", projectName.trim());
        if (projectDescription.trim()) {
          formData.append("description", projectDescription.trim());
        }

        const res = await cloudApi.projects.importArchive(formData);
        createdProjectId = res.project.id;
      } else {
        setSubmissionProgress(`Importing ${folderFiles.length} files to cloud...`);
        const res = await cloudApi.projects.importFiles({
          name: projectName.trim(),
          description: projectDescription.trim() || undefined,
          files: folderFiles,
        });
        createdProjectId = res.project.id;
      }

      setSubmissionProgress("Finalizing environment...");
      if (onImported) {
        onImported(createdProjectId);
      } else {
        router.push(`/editor/${createdProjectId}`);
      }
      handleClose();
    } catch (err) {
      console.error("Import error:", err);
      setError(err instanceof Error ? err.message : "Failed to import project.");
      setIsSubmitting(false);
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
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200"
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
        className="w-full max-w-xl bg-white border border-[#eaeaea] rounded-2xl shadow-2xl overflow-hidden my-auto"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#eaeaea] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-[var(--color-primary)] flex items-center justify-center border border-purple-100">
              <Upload className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#171717]">Import Existing Project</h2>
              <p className="text-xs text-neutral-500">
                Load a local repository or ZIP archive directly into your cloud IDE.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded-lg transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab switch: ZIP Archive vs Local Folder */}
        <div className="px-6 pt-4 border-b border-[#f0f0f0] flex items-center gap-4">
          <button
            type="button"
            onClick={() => {
              setActiveTab("zip");
              setError(null);
            }}
            className={`pb-2.5 text-xs font-semibold flex items-center gap-2 border-b-2 transition cursor-pointer ${
              activeTab === "zip"
                ? "border-[var(--color-primary)] text-[var(--color-primary)]"
                : "border-transparent text-neutral-500 hover:text-neutral-800"
            }`}
          >
            <FileArchive className="w-4 h-4" />
            <span>Upload ZIP Archive</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("folder");
              setError(null);
            }}
            className={`pb-2.5 text-xs font-semibold flex items-center gap-2 border-b-2 transition cursor-pointer ${
              activeTab === "folder"
                ? "border-[var(--color-primary)] text-[var(--color-primary)]"
                : "border-transparent text-neutral-500 hover:text-neutral-800"
            }`}
          >
            <FolderOpen className="w-4 h-4" />
            <span>Select Local Folder</span>
          </button>
        </div>

        {/* Form Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Error Message */}
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2.5 text-xs text-rose-800">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Active Tab: ZIP Upload Area */}
          {activeTab === "zip" && (
            <div className="space-y-3">
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
                onClick={() => zipInputRef.current?.click()}
                className={`p-6 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center text-center cursor-pointer transition ${
                  isDragging
                    ? "border-[var(--color-primary)] bg-purple-50/50"
                    : selectedZip
                    ? "border-emerald-400 bg-emerald-50/30"
                    : "border-neutral-300 hover:border-neutral-400 bg-neutral-50/50 hover:bg-neutral-50"
                }`}
              >
                {selectedZip ? (
                  <div className="space-y-1.5">
                    <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
                    <h4 className="text-xs font-bold text-[#171717]">{selectedZip.name}</h4>
                    <p className="text-[11px] text-neutral-500 font-mono">
                      {(selectedZip.size / (1024 * 1024)).toFixed(2)} MB • Click or drop to change
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="w-10 h-10 rounded-xl bg-white border border-[#eaeaea] shadow-2xs flex items-center justify-center mx-auto text-[var(--color-primary)]">
                      <FileArchive className="w-5 h-5" />
                    </div>
                    <h4 className="text-xs font-bold text-[#171717]">
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

          {/* Active Tab: Local Folder Picker Area */}
          {activeTab === "folder" && (
            <div className="space-y-3">
              <div className="p-6 border-2 border-dashed border-neutral-300 rounded-2xl flex flex-col items-center justify-center text-center bg-neutral-50/50 space-y-3">
                <div className="w-10 h-10 rounded-xl bg-white border border-[#eaeaea] shadow-2xs flex items-center justify-center mx-auto text-amber-500">
                  <FolderOpen className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-[#171717]">
                    {folderFiles.length > 0
                      ? `Directory Loaded: ${projectName || "Project"}`
                      : "Choose a local folder to import"}
                  </h4>
                  <p className="text-[11px] text-neutral-500 max-w-sm">
                    Antigravity safely inspects your local folder, filters out heavy build artifacts
                    (like <code className="bg-neutral-200/80 px-1 py-0.5 rounded text-[10px]">node_modules</code>),
                    and uploads the project files into your cloud environment.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleSelectFolder}
                  className="px-4 py-2 bg-neutral-800 hover:bg-neutral-900 text-white rounded-xl text-xs font-semibold shadow-xs transition cursor-pointer flex items-center gap-2"
                >
                  <FolderOpen className="w-4 h-4" />
                  <span>{folderFiles.length > 0 ? "Select Different Folder" : "Browse Folder"}</span>
                </button>
              </div>
            </div>
          )}

          {/* Analyzing Spinner */}
          {isAnalyzing && (
            <div className="p-3 bg-purple-50 border border-purple-100 rounded-xl flex items-center gap-2.5 text-xs text-purple-900 animate-pulse">
              <Loader2 className="w-4 h-4 animate-spin text-[var(--color-primary)]" />
              <span>Analyzing dependencies, framework, and language configuration...</span>
            </div>
          )}

          {/* Framework Detection Summary Card */}
          {detection && !isAnalyzing && (
            <div className="p-3.5 bg-neutral-50 border border-neutral-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[var(--color-primary)]" />
                  <span className="text-xs font-bold text-[#171717]">Detected Framework & Runtime</span>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-purple-100 text-[var(--color-primary)] text-[10px] font-bold">
                  {detection.frameworkName}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 pt-1 text-[11px] border-t border-neutral-200/80 font-mono text-neutral-600">
                <div>
                  <span className="text-neutral-400 block text-[10px] uppercase font-sans">Runtime</span>
                  <span className="font-semibold text-neutral-800">{detection.runtime}</span>
                </div>
                <div>
                  <span className="text-neutral-400 block text-[10px] uppercase font-sans">Language</span>
                  <span className="font-semibold text-neutral-800">{detection.language}</span>
                </div>
                <div>
                  <span className="text-neutral-400 block text-[10px] uppercase font-sans">Workspace Files</span>
                  <span className="font-semibold text-neutral-800">{fileCount} files</span>
                </div>
              </div>
            </div>
          )}

          {/* Project Details Fields */}
          <div className="space-y-3 pt-1">
            <div className="space-y-1">
              <label className="text-xs font-bold text-[#171717] block">Project Name *</label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="e.g. awesome-portfolio"
                required
                className="w-full bg-[#fbfbfb] border border-[#dcdcdc] focus:border-[var(--color-primary)] rounded-xl px-3.5 py-2 text-xs text-[#171717] outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-[#171717] block">
                Description <span className="text-neutral-400 font-normal">(Optional)</span>
              </label>
              <input
                type="text"
                value={projectDescription}
                onChange={(e) => setProjectDescription(e.target.value)}
                placeholder="Brief summary of this imported application"
                className="w-full bg-[#fbfbfb] border border-[#dcdcdc] focus:border-[var(--color-primary)] rounded-xl px-3.5 py-2 text-xs text-[#171717] outline-none"
              />
            </div>
          </div>

          {/* Actions Footer */}
          <div className="flex items-center justify-between pt-2 border-t border-[#eaeaea]">
            <div className="flex items-center gap-1.5 text-[11px] text-neutral-400">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Safe sandbox • Zip slip protected</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleClose}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-semibold text-neutral-600 hover:bg-neutral-100 rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || (activeTab === "zip" ? !selectedZip : folderFiles.length === 0)}
                className="px-5 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer flex items-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>{submissionProgress || "Importing..."}</span>
                  </>
                ) : (
                  <>
                    <span>Import to Cloud IDE</span>
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
