"use client";

import React, { useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import type { OnMount, BeforeMount } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import { ProjectFile, EditorSettings, Project } from "@/types/editor";
import { configureMonacoTypeScript } from "@/lib/monaco/typescriptService";
import {
  registerHtmlJsxTagCompletion,
  setupAutoCloseTagOnTyping,
  setupEmmetTabExpansion,
} from "@/lib/monaco/tagCompletionService";
import ImagePreviewer, { isImageFile } from "./ImagePreviewer";
import { formatCharacterCount, isLargeFileContent } from "@/lib/editor/largeFile";

// Dynamically import Editor to completely eliminate SSR issues
const Editor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-[#1e1e1e] text-neutral-400 font-mono text-xs">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-[var(--color-primary)] animate-ping" />
        <span>Loading Monaco Editor...</span>
      </div>
    </div>
  ),
});

function buildEditorOptions(
  settings: EditorSettings,
  isLargeFile: boolean
): Monaco.editor.IStandaloneEditorConstructionOptions {
  const effectiveFontFamily = settings.fontFamily || '"Consolas", "Courier New", monospace';
  const effectiveFontSize = settings.fontSize || 14;
  const effectiveLineHeight = Math.round(effectiveFontSize * (settings.lineHeight || 1.5));

  const base: Monaco.editor.IStandaloneEditorConstructionOptions = {
    automaticLayout: true,
    fontFamily: effectiveFontFamily,
    fontSize: effectiveFontSize,
    lineHeight: effectiveLineHeight,
    letterSpacing: 0,
    fontLigatures: false,
    wordWrap: settings.wordWrap,
    minimap: { enabled: settings.minimap },
    tabSize: settings.tabSize,
    lineNumbers: "on",
    padding: { top: 8, bottom: 8 },
    smoothScrolling: true,
    cursorBlinking: "smooth",
    cursorSmoothCaretAnimation: "on",
    formatOnPaste: true,
    formatOnType: true,
    renderWhitespace: "selection",
    scrollBeyondLastLine: false,
    tabCompletion: "on",
    snippetSuggestions: "top",
    suggest: {
      showSnippets: true,
      snippetsPreventQuickSuggestions: false,
      localityBonus: true,
      shareSuggestSelections: true,
      showIcons: true,
    },
    quickSuggestions: {
      other: true,
      comments: true,
      strings: true,
    },
    quickSuggestionsDelay: 10,
    acceptSuggestionOnEnter: "on",
    suggestSelection: "first",
    parameterHints: {
      enabled: true,
      cycle: true,
    },
    hover: {
      delay: 300,
    },
    bracketPairColorization: {
      enabled: true,
    },
    matchBrackets: "always",
    autoClosingBrackets: "always",
    autoClosingQuotes: "always",
    autoClosingDelete: "always",
    autoClosingOvertype: "always",
    autoIndent: "full",
    guides: {
      bracketPairs: true,
      indentation: true,
    },
    folding: true,
    links: true,
    largeFileOptimizations: true,
  };

  if (!isLargeFile) return base;

  return {
    ...base,
    wordWrap: "off",
    minimap: { enabled: false },
    smoothScrolling: false,
    cursorSmoothCaretAnimation: "off",
    formatOnPaste: false,
    formatOnType: false,
    renderWhitespace: "none",
    tabCompletion: "off",
    quickSuggestions: false,
    suggestOnTriggerCharacters: false,
    acceptSuggestionOnEnter: "off",
    parameterHints: { enabled: false },
    hover: { enabled: "off" },
    bracketPairColorization: { enabled: false },
    matchBrackets: "never",
    guides: { bracketPairs: false, indentation: false },
    folding: false,
    links: false,
    colorDecorators: false,
    codeLens: false,
    occurrencesHighlight: "off",
    selectionHighlight: false,
    stickyScroll: { enabled: false },
    renderValidationDecorations: "off",
    maxTokenizationLineLength: 5_000,
  };
}

interface MonacoEditorProps {
  activeFile: ProjectFile | null;
  project?: Project | null;
  settings: EditorSettings;
  onChange: (newContent: string) => void;
  onSave: () => void;
  onCursorChange?: (line: number, column: number) => void;
}

