"use client";

import React, { ReactNode, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { ReactLenis } from "lenis/react";

interface SmoothScrollProps {
  children: ReactNode;
}

function subscribeReducedMotion(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  mediaQuery.addEventListener("change", callback);
  return () => {
    mediaQuery.removeEventListener("change", callback);
  };
}

function getReducedMotionSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getReducedMotionServerSnapshot(): boolean {
  return false;
}

export default function SmoothScroll({ children }: SmoothScrollProps) {
  const pathname = usePathname();
  const isReducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot
  );

  // When reduced motion is preferred or inside app routes (/editor or /projects),
  // use native browser scrolling without animation so IDE panels, project grids, and Monaco operate smoothly.
  if (
    isReducedMotion ||
    pathname?.startsWith("/editor") ||
    pathname?.startsWith("/projects")
  ) {
    return <>{children}</>;
  }

  return (
    <ReactLenis
      root
      options={{
        lerp: 0.1,
        smoothWheel: true,
        syncTouch: false, // preserves native touch scrolling on mobile devices
        respectReducedMotion: true,
        anchors: {
          offset: -80, // account for sticky navbar height (64px) + breathing room
        },
      }}
    >
      {children}
    </ReactLenis>
  );
}

