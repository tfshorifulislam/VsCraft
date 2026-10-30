import Link from "next/link";
import { FileCode2 } from "lucide-react";

export interface ProjectCardData {
  id: string;
  name: string;
  updatedAt: Date;
  filesCount: number;
}

const GRADIENTS = [
  "linear-gradient(135deg, #0d99ff 0%, #6c5ce7 100%)",
  "linear-gradient(135deg, #ff5c8a 0%, #ff9f43 100%)",
  "linear-gradient(135deg, #00c2a8 0%, #0d99ff 100%)",
  "linear-gradient(135deg, #8e44ad 0%, #ff5c8a 100%)",
  "linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)",
  "linear-gradient(135deg, #14b8a6 0%, #22c55e 100%)",
];

function gradientFor(id: string): string {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  }
  return GRADIENTS[hash % GRADIENTS.length];
}

function relativeTime(date: Date): string {
  const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, seconds] of units) {
    if (Math.abs(diffSeconds) >= seconds || unit === "minute") {
      return formatter.format(Math.round(diffSeconds / seconds), unit);
    }
  }
  return "just now";
}

export default function ProjectCard({ project }: { project: ProjectCardData }) {
  return (
    <Link
      href={`/project/${project.id}`}
      className="group block overflow-hidden rounded-xl border border-[#e6e6e6] bg-white transition hover:-translate-y-0.5 hover:border-[#c9c9c9] hover:shadow-lg"
    >
      <div
        className="relative flex h-32 items-center justify-center"
        style={{ background: gradientFor(project.id) }}
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur">
          <FileCode2 className="h-6 w-6 text-white" />
        </div>
        <span className="absolute bottom-2 right-2 rounded-md bg-black/25 px-2 py-0.5 text-[10px] font-medium text-white/90 backdrop-blur">
          {project.filesCount} {project.filesCount === 1 ? "file" : "files"}
        </span>
      </div>
      <div className="px-4 py-3">
        <h3 className="truncate text-sm font-semibold text-[#1e1e1e]">
          {project.name}
        </h3>
        <p className="mt-0.5 text-xs text-[#8a8a8a]">
          Edited {relativeTime(project.updatedAt)}
        </p>
      </div>
    </Link>
  );
}