function MonacoEditorComponent({
  activeFile,
  project,
  settings,
  onChange,
  onSave,
  onCursorChange,
}: MonacoEditorProps) {
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const autoCloseDisposableRef = useRef<Monaco.IDisposable | null>(null);
  const emmetTabDisposableRef = useRef<Monaco.IDisposable | null>(null);
  const viewStatesRef = useRef<Map<string, Monaco.editor.ICodeEditorViewState>>(new Map());
  const activeFileIdRef = useRef<string | null>(activeFile?.id || null);
  const lastProjectFilesRef = useRef<string>("");
  const lastKnownContentRef = useRef<string>(activeFile?.content || "");
  const isLargeFile = activeFile ? isLargeFileContent(activeFile.content) : false;

  const handleEditorChange = (value: string | undefined) => {
    const val = value || "";
    lastKnownContentRef.current = val;
    onChange(val);
  };

  const handleBeforeMount: BeforeMount = (monaco) => {
    monacoRef.current = monaco;
    registerHtmlJsxTagCompletion(monaco);
  };

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Restore saved view state if switching back to an already opened file
    if (activeFile?.id && viewStatesRef.current.has(activeFile.id)) {
      const savedVs = viewStatesRef.current.get(activeFile.id);
      if (savedVs) {
        editor.restoreViewState(savedVs);
      }
    }

    // Configure TypeScript language service and workspace models
    if (project) {
      configureMonacoTypeScript(monaco, project);
    }

    // Register VS Code-style HTML & JSX/TSX tag completion providers
    registerHtmlJsxTagCompletion(monaco);

    // Setup auto-close tag on typing `>`
    if (autoCloseDisposableRef.current) {
      autoCloseDisposableRef.current.dispose();
    }
    autoCloseDisposableRef.current = setupAutoCloseTagOnTyping(editor, monaco);

    // Setup Tab expansion for Emmet abbreviations
    if (emmetTabDisposableRef.current) {
      emmetTabDisposableRef.current.dispose();
    }
    emmetTabDisposableRef.current = setupEmmetTabExpansion(editor, monaco);

    // Register Save command
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      onSave();
    });

    // Listen to cursor position changes
    editor.onDidChangeCursorPosition((e) => {
      if (onCursorChange) {
        onCursorChange(e.position.lineNumber, e.position.column);
      }
    });

    editor.updateOptions(buildEditorOptions(settings, isLargeFile));
  };

  // Cleanup disposables on unmount
  useEffect(() => {
    return () => {
      if (autoCloseDisposableRef.current) {
        autoCloseDisposableRef.current.dispose();
        autoCloseDisposableRef.current = null;
      }
      if (emmetTabDisposableRef.current) {
        emmetTabDisposableRef.current.dispose();
        emmetTabDisposableRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    editorRef.current?.updateOptions(buildEditorOptions(settings, isLargeFile));
  }, [settings, isLargeFile]);

  // Preserve and restore view state across file transitions
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !activeFile) return;
    if (activeFileIdRef.current === activeFile.id) return;

    const previousFileId = activeFileIdRef.current;
    if (previousFileId) {
      const currentVs = editor.saveViewState();
      if (currentVs) {
        viewStatesRef.current.set(previousFileId, currentVs);
      }
    }

    activeFileIdRef.current = activeFile.id;
    lastKnownContentRef.current = activeFile.content;

    const targetVs = viewStatesRef.current.get(activeFile.id);
    if (targetVs) {
      editor.restoreViewState(targetVs);
    }
  }, [activeFile]);

  // Handle genuine external updates (e.g. AI Assistant diff, file revert)
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !activeFile) return;

    if (activeFile.content !== lastKnownContentRef.current) {
      lastKnownContentRef.current = activeFile.content;
      const model = editor.getModel();
      if (model && model.getValue() !== activeFile.content) {
        const viewState = editor.saveViewState();
        model.pushEditOperations(
          [],
          [{ range: model.getFullModelRange(), text: activeFile.content }],
          () => null
        );
        if (viewState) {
          editor.restoreViewState(viewState);
        }
      }
    }
  }, [activeFile]);

  // Synchronize TypeScript language service and workspace models ONLY when files list changes
  useEffect(() => {
    if (!monacoRef.current || !project) return;
    const loadedIds = new Set(project.loadedFileIds || []);
    const fileListSig = project.files
      .map(
        (f) =>
          `${f.id}:${f.path}:${f.isFolder ? "d" : "f"}:${
            project.contentLazy && !f.isFolder ? (loadedIds.has(f.id) ? "l" : "u") : "a"
          }`
      )
      .join(";");
    if (fileListSig === lastProjectFilesRef.current) return;
    lastProjectFilesRef.current = fileListSig;

    configureMonacoTypeScript(monacoRef.current, project);
  }, [project]);

  if (!activeFile) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-[#1e1e1e] text-neutral-500 font-sans p-6 text-center select-none">
        <div className="w-12 h-12 rounded-xl bg-neutral-800 flex items-center justify-center text-neutral-400 mb-3 border border-neutral-700">
          <span className="font-mono text-xl">⌘</span>
        </div>
        <h3 className="text-sm font-semibold text-neutral-300">No File Open</h3>
        <p className="text-xs text-neutral-500 max-w-xs mt-1">
          Select a file from the Explorer or press <kbd className="px-1.5 py-0.5 bg-neutral-800 border border-neutral-700 rounded text-neutral-300">Ctrl/Cmd + P</kbd> to quick open.
        </p>
      </div>
    );
  }

  // Handle binary and vector images with dedicated previewer
  if (isImageFile(activeFile)) {
    return <ImagePreviewer key={activeFile.id} activeFile={activeFile} project={project} />;
  }

  // Determine language mode
  const getLanguage = (file: ProjectFile): string => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    switch (ext) {
      case "tsx":
      case "ts":
        return "typescript";
      case "jsx":
      case "js":
        return "javascript";
      case "html":
        return "html";
      case "css":
        return "css";
      case "json":
        return "json";
      case "md":
        return "markdown";
      case "py":
        return "python";
      default:
        return "plaintext";
    }
  };

  const normalizedPath = activeFile.path.startsWith("/") ? activeFile.path : `/${activeFile.path}`;
  const fileUriString = `file://${normalizedPath}`;

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#1e1e1e]">
      <Editor
        height="100%"
        width="100%"
        theme={settings.theme === "vs-dark" ? "vs-dark" : "light"}
        language={isLargeFile ? "plaintext" : getLanguage(activeFile)}
        path={fileUriString}
        defaultValue={activeFile.content}
        onChange={handleEditorChange}
        beforeMount={handleBeforeMount}
        onMount={handleEditorMount}
        options={buildEditorOptions(settings, isLargeFile)}
      />
      {isLargeFile && (
        <div className="pointer-events-none absolute right-2 top-2 z-10 rounded border border-amber-500/40 bg-[#2a2417]/95 px-2 py-1 text-[10px] font-mono text-amber-200 shadow-lg">
          Large file mode · {formatCharacterCount(activeFile.content.length)} · expensive syntax
          features reduced
        </div>
      )}
    </div>
  );
}

export default React.memo(MonacoEditorComponent);

