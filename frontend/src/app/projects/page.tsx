import React from "react";
import type { Metadata } from "next";
import ProjectsDashboard from "@/components/Projects/ProjectsDashboard";

export const metadata: Metadata = {
  title: "Projects Dashboard — Code Editor",
  description:
    "Figma-inspired workspace dashboard. Create, manage, and launch your browser-based coding projects.",
};

export default function ProjectsPage() {
  return <ProjectsDashboard />;
}

