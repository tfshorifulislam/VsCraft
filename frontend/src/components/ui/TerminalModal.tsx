"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { ArrowRight, X } from "lucide-react";
import Terminal, { type TerminalHandle } from "@/components/terminal/Terminal";

interface TerminalModalProps {
  open: boolean;
  projectId: string;
  projectName: string;
  onClose: () => void;
  onOpenEditor: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

const subscribeToNothing = () => () => undefined;

export default function TerminalModal({
  open,
  projectId,
  projectName,
  onClose,
  onOpenEditor,
  returnFocusRef,
}: TerminalModalProps) {
  const mounted = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false
  );
  const [sessionActive, setSessionActive] = useState(false);
  const [confirmingClose, setConfirmingClose] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<TerminalHandle | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const requestCloseRef = useRef<() => void>(() => undefined);
  const titleId = useId();
  const descriptionId = useId();

  const closeNow = useCallback(() => {
    setSessionActive(false);
    setConfirmingClose(false);
    onClose();
  }, [onClose]);

  const requestClose = useCallback(() => {
    if (sessionActive && !confirmingClose) {
      setConfirmingClose(true);
      return;
    }
    closeNow();
  }, [sessionActive, confirmingClose, closeNow]);

  useEffect(() => {
    requestCloseRef.current = requestClose;
  }, [requestClose]);

  useEffect(() => {
    if (!open) return;

    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const returnFocusTarget =
      returnFocusRef?.current ?? restoreFocusRef.current;

    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth =
      window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    const focusTimer = window.setTimeout(() => {
      terminalRef.current?.focus();
    }, 0);

    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
      returnFocusTarget?.focus();
    };
  }, [open, returnFocusRef]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        requestCloseRef.current();
        return;
      }

      if (event.key !== "Tab") return;

      const dialog = dialogRef.current;
      if (!dialog) return;

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter(
        (element) =>
          element.tabIndex !== -1 &&
          element.getAttribute("aria-hidden") !== "true"
      );

      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (!active || !dialog.contains(active)) {
        event.preventDefault();
        first.focus();
        return;
      }

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [open]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="flex h-[min(85dvh,760px)] max-h-[calc(100dvh-1.5rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-black/10 bg-[#1e1e1e] text-white shadow-2xl outline-none"
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[#2d2d2d] bg-[#252526] px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2
              id={titleId}
              className="truncate text-sm font-semibold tracking-tight text-white"
            >
              {projectName}
            </h2>
            <p id={descriptionId} className="mt-0.5 text-[11px] text-[#8a8a8a]">
              Live terminal session
            </p>
          </div>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Close terminal"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#aaaaaa] transition hover:bg-[#37373d] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0d99ff]"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1">
          <Terminal
            ref={terminalRef}
            projectId={projectId}
            autoFocus
            onSessionActiveChange={setSessionActive}
          />
        </div>

        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[#2d2d2d] bg-[#252526] px-4 py-3 sm:px-5">
          {confirmingClose ? (
            <>
              <p className="text-xs text-amber-300">
                Closing stops the running terminal session.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmingClose(false)}
                  className="rounded-lg border border-[#3c3c3c] px-3 py-2 text-xs font-medium text-[#cccccc] transition hover:bg-[#37373d] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0d99ff]"
                >
                  Keep open
                </button>
                <button
                  type="button"
                  onClick={closeNow}
                  className="rounded-lg bg-red-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
                >
                  Close session
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-xs text-[#8a8a8a]">
                Files created here sync to the database automatically.
              </p>
              <button
                type="button"
                onClick={onOpenEditor}
                className="inline-flex items-center gap-2 rounded-lg bg-[#0d99ff] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0b87e3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0d99ff]/60"
              >
                Open Editor
                <ArrowRight className="h-4 w-4" />
              </button>
            </>
          )}
        </footer>
      </div>
    </div>,
    document.body
  );
}
