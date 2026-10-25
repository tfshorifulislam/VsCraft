"use client";

import React, { type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import type { EditorLayoutNode } from "@/types/editor";
import { MAX_SPLIT_RATIO, MIN_SPLIT_RATIO } from "@/lib/editor/editorGroups";

interface EditorSplitLayoutProps {
  node: EditorLayoutNode;
  renderGroup: (groupId: string) => ReactNode;
  onResize: (splitId: string, ratio: number) => void;
}

const RESIZE_STEP = 0.04;

function clampRatio(ratio: number) {
  return Math.min(Math.max(ratio, MIN_SPLIT_RATIO), MAX_SPLIT_RATIO);
}

function EditorSplitNode({
  node,
  renderGroup,
  onResize,
}: {
  node: Extract<EditorLayoutNode, { type: "split" }>;
  renderGroup: (groupId: string) => ReactNode;
  onResize: (splitId: string, ratio: number) => void;
}) {
  const isHorizontal = node.orientation === "horizontal";
  const separatorOrientation = isHorizontal ? "vertical" : "horizontal";

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const container = event.currentTarget.parentElement;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = isHorizontal ? "col-resize" : "row-resize";
    document.body.style.userSelect = "none";
    event.preventDefault();

    const onPointerMove = (moveEvent: globalThis.PointerEvent) => {
      if (!isHorizontal) {
        const next = clampRatio((moveEvent.clientY - rect.top) / Math.max(rect.height, 1));
        onResize(node.id, next);
        return;
      }
      const next = clampRatio((moveEvent.clientX - rect.left) / Math.max(rect.width, 1));
      onResize(node.id, next);
    };

    const finish = () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      window.removeEventListener("blur", finish);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    window.addEventListener("blur", finish);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const decrease =
      (isHorizontal && event.key === "ArrowLeft") ||
      (!isHorizontal && event.key === "ArrowUp");
    const increase =
      (isHorizontal && event.key === "ArrowRight") ||
      (!isHorizontal && event.key === "ArrowDown");
    if (!decrease && !increase) return;
    event.preventDefault();
    onResize(node.id, clampRatio(node.ratio + (increase ? RESIZE_STEP : -RESIZE_STEP)));
  };

  return (
    <div
      className={`flex h-full w-full min-h-0 min-w-0 ${
        isHorizontal ? "flex-row" : "flex-col"
      }`}
    >
      <div
        className="min-h-0 min-w-0 overflow-hidden"
        style={{ flexGrow: node.ratio, flexBasis: 0 }}
      >
        {renderLayoutNode(node.first, renderGroup, onResize)}
      </div>

      <div
        role="separator"
        tabIndex={0}
        data-editor-split={node.id}
        aria-label={`Resize editor groups ${isHorizontal ? "vertically" : "horizontally"}`}
        aria-orientation={separatorOrientation}
        aria-valuemin={Math.round(MIN_SPLIT_RATIO * 100)}
        aria-valuemax={Math.round(MAX_SPLIT_RATIO * 100)}
        aria-valuenow={Math.round(node.ratio * 100)}
        onPointerDown={handlePointerDown}
        onKeyDown={handleKeyDown}
        onDoubleClick={() => onResize(node.id, 0.5)}
        className={`shrink-0 bg-[#2f2f2f] outline-none transition-colors hover:bg-[var(--color-primary)] focus-visible:bg-[var(--color-primary)] ${
          isHorizontal ? "w-1 cursor-col-resize" : "h-1 cursor-row-resize"
        }`}
      />

      <div
        className="min-h-0 min-w-0 overflow-hidden"
        style={{ flexGrow: 1 - node.ratio, flexBasis: 0 }}
      >
        {renderLayoutNode(node.second, renderGroup, onResize)}
      </div>
    </div>
  );
}

function renderLayoutNode(
  node: EditorLayoutNode,
  renderGroup: (groupId: string) => ReactNode,
  onResize: (splitId: string, ratio: number) => void
): ReactNode {
  if (node.type === "group") return renderGroup(node.groupId);
  return (
    <EditorSplitNode key={node.id} node={node} renderGroup={renderGroup} onResize={onResize} />
  );
}

export default function EditorSplitLayout({
  node,
  renderGroup,
  onResize,
}: EditorSplitLayoutProps) {
  if (node.type === "group") return <>{renderGroup(node.groupId)}</>;
  return <EditorSplitNode node={node} renderGroup={renderGroup} onResize={onResize} />;
}
