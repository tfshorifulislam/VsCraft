"use client";

import React, { useState, useEffect } from "react";
import {
  Blocks,
  Search,
  Star,
  ExternalLink,
  Check,
  Server,
  Loader2,
  Cpu,
} from "lucide-react";
import { ExtensionItem } from "@/types/editor";
import {
  searchOpenVsxExtensions,
  loadInstalledExtensionIds,
  saveInstalledExtensionIds,
} from "@/lib/extensions/openVsxService";

const CATEGORIES = ["All", "Installed", "Language", "Themes", "Formatters", "Linters", "Tools"] as const;
type CategoryTab = (typeof CATEGORIES)[number];

export default function ExtensionsPanel() {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<CategoryTab>("All");
  const [installedIds, setInstalledIds] = useState<Set<string>>(() => loadInstalledExtensionIds());
  const [extensions, setExtensions] = useState<ExtensionItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [source, setSource] = useState<string>("open-vsx");
  const [selectedExtension, setSelectedExtension] = useState<ExtensionItem | null>(null);
  const [showRuntimeInfo, setShowRuntimeInfo] = useState<boolean>(false);

  useEffect(() => {
    let isCancelled = false;
    const cat = activeCategory === "Installed" || activeCategory === "All" ? "" : activeCategory;

    const timer = setTimeout(() => {
      searchOpenVsxExtensions(search, cat)
        .then((res) => {
          if (!isCancelled) {
            setExtensions(res.extensions);
            setSource(res.source);
            setIsLoading(false);
          }
        })
        .catch(() => {
          if (!isCancelled) setIsLoading(false);
        });
    }, 250);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [search, activeCategory]);

  const toggleInstall = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setInstalledIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      saveInstalledExtensionIds(next);
      return next;
    });
  };

  const displayedExtensions = extensions.filter((ext) => {
    if (activeCategory === "Installed") {
      return installedIds.has(ext.id);
    }
    return true;
  });

  return (
    <div className="h-full flex flex-col bg-[#252526] text-neutral-300 font-sans text-xs select-none">
      {/* Header */}
      <div className="p-3 border-b border-[#1e1e1e] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Blocks className="w-4 h-4 text-purple-400" />
          <span className="font-bold uppercase tracking-wider text-[11px] text-neutral-200">
            Extensions: Marketplace
          </span>
        </div>
        <button
          type="button"
          onClick={() => setShowRuntimeInfo((prev) => !prev)}
          title="Container Runtime & Open VSX Info"
          className="text-[10px] text-purple-300 hover:text-white px-2 py-0.5 rounded bg-purple-950/40 border border-purple-800/40 flex items-center gap-1 cursor-pointer"
        >
          <Server className="w-3 h-3" />
          <span>Open VSX</span>
        </button>
      </div>

      {/* Container Runtime Info Banner (Collapsible) */}
      {showRuntimeInfo && (
        <div className="p-3 bg-[#1e1e24] border-b border-[#30303b] space-y-2 text-[11px] text-neutral-300 animate-in fade-in duration-150">
          <div className="flex items-center justify-between font-semibold text-white">
            <span className="flex items-center gap-1.5 text-purple-300">
              <Cpu className="w-3.5 h-3.5" />
              <span>Dual Runtime Architecture</span>
            </span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 font-mono">
              Docker Ready
            </span>
          </div>
          <p className="text-neutral-400 leading-relaxed text-[11px]">
            Browser Monaco executes language clients, themes, and formatters directly.
            Full Node.js extension binaries run in the containerized{" "}
            <code className="text-purple-300 font-mono">openvscode-server</code>.
          </p>
          <div className="p-2 rounded bg-neutral-900/80 border border-neutral-800 font-mono text-[10px] space-y-1">
            <div className="text-neutral-400"># Start local container runtime:</div>
            <div className="text-emerald-400">docker compose up -d ide-server</div>
          </div>
        </div>
      )}

      {/* Search Bar */}
      <div className="p-3 border-b border-[#1e1e1e] space-y-2.5">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Open VSX Registry..."
            className="w-full bg-[#1e1e1e] border border-[#383838] focus:border-[var(--color-primary)] rounded-lg pl-8 pr-7 py-1.5 text-xs text-white outline-none"
          />
          {isLoading && (
            <Loader2 className="w-3.5 h-3.5 text-neutral-400 animate-spin absolute right-2.5 top-1/2 -translate-y-1/2" />
          )}
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {CATEGORIES.map((cat) => {
            const isActive = activeCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={`px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap transition cursor-pointer ${
                  isActive
                    ? "bg-[var(--color-primary)] text-white shadow-2xs font-semibold"
                    : "bg-[#1e1e1e] hover:bg-[#2b2b2b] text-neutral-400 hover:text-white"
                }`}
              >
                {cat}
                {cat === "Installed" && (
                  <span className="ml-1 opacity-75">({installedIds.size})</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Extensions List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {displayedExtensions.map((ext) => {
          const isInstalled = installedIds.has(ext.id);
          const isSelected = selectedExtension?.id === ext.id;

          return (
            <div
              key={ext.id}
              onClick={() => setSelectedExtension(isSelected ? null : ext)}
              className={`p-2.5 rounded-xl border transition cursor-pointer space-y-2 group ${
                isSelected
                  ? "bg-[#202026] border-[var(--color-primary)]/70 shadow-sm"
                  : "bg-[#1e1e1e]/60 hover:bg-[#1e1e1e] border-transparent hover:border-[#383838]"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2.5 min-w-0">
                  {ext.iconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={ext.iconUrl}
                      alt={ext.displayName}
                      className="w-8 h-8 rounded-lg shrink-0 object-contain bg-neutral-900 border border-neutral-700 p-0.5"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-lg shrink-0 bg-purple-950/40 border border-purple-800/40 flex items-center justify-center text-purple-400 font-bold font-mono text-xs">
                      {ext.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}

                  <div className="min-w-0">
                    <h4 className="font-semibold text-white text-xs truncate flex items-center gap-1.5">
                      <span>{ext.displayName}</span>
                      {isInstalled && (
                        <span className="text-[9px] bg-purple-500/20 text-[#c4b5fd] px-1.5 py-0.2 rounded font-mono">
                          Installed
                        </span>
                      )}
                    </h4>
                    <p className="text-[11px] text-neutral-400 mt-0.5 line-clamp-2 leading-relaxed">
                      {ext.description}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(e) => toggleInstall(ext.id, e)}
                  className={`text-[11px] px-2.5 py-1 rounded-md font-semibold transition shrink-0 cursor-pointer ${
                    isInstalled
                      ? "bg-[#2b2b2b] text-neutral-300 hover:bg-rose-950 hover:text-rose-300"
                      : "bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white shadow-xs"
                  }`}
                >
                  {isInstalled ? "Disable" : "Install"}
                </button>
              </div>

              {/* Badges strip: Compatibility + License */}
              <div className="flex items-center gap-1.5 pt-0.5 flex-wrap">
                {ext.requiresContainerRuntime ? (
                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1 font-mono">
                    <Server className="w-2.5 h-2.5" />
                    <span>Container Runtime</span>
                  </span>
                ) : (
                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 font-mono">
                    <Check className="w-2.5 h-2.5" />
                    <span>Browser Compatible</span>
                  </span>
                )}

                <span className="text-[9px] px-1.5 py-0.2 rounded bg-neutral-800 text-neutral-400 font-mono">
                  {ext.category}
                </span>

                {ext.license && (
                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-neutral-800 text-neutral-400 font-mono">
                    {ext.license}
                  </span>
                )}
              </div>

              {/* Expanded details */}
              {isSelected && (
                <div className="pt-2 mt-2 border-t border-[#2e2e2e] space-y-2 text-[11px] text-neutral-400 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between text-neutral-300">
                    <span>Publisher: <span className="text-white font-mono">{ext.publisher}</span></span>
                    <span>Version: <span className="text-white font-mono">v{ext.version}</span></span>
                  </div>
                  {ext.repository && (
                    <a
                      href={ext.repository}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 text-[var(--color-primary)] hover:underline pt-0.5"
                    >
                      <span>View Source Repository</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              )}

              {/* Footer strip: downloads, rating */}
              <div className="flex items-center justify-between text-[10px] text-neutral-500 pt-1 border-t border-[#2a2a2a] font-mono">
                <span>{ext.publisher} • v{ext.version}</span>
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-0.5 text-amber-400">
                    <Star className="w-2.5 h-2.5 fill-current" />
                    {ext.rating}
                  </span>
                  <span>{ext.downloads} downloads</span>
                </div>
              </div>
            </div>
          );
        })}

        {displayedExtensions.length === 0 && !isLoading && (
          <div className="p-6 text-center space-y-2 select-none">
            <Blocks className="w-8 h-8 text-neutral-600 mx-auto" />
            <h4 className="text-xs font-semibold text-neutral-300">No extensions found</h4>
            <p className="text-[11px] text-neutral-500">
              Try searching for &quot;prettier&quot;, &quot;python&quot;, &quot;tailwind&quot;, or &quot;rust&quot;.
            </p>
          </div>
        )}
      </div>

      {/* Footer Status Bar */}
      <div className="h-6 px-3 bg-[#1e1e1e] border-t border-[#2d2d2d] flex items-center justify-between text-[10px] text-neutral-400 font-mono shrink-0">
        <span className="truncate">Source: {source === "open-vsx" ? "Open VSX Registry" : "Curated Registry"}</span>
        <span className="text-neutral-500">{installedIds.size} Active</span>
      </div>
    </div>
  );
}
