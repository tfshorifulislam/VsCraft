"use client";

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

export const SIDEBAR_WIDTH_STORAGE_KEY = "code-editor-sidebar-width";
export const MIN_SIDEBAR_WIDTH = 180;
export const MAX_SIDEBAR_WIDTH = 500;
const DEFAULT_SIDEBAR_WIDTH = 256;

interface ResizableSidebarProps {
  children: ReactNode;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function readStoredSidebarWidth(): number {
  if (typeof window === "undefined") return DEFAULT_SIDEBAR_WIDTH;
  try {
    const raw = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
    if (!raw) return DEFAULT_SIDEBAR_WIDTH;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return DEFAULT_SIDEBAR_WIDTH;
    return clamp(parsed, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH);
  } catch {
    return DEFAULT_SIDEBAR_WIDTH;
  }
}

function persistSidebarWidth(width: number): void {
  try {
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(Math.round(width)));
  } catch {
    // localStorage can be unavailable in private/restricted contexts.
  }
}

function getMaxAvailableWidth(wrapper: HTMLElement | null): number {
  const parent = wrapper?.parentElement;
  if (!parent) return MAX_SIDEBAR_WIDTH;

  const activityBar = wrapper.previousElementSibling;
  const activityBarWidth =
    activityBar instanceof HTMLElement ? activityBar.getBoundingClientRect().width : 0;
  const available = parent.clientWidth - activityBarWidth;

  return Math.max(
    MIN_SIDEBAR_WIDTH,
    Math.min(MAX_SIDEBAR_WIDTH, available)
  );
}

export default function ResizableSidebar({ children }: ResizableSidebarProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const preferredWidthRef = useRef(DEFAULT_SIDEBAR_WIDTH);
  const appliedWidthRef = useRef(DEFAULT_SIDEBAR_WIDTH);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const [width, setWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [isDragging, setIsDragging] = useState(false);

  const applyWidth = useCallback((nextWidth: number) => {
    appliedWidthRef.current = nextWidth;
    setWidth(nextWidth);
  }, []);

  const applyPreferredWidth = useCallback(() => {
    const available = getMaxAvailableWidth(wrapperRef.current);
    applyWidth(Math.min(preferredWidthRef.current, available));
  }, [applyWidth]);

  useEffect(() => {
    preferredWidthRef.current = readStoredSidebarWidth();
    applyPreferredWidth();

    const parent = wrapperRef.current?.parentElement;
    if (!parent) return;

    let frame = 0;
    const observer = new ResizeObserver(() => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = 0;
        applyPreferredWidth();
      });
    });
    observer.observe(parent);

    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [applyPreferredWidth]);

  useEffect(() => {
    return () => {
      dragCleanupRef.current?.();
    };
  }, []);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;

      const wrapper = wrapperRef.current;
      if (!wrapper) return;

      event.preventDefault();
      dragCleanupRef.current?.();

      const startX = event.clientX;
      const startWidth = appliedWidthRef.current;
      const previousCursor = document.body.style.cursor;
      const previousUserSelect = document.body.style.userSelect;

      preferredWidthRef.current = startWidth;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      setIsDragging(true);

      let frame = 0;
      let pendingWidth = startWidth;

      const applyPendingWidth = () => {
        frame = 0;
        applyWidth(pendingWidth);
      };

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const maxWidth = getMaxAvailableWidth(wrapper);
        pendingWidth = clamp(
          startWidth + moveEvent.clientX - startX,
          MIN_SIDEBAR_WIDTH,
          maxWidth
        );
        preferredWidthRef.current = pendingWidth;
        if (!frame) {
          frame = requestAnimationFrame(applyPendingWidth);
        }
      };

      const finish = () => {
        if (frame) {
          cancelAnimationFrame(frame);
          frame = 0;
          applyWidth(pendingWidth);
        }
        document.body.style.cursor = previousCursor;
        document.body.style.userSelect = previousUserSelect;
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);
        window.removeEventListener("blur", finish);
        persistSidebarWidth(preferredWidthRef.current);
        dragCleanupRef.current = null;
        setIsDragging(false);
      };

      dragCleanupRef.current = finish;
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", finish);
      window.addEventListener("pointercancel", finish);
      window.addEventListener("blur", finish);
    },
    [applyWidth]
  );

  return (
    <div
      ref={wrapperRef}
      data-resizable-sidebar
      className="relative flex shrink-0 z-20"
      style={{ width }}
    >
      <aside className="h-full w-full bg-[#252526] border-r border-[#1e1e1e] flex flex-col overflow-hidden">
        {children}
      </aside>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        aria-valuemin={MIN_SIDEBAR_WIDTH}
        aria-valuemax={MAX_SIDEBAR_WIDTH}
        aria-valuenow={Math.round(width)}
        data-sidebar-resizer
        onPointerDown={handlePointerDown}
        className={`absolute inset-y-0 right-0 z-30 w-1.5 translate-x-1/2 cursor-col-resize touch-none select-none transition-colors ${
          isDragging
            ? "bg-[var(--color-primary)]/70"
            : "bg-transparent hover:bg-[var(--color-primary)]/50"
        }`}
      />
    </div>
  );
}

