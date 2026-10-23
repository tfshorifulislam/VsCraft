/**
 * Lightweight ANSI escape sequence parser that converts terminal output into React-renderable spans.
 */

export interface AnsiSpan {
  text: string;
  color?: string;
  bold?: boolean;
  dim?: boolean;
}

const ANSI_COLOR_MAP: Record<number, string> = {
  30: "#64748b", // black / dark slate
  31: "#ef4444", // red
  32: "#22c55e", // green
  33: "#eab308", // yellow
  34: "#3b82f6", // blue
  35: "#a855f7", // magenta / purple
  36: "#06b6d4", // cyan
  37: "#f8fafc", // white
  90: "#94a3b8", // bright black (gray)
  91: "#f87171", // bright red
  92: "#4ade80", // bright green
  93: "#fde047", // bright yellow
  94: "#60a5fa", // bright blue
  95: "#c084fc", // bright magenta
  96: "#22d3ee", // bright cyan
  97: "#ffffff", // bright white
};

export function parseAnsiToSpans(rawText: string): AnsiSpan[] {
  // Regex to match ANSI escape codes like \x1b[32m or \u001b[0m
  const ansiRegex = /(?:\u001b|\x1b)\[([0-9;]*)m/g;
  const spans: AnsiSpan[] = [];

  let lastIndex = 0;
  let currentColor: string | undefined = undefined;
  let isBold = false;
  let isDim = false;

  let match: RegExpExecArray | null;
  while ((match = ansiRegex.exec(rawText)) !== null) {
    const textChunk = rawText.slice(lastIndex, match.index);
    if (textChunk) {
      spans.push({
        text: textChunk,
        color: currentColor,
        bold: isBold,
        dim: isDim,
      });
    }

    const codeStr = match[1];
    if (!codeStr || codeStr === "0") {
      currentColor = undefined;
      isBold = false;
      isDim = false;
    } else {
      const codes = codeStr.split(";").map((c) => parseInt(c, 10));
      for (const code of codes) {
        if (code === 0) {
          currentColor = undefined;
          isBold = false;
          isDim = false;
        } else if (code === 1) {
          isBold = true;
        } else if (code === 2) {
          isDim = true;
        } else if (ANSI_COLOR_MAP[code]) {
          currentColor = ANSI_COLOR_MAP[code];
        }
      }
    }

    lastIndex = ansiRegex.lastIndex;
  }

  const remaining = rawText.slice(lastIndex);
  if (remaining) {
    spans.push({
      text: remaining,
      color: currentColor,
      bold: isBold,
      dim: isDim,
    });
  }

  return spans;
}

