"use client";

import { AlertCircle, CheckCircle2, FileWarning, FolderOpen, Loader2 } from "lucide-react";
import type { FolderImportProgress } from "@/lib/import/localFolderImport";

interface FolderImportOverlayProps {
  progress: FolderImportProgress | null;
  error: string | null;
  onDismissError: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function FolderImportOverlay({
  progress,
  error,
  onDismissError,
}: FolderImportOverlayProps) {
  if (!progress && !error) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-xl border border-[#e5e7eb] bg-white p-5 shadow-xl">
        {error ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-50">
                <AlertCircle className="h-4 w-4 text-rose-600" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-neutral-900">Folder import failed</h3>
                <p className="mt-1 break-words text-xs text-neutral-600">{error}</p>
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onDismissError}
                className="cursor-pointer rounded-md bg-[#0d99ff] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#0b87e3]"
              >
                Close
              </button>
            </div>
          </div>
        ) : progress ? (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50">
                  {progress.phase === "done" ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <FolderOpen className="h-4 w-4 text-[#0d99ff]" />
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-neutral-900">
                    {progress.phase === "done" ? "Import complete" : "Importing folder"}
                  </h3>
                  <p className="truncate text-xs text-neutral-500">
                    {progress.folderName || "Selected folder"}
                  </p>
                </div>
              </div>
              {progress.phase !== "done" && (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#0d99ff]" />
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-3 text-[11px] text-neutral-500">
                <span className="truncate">{progress.message}</span>
                {progress.totalBytes > 0 && (
                  <span className="shrink-0 font-mono">
                    {formatBytes(progress.uploadedBytes)} / {formatBytes(progress.totalBytes)}
                  </span>
                )}
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100">
                <div
                  className="h-full rounded-full bg-[#0d99ff] transition-all duration-200"
                  style={{
                    width:
                      progress.phase === "done"
                        ? "100%"
                        : progress.totalFiles > 0
                          ? `${Math.min(
                              100,
                              Math.round((progress.processedFiles / progress.totalFiles) * 100)
                            )}%`
                          : "8%",
                  }}
                />
              </div>
              {progress.phase !== "done" && (
                <p className="truncate font-mono text-[10px] text-neutral-400">
                  {progress.currentPath || "Preparing..."}
                </p>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2 rounded-lg border border-[#f0f0f2] bg-[#fafafa] p-2.5 text-center">
              <div>
                <p className="text-sm font-semibold text-neutral-900">{progress.processedFiles}</p>
                <p className="text-[10px] text-neutral-500">Files sent</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-neutral-900">{progress.foldersFound}</p>
                <p className="text-[10px] text-neutral-500">Folders</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-neutral-900">{progress.excludedCount}</p>
                <p className="text-[10px] text-neutral-500">Skipped</p>
              </div>
            </div>

            {progress.excludedCount > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[11px] text-amber-800">
                <FileWarning className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium">
                    Skipped dependency/build files
                    {progress.excludedPaths.length > 0
                      ? `: ${progress.excludedPaths.slice(0, 4).join(", ")}`
                      : "."}
                  </p>
                  <p className="mt-0.5 text-amber-700">
                    Reinstall dependencies after import if the project needs them.
                  </p>
                </div>
              </div>
            )}

            {progress.phase !== "done" && (
              <p className="rounded-md bg-neutral-50 p-2 text-[10px] leading-relaxed text-neutral-500">
                The folder is copied into Code Editor storage. Edits do not change the original
                local folder.
              </p>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
