"use client";

import React, { useDeferredValue, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Project } from "@/types/editor";
import { WorkspaceSearchIndex } from "@/lib/search/workspaceSearch";
import MaterialFileIcon from "./MaterialFileIcon";

interface WorkspaceSearchPanelProps {
  project: Project;
  onSelectFile: (fileId: string) => void;
}

function WorkspaceSearchPanel({ project, onSelectFile }: WorkspaceSearchPanelProps) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [index] = useState(() => new WorkspaceSearchIndex());
  const { results, indexedFiles, contentTruncated } = useMemo(() => {
    index.update(project.files);
    const results = index.search(deferredQuery);
    const stats = index.stats();
    return {
      results,
      indexedFiles: stats.files,
      contentTruncated: stats.lastContentTruncated,
    };
  }, [project.files, deferredQuery, index]);

  const isStale = query !== deferredQuery;

  return (
    <div className="flex-1 flex flex-col p-3 text-xs min-h-0">
      <span className="font-semibold text-neutral-400 uppercase tracking-wider mb-2">
        Search in Workspace
      </span>
      <div className="relative mb-2">
        <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-2.5 top-2.5" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search file names and loaded content..."
          className="w-full bg-[#1e1e1e] border border-[#3c3c3c] rounded pl-8 pr-2.5 py-1.5 text-white outline-none focus:border-[var(--color-primary)] font-mono text-xs"
        />
      </div>

      <div className="text-[10px] text-neutral-500 mb-2 space-y-0.5">
        <div>
          {indexedFiles.toLocaleString()} files indexed
          {isStale ? " · searching..." : ""}
        </div>
        <div>
          node_modules, .git, .next, dist, build, and similar generated folders are excluded by default.
        </div>
        {project.contentLazy && (
          <div>Content search covers files loaded in this session; file names cover the full tree.</div>
        )}
        {contentTruncated && (
          <div className="text-amber-400">
            Content search stopped after 16 MB of loaded text to keep typing responsive.
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
        {query.trim() === "" ? (
          <div className="text-neutral-500 italic p-2">Type to search workspace files...</div>
        ) : results.length === 0 && !isStale ? (
          <div className="text-neutral-500 italic p-2">No matching files.</div>
        ) : (
          results.map((result) => (
            <button
              key={`${result.id}:${result.match}`}
              type="button"
              onClick={() => onSelectFile(result.id)}
              className="w-full text-left p-2 rounded hover:bg-[#2a2d2e] flex flex-col gap-0.5 transition cursor-pointer"
            >
              <span className="font-medium text-white flex items-center gap-1.5 min-w-0">
                <MaterialFileIcon name={result.name} path={result.path} size={14} />
                <span className="truncate">{result.path}</span>
              </span>
              {result.match === "content" && (
                <span className="text-[10px] text-neutral-500">content match</span>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

export default React.memo(WorkspaceSearchPanel);
