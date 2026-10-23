import React from "react";
import type { Metadata } from "next";
import EditorLayout from "@/components/Editor/EditorLayout";

interface EditorWorkspacePageProps {
  params: Promise<{ projectId: string }>;
}

export const metadata: Metadata = {
  title: "IDE Workspace — Code Editor",
  description:
    "Browser-based coding workspace with Monaco Editor, live web preview, and an intelligent AI coding assistant.",
};

export default async function EditorWorkspacePage({ params }: EditorWorkspacePageProps) {
  const { projectId } = await params;
  return <EditorLayout initialProjectId={projectId} />;
}

