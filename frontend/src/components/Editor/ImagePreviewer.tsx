"use client";

import React, { useState, useRef } from "react";
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCcw,
  Copy,
  Check,
  Download,
  FileImage,
} from "lucide-react";
import { Project, ProjectFile } from "@/types/editor";

interface ImagePreviewerProps {
  activeFile: ProjectFile;
  project?: Project | null;
}

export function isImageFile(file: ProjectFile | null | undefined): boolean {
  if (!file || file.isFolder) return false;
  const ext = file.name.split(".").pop()?.toLowerCase();
  const imageExts = ["png", "jpg", "jpeg", "webp", "gif", "svg", "ico", "bmp", "avif"];
  return (
    imageExts.includes(ext || "") ||
    Boolean(file.mimeType && file.mimeType.startsWith("image/")) ||
    file.language === "image"
  );
}

export function getPublicRelativePath(path: string): string {
  const clean = path.replace(/^\/+/, "").replace(/\\/g, "/");
  if (clean.startsWith("public/")) {
    return `/${clean.replace(/^public\//, "")}`;
  }
  return `/${clean}`;
}

export default function ImagePreviewer({ activeFile, project }: ImagePreviewerProps) {
  const [zoom, setZoom] = useState<number>(1);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [fitToView, setFitToView] = useState<boolean>(true);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // Compute image src
  const imageSrc = React.useMemo(() => {
    if (activeFile.content.startsWith("data:image/")) {
      return activeFile.content;
    }
    if (activeFile.name.endsWith(".svg") && activeFile.content.trim().startsWith("<svg")) {
      return `data:image/svg+xml;utf8,${encodeURIComponent(activeFile.content)}`;
    }
    if (project?.id) {
      return `/api/projects/${project.id}/raw?fileId=${encodeURIComponent(activeFile.id)}`;
    }
    return activeFile.content;
  }, [activeFile, project]);

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const target = e.currentTarget;
    setDimensions({
      width: target.naturalWidth,
      height: target.naturalHeight,
    });
  };

  const handleZoomIn = () => {
    setFitToView(false);
    setZoom((prev) => Math.min(prev + 0.25, 4));
  };

  const handleZoomOut = () => {
    setFitToView(false);
    setZoom((prev) => Math.max(prev - 0.25, 0.25));
  };

  const handleResetZoom = () => {
    setFitToView(false);
    setZoom(1);
  };

  const handleToggleFit = () => {
    setFitToView((prev) => !prev);
    setZoom(1);
  };

  const formatFileSize = (bytes?: number): string => {
    if (!bytes && activeFile.content) {
      // Estimate from content length if not provided
      bytes = activeFile.content.length;
    }
    if (!bytes) return "Unknown size";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const publicPath = getPublicRelativePath(activeFile.path);

  const copyPath = () => {
    navigator.clipboard.writeText(publicPath);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadImage = () => {
    const a = document.createElement("a");
    a.href = imageSrc;
    a.download = activeFile.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const extension = activeFile.name.split(".").pop()?.toUpperCase() || "IMAGE";

  return (
    <div className="h-full w-full flex flex-col bg-[#1e1e1e] text-neutral-300 select-none overflow-hidden font-sans">
      {/* Top Toolbar */}
      <div className="h-10 px-4 bg-[#252526] border-b border-[#333333] flex items-center justify-between text-xs shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-neutral-300 font-medium">
            <FileImage className="w-4 h-4 text-purple-400" />
            <span className="truncate max-w-[180px] sm:max-w-xs">{activeFile.name}</span>
            <span className="px-1.5 py-0.2 bg-purple-500/20 text-[#c4b5fd] rounded text-[10px] font-mono uppercase">
              {extension}
            </span>
          </div>

          {dimensions && (
            <span className="hidden sm:inline-block text-[11px] text-neutral-400 font-mono">
              {dimensions.width} × {dimensions.height} px
            </span>
          )}

          <span className="hidden md:inline-block text-[11px] text-neutral-500 font-mono">
            {formatFileSize(activeFile.size)}
          </span>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5">
          {/* Zoom controls */}
          <div className="flex items-center bg-[#1e1e1e] border border-[#383838] rounded-md px-1 py-0.5 mr-2">
            <button
              type="button"
              onClick={handleZoomOut}
              title="Zoom Out"
              className="p-1 hover:text-white rounded hover:bg-[#2b2b2b] transition cursor-pointer"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-2 text-[11px] font-mono text-neutral-300 min-w-[42px] text-center">
              {fitToView ? "Fit" : `${Math.round(zoom * 100)}%`}
            </span>
            <button
              type="button"
              onClick={handleZoomIn}
              title="Zoom In"
              className="p-1 hover:text-white rounded hover:bg-[#2b2b2b] transition cursor-pointer"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleResetZoom}
              title="Reset Zoom to 100%"
              className="p-1 hover:text-white rounded hover:bg-[#2b2b2b] transition cursor-pointer ml-0.5 border-l border-[#333333]"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleToggleFit}
              title={fitToView ? "Actual Size" : "Fit to View"}
              className={`p-1 rounded transition cursor-pointer ml-0.5 ${
                fitToView ? "text-[var(--color-primary)] hover:text-white" : "hover:text-white"
              }`}
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Copy Relative Path Button */}
          <button
            type="button"
            onClick={copyPath}
            title={`Copy Relative Path: ${publicPath}`}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-[#2b2b2b] hover:bg-[#383838] text-neutral-200 hover:text-white rounded-md text-xs font-medium transition cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Path</span>
              </>
            )}
          </button>

          {/* Download Button */}
          <button
            type="button"
            onClick={downloadImage}
            title="Download Image"
            className="p-1.5 bg-[#2b2b2b] hover:bg-[#383838] text-neutral-300 hover:text-white rounded-md transition cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Preview Canvas with Checkerboard Transparency Grid */}
      <div
        className="flex-1 overflow-auto flex items-center justify-center p-6 relative"
        style={{
          backgroundImage: `
            linear-gradient(45deg, #252526 25%, transparent 25%),
            linear-gradient(-45deg, #252526 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, #252526 75%),
            linear-gradient(-45deg, transparent 75%, #252526 75%)
          `,
          backgroundSize: "20px 20px",
          backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
          backgroundColor: "#1a1a1a",
        }}
      >
        <div className="relative flex items-center justify-center transition-transform duration-150 ease-out shadow-2xl rounded-lg overflow-hidden border border-neutral-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={imageSrc}
            alt={activeFile.name}
            onLoad={handleImageLoad}
            style={{
              transform: fitToView ? "none" : `scale(${zoom})`,
              transformOrigin: "center center",
              maxHeight: fitToView ? "calc(100vh - 160px)" : "none",
              maxWidth: fitToView ? "calc(100vw - 360px)" : "none",
              objectFit: "contain",
              display: "block",
            }}
            className="select-none transition-transform"
          />
        </div>
      </div>

      {/* Footer Info Strip */}
      <div className="h-7 px-4 bg-[#1f1f1f] border-t border-[#2d2d2d] flex items-center justify-between text-[11px] text-neutral-400 font-mono shrink-0">
        <div className="flex items-center gap-3">
          <span>Path: <span className="text-neutral-200">{activeFile.path}</span></span>
          <span className="text-neutral-600">|</span>
          <span>Web URL: <span className="text-purple-300">{publicPath}</span></span>
        </div>
        <div className="flex items-center gap-2">
          {dimensions && <span>{dimensions.width}×{dimensions.height}px</span>}
          <span>{formatFileSize(activeFile.size)}</span>
        </div>
      </div>
    </div>
  );
}
